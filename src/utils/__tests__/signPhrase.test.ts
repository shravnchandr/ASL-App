// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as ort from 'onnxruntime-web/wasm';
import {
  BLANK_INDEX,
  LANDMARK_ORDER,
  MAX_FRAMES,
  MIN_FRAMES,
  N_FEATURES,
  N_POSITIONS,
  NUM_CLASSES,
  PhraseSegmenter,
  assignHandSlots,
  buildFeatures,
  decodeGreedy,
  formatGloss,
  handSpan,
  segmentIndices,
  keepDominantHand,
  medianShoulderRatio,
  portraitCrop,
  shoulderRatio,
  subsampleIndices,
  toRecording,
  type PhraseFrame,
  type Point,
} from '../signPhrase';

interface Fixture {
  name: string;
  label: string;
  frames: PhraseFrame[];
  /** Current export format: frame indices used, and subsample positions (or null). */
  segment?: number[];
  subsample?: number[] | null;
  /** Older exports: inclusive first/last frame index. */
  trim?: [number, number];
  features: number[][];
  logits: number[][] | null;
  decoded: string[] | null;
}

const readJson = <T,>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
const MODEL_DIR = 'public/models/sign-phrases/';
const fixtures = ['100015657', '1001373962', 'concat'].map(name =>
  readJson<Fixture>(`src/test/fixtures/phrases05/${name}.json`)
);
const labels = readJson<string[]>(`${MODEL_DIR}labels.json`);
const spec = readJson<{ in_feat: number; landmarks: [string, number][]; max_frames: number; blank: number }>(
  `${MODEL_DIR}preprocess.json`
);

const range = (first: number, last: number) => Array.from({ length: last - first + 1 }, (_, i) => first + i);
const expectedSegment = (fx: Fixture) => fx.segment ?? range(fx.trim![0], fx.trim![1]);
const segmentFrames = (fx: Fixture) => segmentIndices(fx.frames).map(i => fx.frames[i]);

function maxAbsDiff(actual: ArrayLike<number>, expected: number[][]): number {
  const width = expected[0].length;
  let max = 0;
  expected.forEach((row, t) => row.forEach((v, i) => {
    max = Math.max(max, Math.abs(actual[t * width + i] - v));
  }));
  return max;
}

