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
  resampleFrames,
  resamplePlan,
  type ResampleStep,
  assignHandSlots,
  buildFeatures,
  decodeGreedy,
  decodeWithScores,
  UNSURE_BELOW,
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
// The legacy bundle; frozen phrases07 (contract v4) is covered by signPhraseContract.test.ts
const MODEL_DIR = 'public/models/sign-phrases/phrases05/';
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

    const { features, T, subsample } = buildFeatures(segmentFrames(fx), 'legacy');
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
      const { features, T } = buildFeatures(segmentFrames(fx), 'legacy');
      const { logits } = await session.run({
        features: new ort.Tensor('float32', features, [1, T, N_FEATURES]),
      });
      expect(logits.dims).toEqual([1, T, NUM_CLASSES]);
      const data = logits.data as Float32Array;
      expect(maxAbsDiff(data, fx.logits)).toBeLessThan(1e-3);
      expect(decodeGreedy(data, T, labels)).toEqual(fx.decoded);

      // The scored decode emits the same signs; scores are probabilities, best first
      const scored = decodeWithScores(data, T, labels);
      expect(scored.signs.map(s => s.gloss)).toEqual(fx.decoded);
      expect(scored.closest).toHaveLength(3);
      for (const sign of scored.signs) {
        expect(sign.score).toBeGreaterThan(0);
        expect(sign.score).toBeLessThanOrEqual(1);
        expect(sign.alternatives).toHaveLength(2);
        expect(sign.alternatives.every(a => a.gloss !== sign.gloss)).toBe(true);
        expect(sign.alternatives[0].score).toBeGreaterThanOrEqual(sign.alternatives[1].score);
      }
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

  describe('scored decode', () => {
    const vocab = ['a', 'b', 'c'];
    // Rows of probabilities over [a, b, c, blank], given as logits
    const rows = (probs: number[][]) => probs.flatMap(r => r.map(Math.log));

    it('pools a one-sign segment over every frame, blank excluded', () => {
      const logits = rows([
        [0.05, 0.15, 0.1, 0.7],  // blank wins, but b is seen here
        [0.8, 0.1, 0.05, 0.05],  // a emitted
        [0.6, 0.2, 0.1, 0.1],
        [0.1, 0.05, 0.25, 0.6],
      ]);
      const { signs, closest } = decodeWithScores(logits, 4, vocab);
      expect(signs).toHaveLength(1);
      expect(signs[0].gloss).toBe('a');
      expect(signs[0].score).toBeCloseTo(0.8, 5);
      expect(signs[0].unsure).toBe(false);
      expect(signs[0].alternatives.map(x => x.gloss)).toEqual(['c', 'b']);
      expect(signs[0].alternatives[0].score).toBeCloseTo(0.25, 5);
      expect(closest.map(x => x.gloss)).toEqual(['a', 'c', 'b']);
    });

    it('scores each sign of a phrase over its own stretch and flags weak ones', () => {
      const logits = rows([
        [0.9, 0.04, 0.03, 0.03],   // a
        [0.1, 0.1, 0.1, 0.7],
        [0.1, 0.1, 0.1, 0.7],
        [0.2, 0.45, 0.3, 0.05],    // b, weak
      ]);
      const { signs } = decodeWithScores(logits, 4, vocab);
      expect(signs.map(s => s.gloss)).toEqual(['a', 'b']);
      expect(signs[0].score).toBeCloseTo(0.9, 5);
      expect(signs[0].unsure).toBe(false);
      // b's stretch is frames 2–3, so a's 0.9 in frame 0 does not leak into its runners-up
      expect(signs[1].score).toBeCloseTo(0.45, 5);
      expect(signs[1].unsure).toBe(0.45 < UNSURE_BELOW);
      expect(signs[1].alternatives[0]).toMatchObject({ gloss: 'c' });
      expect(signs[1].alternatives[0].score).toBeCloseTo(0.3, 5);
    });

    it('offers the closest signs when nothing is emitted', () => {
      const logits = rows([[0.1, 0.3, 0.05, 0.55], [0.2, 0.1, 0.1, 0.6]]);
      const { signs, closest } = decodeWithScores(logits, 2, vocab);
      expect(signs).toEqual([]);
      expect(closest.map(x => x.gloss)).toEqual(['b', 'a', 'c']);
      expect(closest[0].score).toBeCloseTo(0.3, 5);
    });
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

  it('emits the utterance with the frames around it after a second without hands', () => {
    const seg = new PhraseSegmenter();
    let t = 0;
    const step = (f: PhraseFrame | null) => seg.push(f, (t += 100));

    for (let i = 0; i < 30; i++) expect(step(idle)).toBeNull(); // before any hand: only context
    expect(seg.isActive).toBe(false);
    for (let i = 0; i < 5; i++) expect(step(signing)).toBeNull();
    expect(seg.isActive).toBe(true);
    expect(step(idle)).toBeNull(); // short gap stays inside the segment
    expect(step(null)).toBeNull(); // no pose: stays in the stream
    for (let i = 0; i < 5; i++) expect(step(signing)).toBeNull();
    let out = null;
    for (let i = 0; i < 10 && !out; i++) out = step(idle);

    expect(out).not.toBeNull();
    // the second before the first hand, 5 + two gap frames + 5, and the second after the last
    expect(out!.frames).toHaveLength(11 + 12 + 10);
    expect(handSpan(out!.frames)).toEqual([11, 22]);
    expect(out!.frames[16]).toBe(idle);
    expect(out!.frames[17].pose).toBeNull(); // no pose: kept in place, all parts null
    expect(out!.times).toHaveLength(33);
    expect(out!.times[0]).toBe(2000);
    expect(out!.fps).toBeCloseTo(10, 5);
    expect(seg.isActive).toBe(false);
  });

  it('starts the next segment with the frames that followed the last one', () => {
    const seg = new PhraseSegmenter();
    let t = 0;
    const step = (f: PhraseFrame | null) => seg.push(f, (t += 100));
    step(signing);
    let first = null;
    while (!first) first = step(idle);
    expect(first.frames).toHaveLength(11);
    step(signing);
    const second = seg.flush()!;
    expect(second.frames).toHaveLength(11); // ten idle frames of lead-in, then the hand
    expect(second.times[0]).toBe(first.times[1]);
  });

  it('ends the segment at the last frame before the stream stalled', () => {
    const seg = new PhraseSegmenter();
    for (let t = 0; t < 500; t += 100) expect(seg.push(signing, t)).toBeNull();
    // The tab was hidden for ten minutes; the next frame arrives with a hand
    const out = seg.push(signing, 600_400);
    expect(out!.times).toEqual([0, 100, 200, 300, 400]); // the late frame is not in it
    expect(resampleFrames(out!.frames, out!.times)).toHaveLength(13);
    // The late frame starts the next segment on its own
    expect(seg.isActive).toBe(true);
    expect(seg.flush()!.times).toEqual([600_400]);
  });

  it('ends the segment when the clock goes back (the camera restarted)', () => {
    const seg = new PhraseSegmenter();
    seg.push(signing, 5000);
    seg.push(signing, 5100);
    const out = seg.push(idle, 40);
    expect(out!.times).toEqual([5000, 5100]);
    expect(seg.isActive).toBe(false);
    expect(seg.push(signing, 140)).toBeNull();
    expect(seg.flush()!.times).toEqual([40, 140]);
  });

  it('a stall before any hand only drops the stale context', () => {
    const seg = new PhraseSegmenter();
    seg.push(idle, 0);
    expect(seg.push(idle, 60_000)).toBeNull();
    seg.push(signing, 60_100);
    expect(seg.flush()!.times).toEqual([60_000, 60_100]);
  });

  it('flush ends the segment immediately', () => {
    const seg = new PhraseSegmenter();
    expect(seg.flush()).toBeNull();
    seg.push(idle, -40);
    expect(seg.flush()).toBeNull(); // no hand yet
    seg.push(signing, 0);
    seg.push(signing, 33);
    const out = seg.flush()!;
    expect(out.frames).toHaveLength(3);
    expect(out.times).toEqual([-40, 0, 33]);
    expect(seg.isActive).toBe(false);
  });
});

