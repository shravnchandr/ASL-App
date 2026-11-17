import {
  preparePhraseFrames,
  type PhraseContractVersion,
} from './signPhraseContract';

/**
 * Preprocessing and decoding for the continuous sign-phrase (CTC) model.
 *
 * Mirrors the Python pipeline the models were trained with; the golden fixtures
 * in src/test/fixtures/ pin the behaviour (frozen-phrases07: contract v4, see
 * signPhraseContract.test.ts; phrases05: legacy, see signPhrase.test.ts). The
 * landmark order matches each bundle's preprocess.json.
 */

/** One landmark as [x, y, z] in normalised image coordinates. */
export type Point = readonly number[];

/** One video frame after hand-slot assignment; null = part not detected. */
export interface PhraseFrame {
  pose: Point[] | null;
  left_hand: Point[] | null;
  right_hand: Point[] | null;
  face: Point[] | null;
}

/** Face mesh indices the model uses (eyebrows + lips), in feature order. */
export const FACE_INDICES = [
  70, 63, 105, 66, 107, 55, 65, 52, 300, 293, 334, 296, 336, 285, 295, 282,
  61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185,
  78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95,
] as const;

const HAND_POINTS = 21;
const POSE_POINTS = 33;
/** Face points kept in recordings (legacy Holistic mesh; Tasks adds 10 iris points). */
const FACE_MESH_POINTS = 468;

const HAND_INDICES = Array.from({ length: HAND_POINTS }, (_, i) => i);
const POSE_INDICES = Array.from({ length: POSE_POINTS }, (_, i) => i);

type Part = keyof PhraseFrame;

/** Feature order: left_hand 0–20, pose 0–32, right_hand 0–20, 56 face indices. */
const PART_LAYOUT: { part: Part; indices: readonly number[] }[] = [
  { part: 'left_hand', indices: HAND_INDICES },
  { part: 'pose', indices: POSE_INDICES },
  { part: 'right_hand', indices: HAND_INDICES },
  { part: 'face', indices: FACE_INDICES },
];

export const LANDMARK_ORDER: [Part, number][] = PART_LAYOUT.flatMap(({ part, indices }) =>
  indices.map((i): [Part, number] => [part, i])
);

const COORDS = 3;
export const N_POSITIONS = LANDMARK_ORDER.length * COORDS; // 393
export const N_FEATURES = N_POSITIONS * 2 + 2; // 788
export const MIN_FRAMES = 8;
export const MAX_FRAMES = 384;
export const NUM_CLASSES = 251;
export const BLANK_INDEX = 250;

const POSE_LEFT_SHOULDER = 11;
const POSE_RIGHT_SHOULDER = 12;
const POSE_LEFT_WRIST = 15;
const POSE_RIGHT_WRIST = 16;

/** Training video was portrait, about 3:4 (width / height). */
export const TRAINING_ASPECT = 0.75;

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Centre crop of a camera frame to the training aspect ratio. Landmark x is a
 * fraction of image width and y of height, so a landscape frame would change
 * the body's proportions in the numbers; landmarks are detected on this crop.
 */
export function portraitCrop(width: number, height: number): CropRect {
  if (width / height > TRAINING_ASPECT) {
    const cropWidth = Math.round(height * TRAINING_ASPECT);
    return { x: Math.round((width - cropWidth) / 2), y: 0, width: cropWidth, height };
  }
  const cropHeight = Math.min(height, Math.round(width / TRAINING_ASPECT));
  return { x: 0, y: Math.round((height - cropHeight) / 2), width, height: cropHeight };
}

/**
 * Framing sanity value: (mean shoulder y, nose-relative) / shoulder width.
 * About 0.40 on training video (p10–p90 0.34–0.45); about 0.9 on an uncropped 16:9 frame.
 */
export function shoulderRatio(pose: Point[]): number {
  const nose = pose[0];
  const left = pose[POSE_LEFT_SHOULDER];
  const right = pose[POSE_RIGHT_SHOULDER];
  const width = distance2d(left, right);
  return width > 0 ? ((left[1] + right[1]) / 2 - nose[1]) / width : NaN;
}

/** Median shoulder ratio over a segment (NaN if no frame has a pose). */
export function medianShoulderRatio(frames: PhraseFrame[]): number {
  const values = frames
    .filter(f => f.pose)
    .map(f => shoulderRatio(f.pose!))
    .filter(v => !Number.isNaN(v))
    .sort((a, b) => a - b);
  return values.length ? values[Math.floor(values.length / 2)] : NaN;
}