describe('sign-phrase preprocessing', () => {
  it('matches the exported preprocessing spec', () => {
    expect(LANDMARK_ORDER).toEqual(spec.landmarks);
    expect(N_FEATURES).toBe(spec.in_feat);
    expect(MAX_FRAMES).toBe(spec.max_frames);
    expect(BLANK_INDEX).toBe(spec.blank);
    expect(labels).toHaveLength(NUM_CLASSES - 1);
  });

  it.each(fixtures)('reproduces fixture $name (segment, subsample, features, presence)', fx => {
    expect(segmentIndices(fx.frames)).toEqual(expectedSegment(fx));

    const { features, T, subsample } = buildFeatures(segmentFrames(fx));
    expect(subsample).toEqual(fx.subsample ?? null);
    expect(T).toBe(fx.features.length);
    expect(features).toHaveLength(T * N_FEATURES);
    expect(maxAbsDiff(features, fx.features)).toBeLessThan(1e-5);
    for (let t = 0; t < T; t++) {
      const presence = Array.from(features.subarray(t * N_FEATURES + 2 * N_POSITIONS, (t + 1) * N_FEATURES));
      expect(presence).toEqual(fx.features[t].slice(2 * N_POSITIONS));
    }
  });

  it('segments after dropping frames without a pose', () => {
    const pose: Point[] = Array.from({ length: 33 }, () => [0.5, 0.5, 0]);
    const hand: Point[] = Array.from({ length: 21 }, () => [0.4, 0.6, 0]);
    const f = (hasPose: boolean, hasHand: boolean): PhraseFrame =>
      ({ pose: hasPose ? pose : null, left_hand: null, right_hand: hasHand ? hand : null, face: null });
    // A hand in a pose-less frame does not start or end the segment
    const frames = [f(false, true), f(true, false), f(true, true), f(false, false), f(true, false), f(true, true), f(true, false), f(false, true)];
    expect(segmentIndices(frames)).toEqual([2, 4, 5]);
    expect(segmentIndices([f(true, false), f(false, true)])).toEqual([]);
  });

  it('drops frames without a pose', () => {
    const [fx] = fixtures;
    const frames = fx.frames.slice(0, 12).map((f, i) => (i === 5 ? { ...f, pose: null } : f));
    expect(buildFeatures(frames).T).toBe(11);
  });

  it('subsamples long segments to 384 frames before the deltas', () => {
    expect(subsampleIndices(10)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const idx = subsampleIndices(1000);
    expect(idx).toHaveLength(384);
    expect(idx[0]).toBe(0);
    expect(idx[383]).toBe(999);
    expect(idx[100]).toBe(Math.floor((100 * 999) / 383));

    const [fx] = fixtures;
    const long = Array.from({ length: 500 }, (_, i) => fx.frames[i % fx.frames.length]);
    const out = buildFeatures(long);
    expect(out.T).toBe(384);
    expect(out.subsample).toEqual(subsampleIndices(500));
    expect(buildFeatures(long.slice(0, 384)).subsample).toBeNull();
  });

  it('hold-fills before subsampling, with presence from the kept frame', () => {
    const pose: Point[] = Array.from({ length: 33 }, () => [0.5, 0.5, 0]);
    const handAt = (x: number): Point[] => Array.from({ length: 21 }, () => [x, 0.6, 0]);
    // 767 frames keep positions 0, 2, 4, …: the hand is seen only at odd positions
    // (dropped by the subsample), so every kept frame holds a value filled from a
    // dropped neighbour and has presence 0.
    const frames: PhraseFrame[] = Array.from({ length: 767 }, (_, i) => ({
      pose,
      left_hand: null,
      right_hand: i % 2 === 1 ? handAt(0.5 + i / 1000) : null,
      face: null,
    }));
    const { features, T, subsample } = buildFeatures(frames);
    expect(subsample![1]).toBe(2);
    const rightWristX = 3 * (21 + 33); // first right-hand value in a row
    for (const t of [0, 1, 100, T - 1]) {
      const row = t * N_FEATURES;
      const source = subsample![t] === 0 ? 1 : subsample![t] - 1; // previous detection, or the next for the first frame
      expect(features[row + rightWristX]).toBeCloseTo(source / 1000, 6);
      expect(features[row + 2 * N_POSITIONS + 1]).toBe(0);
    }
    // Δ1 is taken between kept frames, after the subsample
    expect(features[N_FEATURES + N_POSITIONS + rightWristX]).toBeCloseTo(0, 6);
    expect(features[2 * N_FEATURES + N_POSITIONS + rightWristX]).toBeCloseTo(0.002, 6);
  });
});

describe('sign-phrase model', () => {
  it('reproduces fixture logits and decodes in onnxruntime-web', async () => {
    ort.env.wasm.numThreads = 1;
    const session = await ort.InferenceSession.create(readFileSync(`${MODEL_DIR}sign_ctc.onnx`), {
      executionProviders: ['wasm'],
    });
    for (const fx of fixtures) {
      if (!fx.logits) {
        expect(fx.features.length).toBeLessThan(MIN_FRAMES);
        continue;
      }
      // Our own features, so the test covers preprocessing → model → decode
      const { features, T } = buildFeatures(segmentFrames(fx));
      const { logits } = await session.run({
        features: new ort.Tensor('float32', features, [1, T, N_FEATURES]),
      });
      expect(logits.dims).toEqual([1, T, NUM_CLASSES]);
      const data = logits.data as Float32Array;
      expect(maxAbsDiff(data, fx.logits)).toBeLessThan(1e-3);
      expect(decodeGreedy(data, T, labels)).toEqual(fx.decoded);
    }
    await session.release();
  }, 30_000);

  it('greedy-decodes: collapses repeats and drops blanks', () => {
    const vocab = ['a', 'b'];
    const row = (c: number) => [0, 1, 2].map(i => (i === c ? 1 : 0));
    // a a blank a b b blank → a a b
    const logits = [0, 0, 2, 0, 1, 1, 2].flatMap(row);
    expect(decodeGreedy(logits, 7, vocab)).toEqual(['a', 'a', 'b']);
  });

  it('formats run-together glosses for display', () => {
    expect(formatGloss('haveto')).toBe('have to');
    expect(formatGloss('cloud')).toBe('cloud');
  });
});

describe('hand slot assignment', () => {
  const pose: Point[] = Array.from({ length: 33 }, () => [0.5, 0.5, 0]);
  pose[15] = [0.7, 0.6, 0]; // signer's left wrist: larger x on an unmirrored frame
  pose[16] = [0.3, 0.6, 0];
  const handAt = (x: number, y: number): Point[] => Array.from({ length: 21 }, () => [x, y, 0]);

  it('puts a single hand in the slot of the nearer pose wrist', () => {
    const left = handAt(0.72, 0.58);
    expect(assignHandSlots([left], pose)).toEqual({ left_hand: left, right_hand: null });
    const right = handAt(0.28, 0.61);
    expect(assignHandSlots([right], pose)).toEqual({ left_hand: null, right_hand: right });
  });

  it('never puts two hands in one slot', () => {
    // Both hands nearer the left wrist: the smaller total distance decides
    const a = handAt(0.68, 0.6);
    const b = handAt(0.55, 0.6);
    expect(assignHandSlots([a, b], pose)).toEqual({ left_hand: a, right_hand: b });
    expect(assignHandSlots([b, a], pose)).toEqual({ left_hand: a, right_hand: b });
  });

  it('handles no hands', () => {
    expect(assignHandSlots([], pose)).toEqual({ left_hand: null, right_hand: null });
  });
});

describe('PhraseSegmenter', () => {
  const pose: Point[] = Array.from({ length: 33 }, () => [0.5, 0.5, 0]);
  const hand: Point[] = Array.from({ length: 21 }, () => [0.4, 0.6, 0]);
  const idle: PhraseFrame = { pose, left_hand: null, right_hand: null, face: null };
  const signing: PhraseFrame = { ...idle, right_hand: hand };

  it('emits first-to-last hand frame after a second without hands', () => {
    const seg = new PhraseSegmenter();
    let t = 0;
    const step = (f: PhraseFrame | null) => seg.push(f, (t += 100));

    expect(step(idle)).toBeNull(); // before any hand: not buffered
    expect(seg.isActive).toBe(false);
    for (let i = 0; i < 5; i++) expect(step(signing)).toBeNull();
    expect(step(idle)).toBeNull(); // short gap stays inside the segment
    expect(step(null)).toBeNull(); // no pose: dropped
    for (let i = 0; i < 5; i++) expect(step(signing)).toBeNull();
    let out = null;
    for (let i = 0; i < 10 && !out; i++) out = step(idle);

    expect(out).not.toBeNull();
    expect(out!.frames).toHaveLength(11); // 5 + gap frame + 5, trailing idle trimmed
    expect(out!.frames[5]).toBe(idle);
    expect(out!.fps).toBeCloseTo((10 * 1000) / 1100, 5);
    expect(seg.isActive).toBe(false);
  });

  it('flush ends the segment immediately', () => {
    const seg = new PhraseSegmenter();
    expect(seg.flush()).toBeNull();
    seg.push(signing, 0);
    seg.push(signing, 33);
    expect(seg.flush()!.frames).toHaveLength(2);
  });
});

describe('toRecording', () => {
  it('writes the fixture format with a 468-point face', () => {
    const face: Point[] = Array.from({ length: 478 }, () => [0.123456789, 0.5, 0]);
    const pose: Point[] = Array.from({ length: 33 }, () => [0.5, 0.5, 0]);
    const rec = toRecording([{ pose, left_hand: null, right_hand: null, face }], 'cloud have', { fps: 30 });
    expect(rec.label).toBe('cloud have');
    expect(rec.frames[0].face).toHaveLength(468);
    expect(rec.frames[0].face![0][0]).toBe(0.1234568);
    expect(rec.frames[0].left_hand).toBeNull();
    expect(handSpan(rec.frames)).toBeNull();
  });
});

describe('portrait framing', () => {
  it('centre-crops landscape frames to 3:4 portrait', () => {
    expect(portraitCrop(640, 480)).toEqual({ x: 140, y: 0, width: 360, height: 480 });
    expect(portraitCrop(1280, 720)).toEqual({ x: 370, y: 0, width: 540, height: 720 });
  });

  it('keeps 3:4 frames whole and trims taller ones', () => {
    expect(portraitCrop(480, 640)).toEqual({ x: 0, y: 0, width: 480, height: 640 });
    expect(portraitCrop(720, 1280)).toEqual({ x: 0, y: 160, width: 720, height: 960 });
  });

  it('measures the shoulder ratio the training data has (about 0.40)', () => {
    for (const fx of fixtures) {
      const ratio = medianShoulderRatio(fx.frames);
      expect(ratio).toBeGreaterThan(0.3);
      expect(ratio).toBeLessThan(0.5);
    }
    const pose: Point[] = Array.from({ length: 33 }, () => [0.5, 0.3, 0]);
    pose[11] = [0.8, 0.54, 0];
    pose[12] = [0.2, 0.54, 0];
    expect(shoulderRatio(pose)).toBeCloseTo(0.4, 6);
    expect(medianShoulderRatio([])).toBeNaN();
  });
});

describe('one hand only', () => {
  const pose: Point[] = Array.from({ length: 33 }, () => [0.5, 0.5, 0]);
  const handAt = (x: number, y: number): Point[] => Array.from({ length: 21 }, () => [x, y, 0.1]);
  const frame = (left: Point[] | null, right: Point[] | null): PhraseFrame =>
    ({ pose, left_hand: left, right_hand: right, face: null });
  // Right hand moves; left hand rests in view, and appears one frame earlier
  const frames = [
    frame(handAt(0.7, 0.8), null),
    ...Array.from({ length: 10 }, (_, i) => frame(handAt(0.7, 0.8), handAt(0.3 + i * 0.02, 0.6))),
    frame(handAt(0.7, 0.8), null),
  ];

  it('keeps the hand with more wrist motion and re-trims to it', () => {
    const out = keepDominantHand(frames)!;
    expect(out.kept).toBe('right_hand');
    expect(out.frames).toHaveLength(10);
    expect(out.frames.every(f => f.left_hand === null && f.right_hand !== null)).toBe(true);
  });

  it('gives the dropped hand presence 0 and coordinates 0 in every frame', () => {
    const { features, T } = buildFeatures(keepDominantHand(frames)!.frames);
    for (let t = 0; t < T; t++) {
      const row = features.subarray(t * N_FEATURES, (t + 1) * N_FEATURES);
      expect(Array.from(row.subarray(2 * N_POSITIONS))).toEqual([0, 1]);
      expect(row.subarray(0, 63).every(v => v === 0)).toBe(true); // left-hand positions
      expect(row.subarray(N_POSITIONS, N_POSITIONS + 63).every(v => v === 0)).toBe(true); // and deltas
    }
  });

  it('honours a chosen hand, unless that hand was never detected', () => {
    expect(keepDominantHand(frames, 'left_hand')!.kept).toBe('left_hand');
    expect(keepDominantHand(frames, 'left_hand')!.frames).toHaveLength(12);
    const rightOnly = frames.slice(1, 11).map(f => ({ ...f, left_hand: null }));
    expect(keepDominantHand(rightOnly, 'left_hand')!.kept).toBe('right_hand');
  });

  it('leaves single-hand segments unchanged and returns null without hands', () => {
    const [fx] = fixtures; // left hand only
    const out = keepDominantHand(segmentFrames(fx))!;
    expect(out.kept).toBe('left_hand');
    expect(maxAbsDiff(buildFeatures(out.frames).features, fx.features)).toBeLessThan(1e-5);
    expect(keepDominantHand([frame(null, null)])).toBeNull();
  });
});