describe('live timing rule (30 fps grid by capture timestamp)', () => {
  const vectors = JSON.parse(readFileSync('src/test/fixtures/frozen-phrases07/timing_vectors.json', 'utf8')) as {
    cases: { name: string; timestamps_ms: number[]; plan: ResampleStep[] }[];
  };

  it.each(vectors.cases)('reproduces the reference plan for $name', ({ timestamps_ms, plan }) => {
    expect(resamplePlan(timestamps_ms)).toEqual(plan);
  });

  // A hand moving steadily to the right, face and body still
  const at = (ms: number): PhraseFrame => {
    const x = 0.2 + 0.3 * (ms / 2000);
    return {
      pose: Array.from({ length: 33 }, (_, i): Point => [0.5 + i * 0.001, 0.4, 0]),
      left_hand: null,
      right_hand: Array.from({ length: 21 }, (_, i): Point => [x + i * 0.002, 0.6, 0.01]),
      face: null,
    };
  };
  const RIGHT_WRIST_X = (21 + 33) * 3;   // feature column of right_hand[0].x

  it.each([15, 24, 30, 60, 120])('gives the same velocity per frame for motion captured at %d fps', fps => {
    const times = Array.from({ length: 2 * fps }, (_, i) => (i * 1000) / fps + 50);
    const { features, T } = buildFeatures(resampleFrames(times.map(t => at(t - 50)), times), 'legacy');
    expect([59, 60]).toContain(T);
    // 0.3 of the width in 2 s = 0.005 per 30 fps frame, at every step
    for (let t = 1; t < T; t++) {
      expect(features[t * N_FEATURES + N_POSITIONS + RIGHT_WRIST_X]).toBeCloseTo(0.005, 5);
    }
  });

  it('interpolates slow capture and takes detection from the nearer frame', () => {
    const noHand = { ...at(0), right_hand: null };
    const frames = [at(0), noHand, at(200), at(300)];
    const out = resampleFrames(frames, [0, 100, 200, 300]);
    // grid: 0, 33, 67, 100, 133, 167, 200, 233, 267, 300 ms
    expect(out.map(f => !!f.right_hand)).toEqual([true, true, false, false, false, true, true, true, true, true]);
    expect(out[1].right_hand).toBe(frames[0].right_hand);   // nothing to interpolate with: copied
    expect(out[7].right_hand![0][0]).toBeCloseTo(0.2 + 0.3 * (700 / 3 / 2000), 6);
  });

  it('picks whole frames when capture is at least 28.5 fps', () => {
    const times = Array.from({ length: 20 }, (_, i) => i * 16 + (i % 3));
    const frames = times.map(at);
    const hands = frames.map(f => f.right_hand);
    for (const f of resampleFrames(frames, times)) expect(hands).toContain(f.right_hand);
  });

  it('skips a repeated or backward timestamp instead of failing', () => {
    const frames = [at(0), at(100), at(100), at(90), at(200)];
    expect(resampleFrames(frames, [0, 100, 100, 90, 200])).toHaveLength(7);
  });

  it('handles an empty stream and a single frame', () => {
    expect(resampleFrames([], [])).toEqual([]);
    const one = at(0);
    expect(resampleFrames([one], [5])).toEqual([one]);
  });
});

