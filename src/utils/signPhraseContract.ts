import type { PhraseFrame, Point } from './signPhrase';

/** Frozen landmark contract; fixtures from the frozen phrases07 export. */
export const PHRASE_CONTRACT_VERSION = 'v4';
export type PhraseContractVersion = 'legacy' | typeof PHRASE_CONTRACT_VERSION;
export type HandStatus = 0 | 1 | 2; // absent, kept, rejected copy

export interface HandProvenance {
  handStatus: [HandStatus, HandStatus][];
  assignmentUncertain: number[];
}

export interface PreparedPhraseFrames extends HandProvenance {
  /** Raw input indices after dropping pose-less frames. */
  keptFrames: number[];
  /** Float32 landmarks, with rejected hand detections nulled before hold-fill. */
  frames: PhraseFrame[];
}

function median(values: number[]): number {
  const sorted = values.filter(v => !Number.isNaN(v)).sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (!sorted.length) return NaN;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Direct rule inputs may be float64 (the Python boundary vectors). Prepared clips use float32. */
export function resolveCopiedHands(
  frames: PhraseFrame[],
  aspect = 0.75,
  float32 = false,
): HandProvenance {
  if (!(aspect > 0) || !Number.isFinite(aspect)) throw new Error('Invalid landmark aspect ratio');
  const round = float32 ? Math.fround : (n: number) => n;
  const distance = (a: Point, b: Point) => {
    const dx = round(a[0] - b[0]) * aspect;
    const dy = round(a[1] - b[1]);
    return Math.sqrt(dx * dx + dy * dy);
  };
  const box = (hand: Point[]) => [
    Math.min(...hand.map(p => p[0])), Math.min(...hand.map(p => p[1])),
    Math.max(...hand.map(p => p[0])), Math.max(...hand.map(p => p[1])),
  ];
  const iou = (a: Point[], b: Point[]) => {
    const x = box(a), y = box(b);
    const width = Math.max(0, round(Math.min(x[2], y[2]) - Math.max(x[0], y[0])));
    const height = Math.max(0, round(Math.min(x[3], y[3]) - Math.max(x[1], y[1])));
    const intersection = round(width * height);
    const area = (r: number[]) => round(round(r[2] - r[0]) * round(r[3] - r[1]));
    const union = round(round(area(x) + area(y)) - intersection);
    return union > 0 ? round(intersection / union) : 0;
  };
  const widths = frames.map(f => {
    if (!f.pose) throw new Error('Copy rule requires pose-present frames');
    return distance(f.pose[11], f.pose[12]);
  });
  const measuredWidth = median(widths);
  const shoulderWidth = measuredWidth > 0 ? measuredWidth : 1e-6;
  const handStatus: [HandStatus, HandStatus][] = [];
  const assignmentUncertain: number[] = [];
  for (const frame of frames) {
    const left = frame.left_hand, right = frame.right_hand;
    const status: [HandStatus, HandStatus] = [left ? 1 : 0, right ? 1 : 0];
    let uncertain = 0;
    if (left && right && iou(left, right) >= 0.1) {
      const pose = frame.pose!;
      const l15 = distance(left[0], pose[15]) / shoulderWidth;
      const l16 = distance(left[0], pose[16]) / shoulderWidth;
      const r15 = distance(right[0], pose[15]) / shoulderWidth;
      const r16 = distance(right[0], pose[16]) / shoulderWidth;
      if (!(l15 + 0.1 < l16 && r16 + 0.1 < r15)) {
        // Mean of distances, not the distance from a mean wrist position.
        const dLeft = (l15 + r15) / 2, dRight = (l16 + r16) / 2;
        const keep = dLeft < dRight ? 0 : 1; // exact tie keeps right
        status[keep === 0 ? 1 : 0] = 2;
        const farther = Math.max(dLeft, dRight);
        uncertain = farther > 0 && Math.min(dLeft, dRight) / farther < 0.45 ? 0 : 1;
      }
    }
    handStatus.push(status);
    assignmentUncertain.push(uncertain);
  }
  return { handStatus, assignmentUncertain };
}

/** Raw detections remain untouched so saved recordings can reproduce preparation exactly. */
export function preparePhraseFrames(frames: PhraseFrame[], aspect = 0.75): PreparedPhraseFrames {
  const keptFrames: number[] = [];
  const asFloat32 = (points: Point[] | null): Point[] | null => points?.map(p => p.map(v => {
    if (v === Infinity || v === -Infinity) throw new Error('Infinite raw landmark coordinate');
    return v === null ? NaN : Math.fround(v);
  })) ?? null;
  const posed: PhraseFrame[] = [];
  frames.forEach((frame, i) => {
    const rounded: PhraseFrame = {
      pose: asFloat32(frame.pose), left_hand: asFloat32(frame.left_hand),
      right_hand: asFloat32(frame.right_hand), face: asFloat32(frame.face),
    };
    if (!rounded.pose || rounded.pose.every(p => p.every(Number.isNaN))) return;
    keptFrames.push(i);
    posed.push(rounded);
  });
  const provenance = resolveCopiedHands(posed, aspect, true);
  return {
    ...provenance, keptFrames,
    frames: posed.map((f, i) => ({
      ...f,
      left_hand: provenance.handStatus[i][0] === 1 ? f.left_hand : null,
      right_hand: provenance.handStatus[i][1] === 1 ? f.right_hand : null,
    })),
  };
}

/** Missing version belongs to the installed legacy export; unknown contracts must not run silently. */
export function phraseContractVersion(spec: unknown): PhraseContractVersion {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    throw new Error('Invalid phrase preprocessing specification');
  }
  const version = (spec as { contract_version?: unknown }).contract_version;
  if (version === undefined) return 'legacy';
  if (version === PHRASE_CONTRACT_VERSION) return PHRASE_CONTRACT_VERSION;
  throw new Error(`Unsupported phrase preprocessing contract: ${String(version)}`);
}
