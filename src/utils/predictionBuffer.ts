/**
 * Rolling window buffer for prediction smoothing.
 * Prevents flickering by returning the mode prediction when it appears
 * in a sufficient percentage of the buffer.
 */
export class PredictionBuffer {
  private buffer: string[] = [];
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

  /**
   * Add a new prediction to the buffer.
   */
  add(prediction: string): void {
    this.buffer.push(prediction);
    if (this.buffer.length > this.size) {
      this.buffer.shift();
    }
  }

  /**
   * Get the stable prediction if one exists.
   * Returns the mode prediction if it appears in at least `threshold` fraction of the buffer.
   * Returns null if no prediction meets the threshold.
   */
  getStablePrediction(): string | null {
    if (this.buffer.length === 0) {
      return null;
    }

    // Count occurrences
    const counts = new Map<string, number>();
    for (const p of this.buffer) {
      counts.set(p, (counts.get(p) || 0) + 1);
    }

    // Find mode
    let mode = '';
    let maxCount = 0;
    for (const [prediction, count] of counts) {
      if (count > maxCount) {
        maxCount = count;
        mode = prediction;
      }
    }

    // Return mode only if it meets threshold
    const requiredCount = Math.ceil(this.size * this.threshold);
    return maxCount >= requiredCount ? mode : null;
  }

  /**
   * Get the most recent prediction regardless of stability.
   */
  getLatestPrediction(): string | null {
    return this.buffer.length > 0 ? this.buffer[this.buffer.length - 1] : null;
  }

  /**
   * Clear the buffer.
   */
  clear(): void {
    this.buffer = [];
  }

  /**
   * Get current buffer size.
   */
  get length(): number {
    return this.buffer.length;
  }
}
