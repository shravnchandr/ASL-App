// @vitest-environment node
/// <reference types="node" />
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import * as ort from 'onnxruntime-web/wasm';
import {
  LANDMARK_ORDER, MAX_FRAMES, MIN_FRAMES, MODEL_FPS, N_FEATURES, NUM_CLASSES,
  buildFeatures, decodeGreedy, decodeWithScores, segmentIndices, toRecording,
  type PhraseFrame, type Point,
} from '../signPhrase';
import { phraseContractVersion, preparePhraseFrames, resolveCopiedHands } from '../signPhraseContract';

// The frozen phrases07 bundle and the fixtures exported with it
const MODEL_DIR = 'public/models/sign-phrases/';
const DIR = 'src/test/fixtures/frozen-phrases07/';
const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
const checksums = new Map(readFileSync(DIR + 'SHA256SUMS', 'utf8').trim().split('\n').map(line => {
  const [sum, file] = line.split(/\s+/);
  return [file, sum] as const;
}));
interface Fixture {
  name: string;
  contract_version: string;
  frames: PhraseFrame[];
  kept_frames: number[];
  hand_status: [number, number][];
  assignment_uncertain: number[];
  segment: number[];
  subsample: number[] | null;
  features: number[][];
  /** Frozen phrases07 output; null when the segment is under the model's 8 frames. */
  logits: number[][] | null;
  decoded: string[] | null;
}
const fixtures = readdirSync(DIR).filter(f => f.endsWith('.json.gz')).map(f =>
  JSON.parse(gunzipSync(readFileSync(DIR + f)).toString()) as Fixture
);
interface RuleVector {
  case: string;
  aspect: number;
  pose: Record<string, number[]>;
  left_hand: number[][];
  right_hand: number[][];
  expected: { hand_status: [number, number]; assignment_uncertain: number };
}
const vectors = JSON.parse(readFileSync(DIR + 'rule_vectors.json', 'utf8')) as { cases: RuleVector[] };

function firstBitDifference(actual: Float32Array, rows: number[][]): string | null {
  const expected = new Float32Array(rows.flat());
  if (actual.length !== expected.length) return `length ${actual.length} != ${expected.length}`;
  const a = new Uint32Array(actual.buffer, actual.byteOffset, actual.length);
  const b = new Uint32Array(expected.buffer);
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return `index ${i}: ${actual[i]} != ${expected[i]} (bits ${a[i]} != ${b[i]})`;
  }
  return null;
}

describe('Python contract v4 parity (frozen phrases07 export)', () => {
  it('includes every exported case', () => {
    expect(fixtures).toHaveLength(14); // three real clips, eleven synthetic cases
    expect(vectors.cases).toHaveLength(7);
  });

  it('holds the exported fixtures unchanged', () => {
    const files = readdirSync(DIR).filter(f => f.endsWith('.json') || f.endsWith('.json.gz'));
    expect(files).toHaveLength(16);
    for (const file of files) {
      const data = readFileSync(DIR + file);
      const name = file.replace(/\.gz$/, '');
      expect([name, sha256(file === name ? data : gunzipSync(data))]).toEqual([name, checksums.get(`fixtures/${name}`)]);
    }
  });

  it.each(fixtures)('$name: exact provenance, segment, subsampling and float32 features', fx => {
    const before = JSON.stringify(fx.frames);
    const prepared = preparePhraseFrames(fx.frames);
    expect(prepared.keptFrames).toEqual(fx.kept_frames);
    expect(prepared.handStatus).toEqual(fx.hand_status);
    expect(prepared.assignmentUncertain).toEqual(fx.assignment_uncertain);
    expect(segmentIndices(prepared.frames)).toEqual(fx.segment.map(i => i));
    // Python segment indices are positions in pose-present frames.
    const result = buildFeatures(fx.frames, 'v4', 0.75, true);
    expect(result.T).toBe(fx.features.length);
    expect(result.subsample).toEqual(fx.subsample);
    expect(firstBitDifference(result.features, fx.features)).toBeNull();
    expect(JSON.stringify(fx.frames)).toBe(before);
  });

  it.each(vectors.cases)('$case: exported float64 threshold/tie vector', vector => {
    const pose: Point[] = Array.from({ length: 33 }, () => [0, 0, 0]);
    for (const [i, xy] of Object.entries(vector.pose)) pose[Number(i)] = [...xy, 0];
    const frame: PhraseFrame = { pose, left_hand: vector.left_hand, right_hand: vector.right_hand, face: null };
    const result = resolveCopiedHands([frame], vector.aspect);
    expect(result.handStatus).toEqual([vector.expected.hand_status]);
    expect(result.assignmentUncertain).toEqual([vector.expected.assignment_uncertain]);
  });

  it('preserves exact v4 decisions and features through recording JSON', () => {
    for (const fx of fixtures) {
      const recording = JSON.parse(JSON.stringify(toRecording(fx.frames, '', { contract_version: 'v4' })));
      const prepared = preparePhraseFrames(recording.frames);
      expect(prepared.handStatus).toEqual(fx.hand_status);
      expect(prepared.assignmentUncertain).toEqual(fx.assignment_uncertain);
      expect(firstBitDifference(buildFeatures(recording.frames, 'v4', 0.75, true).features, fx.features)).toBeNull();
    }
  });

  it('uses clip-median shoulder width and the supplied aspect on multiple frames', () => {
    const fx = fixtures.find(f => f.name === 'copy')!;
    for (const aspect of [0.75, 1, 16 / 9]) {
      const p = preparePhraseFrames(fx.frames, aspect);
      expect(p.handStatus).toHaveLength(fx.frames.length);
      expect(p.assignmentUncertain.filter(Boolean)).toHaveLength(0);
      expect(p.handStatus.filter(s => s.includes(2))).toHaveLength(6);
    }
  });

  it('keeps the legacy model path available while v4 rejects copied detections', () => {
    const fx = fixtures.find(f => f.name === 'copy')!;
    const legacy = buildFeatures(fx.frames, 'legacy');
    const current = buildFeatures(fx.frames, 'v4');
    expect(legacy.features[10 * 788 + 787]).toBe(1);
    expect(current.features[10 * 788 + 787]).toBe(0);
    expect(current.assignmentUncertain).toEqual(fx.assignment_uncertain);
  });

  it('resolves copies before trimming changes the shoulder-width median', () => {
    const frames: PhraseFrame[] = Array.from({ length: 7 }, (_, t) => {
      const pose: Point[] = Array.from({ length: 33 }, () => [0, 0, 0]);
      pose[11] = [t < 5 ? 0.75 : 0.625, 0.25, 0];
      pose[12] = [t < 5 ? 0.25 : 0.375, 0.25, 0];
      pose[15] = [0.75, 0.5, 0]; pose[16] = [0.25, 0.5, 0];
      const hand = (x: number): Point[] => Array.from({ length: 21 }, (_, i) =>
        i === 0 ? [x, 0.5, 0] : [i % 2 ? 0.3 : 0.7, i % 4 < 2 ? 0.45 : 0.55, 0]);
      return { pose, left_hand: t < 5 ? null : hand(0.52), right_hand: t < 5 ? null : hand(0.25), face: null };
    });
    // Python prepare(full clip) -> segment: wider idle shoulders make this a copy.
    const result = buildFeatures(frames, 'v4', 0.75, true);
    expect(result.T).toBe(2);
    expect(Array.from(result.features.subarray(786, 788))).toEqual([0, 1]);
    // Trimming raw detections first incorrectly changes the decision.
    const premature = buildFeatures(frames.slice(5), 'v4');
    expect(Array.from(premature.features.subarray(786, 788))).toEqual([1, 1]);
  });

  it('selects only supported bundle contracts', () => {
    expect(phraseContractVersion({})).toBe('legacy');
    expect(phraseContractVersion({ contract_version: 'v4' })).toBe('v4');
    expect(() => phraseContractVersion({ contract_version: 'v5' })).toThrow('Unsupported');
  });
});

