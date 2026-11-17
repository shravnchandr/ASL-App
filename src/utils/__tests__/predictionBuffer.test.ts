import { describe, it, expect } from 'vitest';
import { PredictionBuffer } from '../predictionBuffer';

describe('PredictionBuffer', () => {
  it('should add predictions to the buffer', () => {
    const buffer = new PredictionBuffer(5, 0.6);
    buffer.add('a');
    buffer.add('b');
    buffer.add('c');
    expect(buffer.length).toBe(3);
  });

  it('should not exceed max size', () => {
    const buffer = new PredictionBuffer(3, 0.6);
    buffer.add('a');
    buffer.add('b');
    buffer.add('c');
    buffer.add('d');
    buffer.add('e');
    expect(buffer.length).toBe(3);
    // oldest predictions should have been dropped
    expect(buffer.getLatestPrediction()).toBe('e');
  });

  it('should return the mode when threshold is met', () => {
    const buffer = new PredictionBuffer(5, 0.6);
    // Need ceil(5 * 0.6) = 3 matching predictions
    buffer.add('a');
    buffer.add('a');
    buffer.add('a');
    buffer.add('b');
    buffer.add('c');
    expect(buffer.getStablePrediction()).toBe('a');
  });

  it('should return null when no prediction meets the threshold', () => {
    const buffer = new PredictionBuffer(5, 0.6);
    buffer.add('a');
    buffer.add('b');
    buffer.add('c');
    buffer.add('d');
    buffer.add('e');
    expect(buffer.getStablePrediction()).toBeNull();
  });

  it('should return null when buffer is empty', () => {
    const buffer = new PredictionBuffer(5, 0.6);
    expect(buffer.getStablePrediction()).toBeNull();
  });

  it('should clear the buffer', () => {
    const buffer = new PredictionBuffer(5, 0.6);
    buffer.add('a');
    buffer.add('b');
    buffer.add('c');
    buffer.clear();
    expect(buffer.length).toBe(0);
    expect(buffer.getStablePrediction()).toBeNull();
    expect(buffer.getLatestPrediction()).toBeNull();
  });

  it('should return the latest prediction', () => {
    const buffer = new PredictionBuffer(5, 0.6);
    buffer.add('a');
    buffer.add('b');
    buffer.add('c');
    expect(buffer.getLatestPrediction()).toBe('c');
  });

  it('should return null for getLatestPrediction when buffer is empty', () => {
    const buffer = new PredictionBuffer(5, 0.6);
    expect(buffer.getLatestPrediction()).toBeNull();
  });

  it('reports the confidence of the agreeing frames, not of the latest frame', () => {
    const buffer = new PredictionBuffer(5, 0.6);
    buffer.add('a', 0.5);
    buffer.add('a', 0.6);
    buffer.add('a', 0.7);
    // a confident frame for another label must not lend its confidence to 'a'
    buffer.add('b', 0.99);
    expect(buffer.getStable()).toEqual({ label: 'a', confidence: expect.closeTo(0.6, 5) });

    buffer.add('b', 0.99);
    buffer.add('b', 0.99);
    expect(buffer.getStable()).toEqual({ label: 'b', confidence: expect.closeTo(0.99, 5) });
  });

  it('has no stable prediction when the window disagrees', () => {
    const buffer = new PredictionBuffer(5, 0.6);
    for (const l of ['a', 'b', 'c', 'd', 'e']) buffer.add(l, 0.9);
    expect(buffer.getStable()).toBeNull();
  });
});
