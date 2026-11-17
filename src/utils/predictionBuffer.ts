/**
 * Rolling window buffer for prediction smoothing.
 * Prevents flickering by returning the mode prediction when it appears
 * in a sufficient percentage of the buffer.
 */
export interface StablePrediction {
  label: string;
  /** Mean classifier confidence of the frames in the window that agree on the label */
  confidence: number;
}

export class PredictionBuffer {
  private buffer: Array<{ label: string; confidence: number }> = [];
  private readonly size: number;
  private readonly threshold: number;

  /**
   * @param size - Number of predictions to keep in buffer
   * @param threshold - Fraction of buffer that must match for stable prediction (0-1)
   */
  constructor(size: number = 5, threshold: number = 0.6) {
    this.size = size;
    this.threshold = threshold;
  }

  add(prediction: string, confidence: number = 1): void {
    this.buffer.push({ label: prediction, confidence });
    if (this.buffer.length > this.size) {
      this.buffer.shift();
    }
  }

  /**
   * The stable label with the confidence that belongs to it. The latest frame's
   * confidence must not be used for this: that frame may have predicted a
   * different label than the one the window agrees on.
   */
  getStable(): StablePrediction | null {
    const stats = new Map<string, { count: number; total: number }>();
    for (const { label, confidence } of this.buffer) {
      const s = stats.get(label) ?? { count: 0, total: 0 };
      s.count += 1;
      s.total += confidence;
      stats.set(label, s);
    }

    let best: StablePrediction | null = null;
    let maxCount = 0;
    for (const [label, { count, total }] of stats) {
      if (count > maxCount) {
        maxCount = count;
        best = { label, confidence: total / count };
      }
    }

    const requiredCount = Math.ceil(this.size * this.threshold);
    return maxCount >= requiredCount ? best : null;
  }

  /**
   * Get the stable prediction if one exists.
   * Returns the mode prediction if it appears in at least `threshold` fraction of the buffer.
   * Returns null if no prediction meets the threshold.
   */
  getStablePrediction(): string | null {
    return this.getStable()?.label ?? null;
  }

  getLatestPrediction(): string | null {
    return this.buffer.length > 0 ? this.buffer[this.buffer.length - 1].label : null;
  }

  clear(): void {
    this.buffer = [];
  }

  get length(): number {
    return this.buffer.length;
  }
}