describe('frozen phrases07 bundle', () => {
  it('serves the exported files, with their credits', () => {
    for (const file of ['sign_ctc.onnx', 'labels.json', 'preprocess.json', 'ATTRIBUTION.md']) {
      expect([file, sha256(readFileSync(MODEL_DIR + file))]).toEqual([file, checksums.get(file)]);
    }
  });

  it('declares the contract and layout this app implements', () => {
    const spec = JSON.parse(readFileSync(MODEL_DIR + 'preprocess.json', 'utf8'));
    expect(phraseContractVersion(spec)).toBe('v4');
    expect(LANDMARK_ORDER).toEqual(spec.landmarks);
    expect(N_FEATURES).toBe(spec.in_feat);
    expect(MAX_FRAMES).toBe(spec.max_frames);
    expect(NUM_CLASSES - 1).toBe(spec.blank);
    // The timing rule's constants (resamplePlan); its plans are pinned in signPhrase.test.ts
    expect(spec.frame_rate).toMatchObject({ fps: MODEL_FPS, nearest_min: 0.95, snap_ms: 0.5 });
    expect(spec.copied_hands).toMatchObject({ copy_iou: 0.1, wrist_margin: 0.1, assign_ratio: 0.45 });
  });

  it('reproduces fixture logits and decodes in onnxruntime-web', async () => {
    const labels = JSON.parse(readFileSync(MODEL_DIR + 'labels.json', 'utf8')) as string[];
    expect(labels).toHaveLength(NUM_CLASSES - 1);
    ort.env.wasm.numThreads = 1;
    const session = await ort.InferenceSession.create(readFileSync(MODEL_DIR + 'sign_ctc.onnx'), {
      executionProviders: ['wasm'],
    });
    let ran = 0;
    for (const fx of fixtures) {
      // Our own features, so the test covers preprocessing → model → decode
      const { features, T } = buildFeatures(fx.frames, 'v4', 0.75, true);
      if (!fx.logits) {
        expect(T).toBeLessThan(MIN_FRAMES);
        expect(fx.decoded).toBeNull();
        continue;
      }
      const { logits } = await session.run({
        features: new ort.Tensor('float32', features, [1, T, N_FEATURES]),
      });
      expect(logits.dims).toEqual([1, T, NUM_CLASSES]);
      const data = logits.data as Float32Array;
      let worst = 0;
      fx.logits.forEach((row, t) => row.forEach((v, c) => {
        worst = Math.max(worst, Math.abs(data[t * NUM_CLASSES + c] - v));
      }));
      expect(data.every(Number.isFinite)).toBe(true);
      expect([fx.name, worst < 1e-3]).toEqual([fx.name, true]);
      expect([fx.name, decodeGreedy(data, T, labels)]).toEqual([fx.name, fx.decoded]);
      expect(decodeWithScores(data, T, labels).signs.map(s => s.gloss)).toEqual(fx.decoded);
      ran++;
    }
    expect(ran).toBe(12);
    await session.release();
  }, 60_000);
});