/** First..last frame (inclusive) in which either hand is detected. */
export function handSpan(frames: PhraseFrame[]): [number, number] | null {
  let first = -1;
  let last = -1;
  frames.forEach((f, i) => {
    if (f.left_hand || f.right_hand) {
      if (first < 0) first = i;
      last = i;
    }
  });
  return first < 0 ? null : [first, last];
}

/** Uniform subsample indices for a segment longer than `max` frames. */
export function subsampleIndices(length: number, max = MAX_FRAMES): number[] {
  if (length <= max) return Array.from({ length }, (_, i) => i);
  return Array.from({ length: max }, (_, i) => Math.floor((i * (length - 1)) / (max - 1)));
}

/**
 * Indices of the frames that make up the segment: frames with a pose, from the
 * first to the last such frame in which either hand is detected.
 */
export function segmentIndices(frames: PhraseFrame[]): number[] {
  const posed = frames.map((_, i) => i).filter(i => frames[i].pose);
  const hands = posed.filter(i => frames[i].left_hand || frames[i].right_hand);
  if (!hands.length) return [];
  return posed.filter(i => i >= hands[0] && i <= hands[hands.length - 1]);
}

export interface PhraseFeatures {
  /** Row-major (T, 788): positions | delta1 | presence. */
  features: Float32Array;
  T: number;
  /** Positions kept when the segment was over 384 frames, else null. */
  subsample: number[] | null;
  /** Provenance before subsampling, in pose-present frame order (v4 only). */
  keptFrames?: number[];
  handStatus?: [number, number][];
  assignmentUncertain?: number[];
}

/**
 * Model input for one segment. Order matters and matches the export contract:
 * origin + hold-fill over every frame, then subsample (over 384 frames), then Δ1.
 * Frames without a pose are dropped (the origin needs the nose).
 *
 * `trim` cuts the clip to its hand span (segmentIndices). Under v4 that happens
 * after hold-fill, as in Python, so a part last detected before the span (a
 * face that then drops out) is still held inside it. The legacy contract trims
 * first.
 */
export function buildFeatures(
  segment: PhraseFrame[],
  contractVersion: PhraseContractVersion = 'v4',
  aspect = TRAINING_ASPECT,
  trim = false,
): PhraseFeatures {
  const prepared = contractVersion === 'v4' ? preparePhraseFrames(segment, aspect) : null;
  const posed = prepared?.frames ?? segment.filter(f => f.pose);
  // Resolve copies using the full clip's median shoulder width before trimming.
  const handSegment = trim ? segmentIndices(posed) : null;
  const fillWholeClip = contractVersion === 'v4';
  const frames = handSegment && !fillWholeClip ? handSegment.map(i => posed[i]) : posed;
  const total = frames.length;
  // Rows of `frames` that make up the segment, before subsampling
  const span = handSegment && fillWholeClip ? handSegment : frames.map((_, i) => i);

  // Positions: origin-subtracted where detected, then hold-filled per part
  const positions = new Float32Array(total * N_POSITIONS);
  let offset = 0;
  for (const { part, indices } of PART_LAYOUT) {
    const width = indices.length * COORDS;
    let lastSeen = -1;
    let firstSeen = -1;
    for (let t = 0; t < total; t++) {
      const row = t * N_POSITIONS + offset;
      const points = frames[t][part];
      if (points) {
        const nose = frames[t].pose![0];
        indices.forEach((idx, k) => {
          for (let c = 0; c < COORDS; c++) {
            positions[row + k * COORDS + c] = points[idx][c] - nose[c];
          }
        });
        if (firstSeen < 0) firstSeen = t;
        lastSeen = t;
      } else if (lastSeen >= 0) {
        // Hold the nose-relative value from the previous detection
        const src = lastSeen * N_POSITIONS + offset;
        positions.copyWithin(row, src, src + width);
      }
    }
    // Leading frames before the first detection take the next one
    for (let t = 0; t < firstSeen; t++) {
      const src = firstSeen * N_POSITIONS + offset;
      positions.copyWithin(t * N_POSITIONS + offset, src, src + width);
    }
    offset += width;
  }

  const keep = subsampleIndices(span.length);
  const T = keep.length;
  const features = new Float32Array(T * N_FEATURES);
  for (let t = 0; t < T; t++) {
    const row = t * N_FEATURES;
    const frame = span[keep[t]];
    const src = frame * N_POSITIONS;
    features.set(positions.subarray(src, src + N_POSITIONS), row);
    if (t > 0) {
      const prev = row - N_FEATURES;
      for (let i = 0; i < N_POSITIONS; i++) {
        features[row + N_POSITIONS + i] = features[row + i] - features[prev + i];
      }
    }
    // Presence is the actual detection in that frame, never the filled value
    features[row + 2 * N_POSITIONS] = frames[frame].left_hand ? 1 : 0;
    features[row + 2 * N_POSITIONS + 1] = frames[frame].right_hand ? 1 : 0;
  }

  return {
    features, T, subsample: span.length > MAX_FRAMES ? keep : null,
    ...(prepared && {
      keptFrames: prepared.keptFrames,
      handStatus: prepared.handStatus,
      assignmentUncertain: prepared.assignmentUncertain,
    }),
  };
}