describe('trimming under the v4 contract', () => {
  const pose: Point[] = Array.from({ length: 33 }, (_, i): Point => [0.5 + i * 0.001, 0.3, 0]);
  const hand: Point[] = Array.from({ length: 21 }, (): Point => [0.4, 0.6, 0]);
  const face: Point[] = Array.from({ length: 478 }, (_, i): Point => [0.5 + i * 1e-4, 0.25, 0.02]);
  const FACE = (21 + 33 + 21) * 3;   // first face feature column
  // face seen before the hands come up, then lost while signing
  const clip: PhraseFrame[] = [
    { pose, left_hand: null, right_hand: null, face },
    { pose, left_hand: null, right_hand: null, face },
    ...Array.from({ length: 8 }, (): PhraseFrame => ({ pose, left_hand: null, right_hand: hand, face: null })),
    { pose, left_hand: null, right_hand: null, face: null },
  ];

  it('holds a face last seen before the hand span (fill, then trim)', () => {
    const { features, T } = buildFeatures(clip, 'v4', 0.75, true);
    expect(T).toBe(8);
    for (let t = 0; t < T; t++) {
      expect(features[t * N_FEATURES + FACE]).toBeCloseTo(face[70][0] - pose[0][0], 6);
      expect(features[t * N_FEATURES + FACE + 2]).toBeCloseTo(0.02, 6);
    }
    // the first kept frame has no velocity even though earlier frames were filled
    expect(Array.from(features.subarray(N_POSITIONS, 2 * N_POSITIONS)).every(v => v === 0)).toBe(true);
    expect(Array.from(features.subarray(2 * N_POSITIONS, N_FEATURES))).toEqual([0, 1]);
  });

  it('keeps the legacy order (trim, then fill): no face inside the span', () => {
    const { features, T } = buildFeatures(clip, 'legacy', 0.75, true);
    expect(T).toBe(8);
    expect(features[FACE]).toBe(0);
  });
});