/** Greedy CTC: argmax per frame, collapse repeats, drop blank. */
export function decodeGreedy(logits: ArrayLike<number>, T: number, labels: string[]): string[] {
  const C = labels.length + 1;
  const blank = labels.length;
  const out: string[] = [];
  let prev = -1;
  for (let t = 0; t < T; t++) {
    let best = 0;
    for (let c = 1; c < C; c++) {
      if (logits[t * C + c] > logits[t * C + best]) best = c;
    }
    if (best !== prev && best !== blank) out.push(labels[best]);
    prev = best;
  }
  return out;
}

export interface SignCandidate {
  gloss: string;
  /** Pooled model score in 0..1; not the chance of being right (see UNSURE_BELOW). */
  score: number;
}

export interface DecodedSign extends SignCandidate {
  /** Score under UNSURE_BELOW: show it as a guess. */
  unsure: boolean;
  /** Next-best signs for the same stretch of frames, best first. */
  alternatives: SignCandidate[];
}

export interface PhraseDecode {
  /** The greedy CTC decode, one entry per emitted sign. */
  signs: DecodedSign[];
  /** Best-scoring signs over the whole segment; what to show when nothing was emitted. */
  closest: SignCandidate[];
}

/**
 * Below this pooled score a sign is shown as "not sure". Measured for frozen
 * phrases07 (the model repo's exports/frozen-phrases07/sign_reliability.json,
 * 14,984 emitted signs from held-out single-sign clips): 72% of signs score 0.7
 * or more and 85% of those are right; 32% of the signs below it are. Signs
 * scoring 0.5–0.7 are right 41–44% of the time, which is why the cutoff is not
 * the lower 0.548 that averages 80%; 0.7–0.8 alone is right 55% of the time.
 * phrases05 shares the value (its own 80% cutoff is about 0.68). Not validated
 * for signs inside phrases or on a live camera.
 */
export const UNSURE_BELOW = 0.7;

/**
 * Greedy CTC decode with a score per sign and its runners-up. Scores are pooled
 * the way sign_reliability.json defines them: per sign, the maximum over frames
 * of softmax(logits)[t, sign], blank excluded. A phrase is split between
 * neighbouring emissions (halfway through the gap) and each sign is pooled over
 * its own stretch, so a one-sign segment is pooled over the whole segment.
 */
export function decodeWithScores(logits: ArrayLike<number>, T: number, labels: string[], top = 3): PhraseDecode {
  const C = labels.length + 1;
  const blank = labels.length;

  // Per-frame softmax and the argmax runs that greedy CTC emits
  const probs = new Float32Array(T * C);
  const runs: { cls: number; start: number; end: number }[] = [];
  let prev = -1;
  for (let t = 0; t < T; t++) {
    const row = t * C;
    let best = 0;
    for (let c = 1; c < C; c++) if (logits[row + c] > logits[row + best]) best = c;
    let sum = 0;
    for (let c = 0; c < C; c++) {
      probs[row + c] = Math.exp(logits[row + c] - logits[row + best]);
      sum += probs[row + c];
    }
    for (let c = 0; c < C; c++) probs[row + c] /= sum;

    if (best !== prev && best !== blank) runs.push({ cls: best, start: t, end: t });
    else if (best === prev && best !== blank) runs[runs.length - 1].end = t;
    prev = best;
  }

  const pool = (from: number, to: number): Float32Array => {
    const pooled = new Float32Array(blank);
    for (let t = from; t <= to; t++) {
      for (let c = 0; c < blank; c++) pooled[c] = Math.max(pooled[c], probs[t * C + c]);
    }
    return pooled;
  };
  const best = (pooled: Float32Array, n: number, skip = -1): SignCandidate[] =>
    Array.from(pooled, (score, cls) => ({ cls, score }))
      .filter(c => c.cls !== skip)
      .sort((a, b) => b.score - a.score)
      .slice(0, n)
      .map(c => ({ gloss: labels[c.cls], score: c.score }));

  const signs = runs.map((run, i): DecodedSign => {
    const from = i === 0 ? 0 : Math.floor((runs[i - 1].end + run.start) / 2) + 1;
    const to = i === runs.length - 1 ? T - 1 : Math.floor((run.end + runs[i + 1].start) / 2);
    const pooled = pool(from, to);
    const score = pooled[run.cls];
    return {
      gloss: labels[run.cls],
      score,
      unsure: score < UNSURE_BELOW,
      alternatives: best(pooled, top - 1, run.cls),
    };
  });

  return { signs, closest: T > 0 ? best(pool(0, T - 1), top) : [] };
}

function distance2d(a: Point, b: Point): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/**
 * Assign detected hands to the signer's own left/right by distance from each
 * hand's wrist to the pose wrists. MediaPipe's handedness label assumes a
 * mirrored image and is reversed on raw camera frames, so it is not used.
 */
export function assignHandSlots(
  hands: Point[][],
  pose: Point[]
): Pick<PhraseFrame, 'left_hand' | 'right_hand'> {
  const toLeft = (h: Point[]) => distance2d(h[0], pose[POSE_LEFT_WRIST]);
  const toRight = (h: Point[]) => distance2d(h[0], pose[POSE_RIGHT_WRIST]);

  if (hands.length === 0) return { left_hand: null, right_hand: null };
  if (hands.length === 1) {
    const [h] = hands;
    return toLeft(h) <= toRight(h)
      ? { left_hand: h, right_hand: null }
      : { left_hand: null, right_hand: h };
  }
  // Two hands: the assignment with the smaller total distance, never both in one slot
  const [a, b] = hands;
  return toLeft(a) + toRight(b) <= toRight(a) + toLeft(b)
    ? { left_hand: a, right_hand: b }
    : { left_hand: b, right_hand: a };
}

export type HandSlot = 'left_hand' | 'right_hand';

/** Wrist motion energy: sum of squared xy steps of hand landmark 0 between detections. */
function wristEnergy(frames: PhraseFrame[], slot: HandSlot): { energy: number; detections: number } {
  let energy = 0;
  let detections = 0;
  let prev: Point | null = null;
  for (const frame of frames) {
    const wrist = frame[slot]?.[0];
    if (!wrist) continue;
    if (prev) energy += (wrist[0] - prev[0]) ** 2 + (wrist[1] - prev[1]) ** 2;
    prev = wrist;
    detections++;
  }
  return { energy, detections };
}

/**
 * One-hand mode (experimental; evidence against two hands is mixed). The training
 * data almost never contains the second hand, even for two-handed signs, so a
 * correctly detected base hand may push the prediction off. The kept slot is `preferred` if it was detected at all,
 * otherwise the one whose wrist moved more; the other slot becomes "never
 * detected" (null in every frame → presence 0, coordinates 0) and the segment is
 * re-trimmed to the kept hand. Returns null if no hand was detected.
 */
export function keepDominantHand(
  frames: PhraseFrame[],
  preferred?: HandSlot
): { frames: PhraseFrame[]; kept: HandSlot } | null {
  const left = wristEnergy(frames, 'left_hand');
  const right = wristEnergy(frames, 'right_hand');
  if (!left.detections && !right.detections) return null;

  let kept: HandSlot;
  if (preferred && (preferred === 'left_hand' ? left : right).detections) {
    kept = preferred;
  } else if (left.energy !== right.energy) {
    kept = left.energy > right.energy ? 'left_hand' : 'right_hand';
  } else {
    kept = left.detections > right.detections ? 'left_hand' : 'right_hand';
  }
  const dropped: HandSlot = kept === 'left_hand' ? 'right_hand' : 'left_hand';

  const oneHanded = frames.map(f => (f[dropped] ? { ...f, [dropped]: null } : f));
  const [first, last] = handSpan(oneHanded)!;
  return { frames: oneHanded.slice(first, last + 1), kept };
}