describe('toRecording', () => {
  it('writes the fixture format with a 468-point face', () => {
    const face: Point[] = Array.from({ length: 478 }, () => [0.123456789, 0.5, 0]);
    const pose: Point[] = Array.from({ length: 33 }, () => [0.5, 0.5, 0]);
    const rec = toRecording([{ pose, left_hand: null, right_hand: null, face }], 'cloud have', { fps: 30 });
    expect(rec.label).toBe('cloud have');
    expect(rec.frames[0].face).toHaveLength(468);
    expect(rec.frames[0].face![0][0]).toBe(Math.fround(0.123456789));
    expect(rec.frames[0].left_hand).toBeNull();
    expect(handSpan(rec.frames)).toBeNull();
    expect(rec).not.toHaveProperty('timestamps_ms');
  });

  it.each(['legacy', 'v4'] as const)('replays to the same model input, bit for bit (%s)', contract => {
    // Captured landmarks are float32; capture is slower than 30 fps, so frames are interpolated
    const f32 = (points: Point[] | null) => points?.map(p => p.map(Math.fround)) ?? null;
    const captured = fixtures[0].frames.map((f): PhraseFrame =>
      ({ pose: f32(f.pose), left_hand: f32(f.left_hand), right_hand: f32(f.right_hand), face: f32(f.face) }));
    const times = captured.map((_, i) => Math.round(i * 41.7 * 1000) / 1000);
    const input = (frames: PhraseFrame[], timesMs: number[]) =>
      buildFeatures(resampleFrames(frames, timesMs), contract, 0.75, true);

    const saved = JSON.parse(JSON.stringify(toRecording(captured, 'cloud', {}, times)));
    const live = input(captured, times);
    const replayed = input(saved.frames, saved.timestamps_ms);
    expect(live.T).toBeGreaterThan(captured.length);
    expect(replayed.T).toBe(live.T);
    expect(Buffer.from(replayed.features.buffer).equals(Buffer.from(live.features.buffer))).toBe(true);
  });

  it('adds the capture times when given', () => {
    const none: PhraseFrame = { pose: null, left_hand: null, right_hand: null, face: null };
    const rec = toRecording([none, none], '', { contract_version: 'v4' }, [0, 33.4]);
    expect(rec.timestamps_ms).toEqual([0, 33.4]);
    expect(rec.frames).toEqual([none, none]);
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