export interface PhraseSegment {
  /**
   * The raw stream around one utterance: up to a second before the first frame
   * with a hand, through the frames after the last one. The contract fills
   * missing parts over this whole clip and only then trims to the hand span
   * (`buildFeatures(..., trim = true)`), so the context must not be cut here.
   * Frames without a pose are kept (all parts null) so that timing and
   * resampling see the stream as it was captured.
   */
  frames: PhraseFrame[];
  /** Capture time of each frame (ms). */
  times: number[];
  /** Capture rate over the segment (frames per second). */
  fps: number;
}

/** Live timing rule of the export contract (preprocess.json `frame_rate`). */
export const MODEL_FPS = 30;
/** Capture at this fraction of MODEL_FPS or faster picks frames; slower capture interpolates. */
const NEAREST_MIN = 0.95;
/** A tick this close to a capture timestamp takes that frame (timestamps are rounded). */
const SNAP_MS = 0.5;

const PARTS: Part[] = ['pose', 'left_hand', 'right_hand', 'face'];

/** One output frame: (1 - w) · frame i0 + w · frame i1. */
export interface ResampleStep {
  i0: number;
  i1: number;
  w: number;
}

/**
 * Port of the model repo's `browser_fixtures.resample_plan` (pinned by
 * timing_vectors.json): a 30 fps grid t_k = t_0 + k · 1000 / fps over the capture
 * timestamps. The mode is chosen once per stream from the median capture
 * interval: at 28.5 fps or faster each tick takes the nearest frame (ties → the
 * earlier), which is what training's frame step does; slower capture is
 * interpolated between the frames around the tick, because repeating frames
 * would add zero-velocity steps the model never saw. Timestamps must be
 * strictly increasing.
 */
export function resamplePlan(timesMs: number[], fps = MODEL_FPS): ResampleStep[] {
  const n = timesMs.length;
  if (n === 0) return [];
  const step = 1000 / fps;
  const count = Math.floor((timesMs[n - 1] - timesMs[0] + SNAP_MS) / step) + 1;

  const intervals = timesMs.slice(1).map((t, i) => t - timesMs[i]).sort((x, y) => x - y);
  const mid = intervals.length >> 1;
  const median = intervals.length % 2 ? intervals[mid] : (intervals[mid - 1] + intervals[mid]) / 2;
  const nearest = n < 2 || median <= step / NEAREST_MIN;

  const plan: ResampleStep[] = [];
  let j = 0;
  for (let k = 0; k < count; k++) {
    const tick = timesMs[0] + step * k;
    while (j < n - 1 && timesMs[j + 1] <= tick) j++;   // last frame at or before the tick
    if (j === n - 1 || tick - timesMs[j] <= SNAP_MS) {
      plan.push({ i0: j, i1: j, w: 0 });
    } else if (timesMs[j + 1] - tick <= SNAP_MS) {
      plan.push({ i0: j + 1, i1: j + 1, w: 0 });
    } else if (nearest) {
      const pick = tick - timesMs[j] <= timesMs[j + 1] - tick ? j : j + 1;
      plan.push({ i0: pick, i1: pick, w: 0 });
    } else {
      plan.push({ i0: j, i1: j + 1, w: (tick - timesMs[j]) / (timesMs[j + 1] - timesMs[j]) });
    }
  }
  return plan;
}

/**
 * Port of `browser_fixtures.apply_plan`: a part detected in both frames is
 * interpolated (float32); otherwise the nearer frame's part, or its absence,
 * is taken as it is.
 */
export function applyResamplePlan(frames: PhraseFrame[], plan: ResampleStep[]): PhraseFrame[] {
  return plan.map(({ i0, i1, w }) => {
    const frame = {} as PhraseFrame;
    for (const part of PARTS) {
      const a = frames[i0][part];
      const b = frames[i1][part];
      frame[part] = w === 0 || !a || !b
        ? (w < 0.5 ? a : b)
        : a.map((p, i) => p.map((v, c) => Math.fround((1 - w) * v + w * b[i][c])));
    }
    return frame;
  });
}

/**
 * The captured stream on the model's 30 fps grid; the first step for live
 * input, before anything else. The camera and the landmark models decide how
 * many frames a browser gets per second, and the velocity features scale with
 * that: the same motion at 15 fps has half the frames and twice the step.
 */
export function resampleFrames(frames: PhraseFrame[], timesMs: number[], fps = MODEL_FPS): PhraseFrame[] {
  // The rule needs strictly increasing times; a repeated timestamp is the same instant
  const keep: number[] = [];
  for (let i = 0; i < timesMs.length; i++) {
    if (!keep.length || timesMs[i] > timesMs[keep[keep.length - 1]]) keep.push(i);
  }
  return applyResamplePlan(keep.map(i => frames[i]), resamplePlan(keep.map(i => timesMs[i]), fps));
}

const NO_POSE_FRAME: PhraseFrame = { pose: null, left_hand: null, right_hand: null, face: null };

const SEGMENT_END_GAP_MS = 1000;
/** Frames kept from before the first hand, as context for hold-fill. */
const SEGMENT_PRE_ROLL_MS = 1000;
// Safety cap so a hand resting in view cannot buffer forever (~1 min at 30 fps)
const SEGMENT_MAX_FRAMES = 1800;

/**
 * Cuts the live frame stream into utterances: a segment starts at the first
 * frame with a hand and ends once no hand has been seen for about a second.
 * The frames just before and after the hands are part of the segment.
 */
export class PhraseSegmenter {
  private frames: PhraseFrame[] = [];
  private times: number[] = [];
  private lastHandIndex = -1;

  /** A hand has been seen and the segment has not ended yet. */
  get isActive(): boolean {
    return this.lastHandIndex >= 0;
  }

  /** Feed one frame (null = no pose). Returns a segment when one ends. */
  push(frame: PhraseFrame | null, timeMs: number): PhraseSegment | null {
    this.frames.push(frame ?? NO_POSE_FRAME);
    this.times.push(timeMs);
    if (frame && (frame.left_hand || frame.right_hand)) this.lastHandIndex = this.frames.length - 1;

    if (!this.isActive) {
      // Waiting for a hand: only the last second is kept
      const stale = this.times.findIndex(t => t >= timeMs - SEGMENT_PRE_ROLL_MS);
      if (stale > 0) {
        this.frames.splice(0, stale);
        this.times.splice(0, stale);
      }
      return null;
    }

    const sinceHand = timeMs - this.times[this.lastHandIndex];
    if (sinceHand >= SEGMENT_END_GAP_MS || this.frames.length >= SEGMENT_MAX_FRAMES) {
      return this.flush();
    }
    return null;
  }

  /** End the current segment now (null if no hand has been seen). */
  flush(): PhraseSegment | null {
    if (!this.isActive) return null;
    const { frames, times } = this;
    const elapsed = times[times.length - 1] - times[0];
    const fps = elapsed > 0 ? ((times.length - 1) * 1000) / elapsed : 0;
    // The frames after the last hand are also the next segment's lead-in
    this.frames = frames.slice(this.lastHandIndex + 1);
    this.times = times.slice(this.lastHandIndex + 1);
    this.lastHandIndex = -1;
    return { frames, times, fps };
  }

  reset(): void {
    this.frames = [];
    this.times = [];
    this.lastHandIndex = -1;
  }
}

/** Competition glosses that run words together, as display text. */
const GLOSS_DISPLAY: Record<string, string> = {
  callonphone: 'call on phone',
  frenchfries: 'french fries',
  glasswindow: 'glass / window',
  haveto: 'have to',
  hesheit: 'he / she / it',
  icecream: 'ice cream',
  minemy: 'mine / my',
  thankyou: 'thank you',
  weus: 'we / us',
};

export function formatGloss(gloss: string): string {
  return GLOSS_DISPLAY[gloss] ?? gloss;
}

// Landmarks are float32; written as such, a recording replays to the same input
const float32Points = (points: Point[] | null, limit = Infinity) =>
  points ? points.slice(0, limit).map(p => p.map(Math.fround)) : null;

/**
 * A segment in the model repo's fixture format, for scoring real signing:
 * `{label, frames, timestamps_ms}` with raw per-frame landmarks after slot
 * assignment and each frame's capture time.
 */
export function toRecording(
  frames: PhraseFrame[],
  label: string,
  meta: Record<string, unknown>,
  timestampsMs?: number[],
): { label: string; frames: PhraseFrame[]; timestamps_ms?: number[]; meta: Record<string, unknown> } {
  return {
    label,
    frames: frames.map(f => ({
      pose: float32Points(f.pose),
      left_hand: float32Points(f.left_hand),
      right_hand: float32Points(f.right_hand),
      face: float32Points(f.face, FACE_MESH_POINTS),
    })),
    ...(timestampsMs && { timestamps_ms: timestampsMs }),
    meta,
  };
}
