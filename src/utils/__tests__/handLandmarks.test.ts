import { describe, it, expect } from 'vitest';
import { coverPoint } from '../handLandmarks';

describe('coverPoint', () => {
  it('scales directly when the box has the video aspect ratio', () => {
    expect(coverPoint({ x: 0.25, y: 0.5 }, 640, 480, 320, 240)).toEqual({ x: 80, y: 120 });
  });

  it('accounts for the sides cropped from a wide video in a tall box', () => {
    // 640x480 in a 300x400 box: scaled to 533x400, 117px cropped on each side
    const centre = coverPoint({ x: 0.5, y: 0.5 }, 640, 480, 300, 400);
    expect(centre.x).toBeCloseTo(150);
    expect(centre.y).toBeCloseTo(200);
    const left = coverPoint({ x: 0, y: 0 }, 640, 480, 300, 400);
    expect(left.x).toBeCloseTo(-116.67, 1);  // outside the visible box
    expect(left.y).toBeCloseTo(0);
  });

  it('accounts for the top and bottom cropped from a tall video in a wide box', () => {
    const p = coverPoint({ x: 1, y: 1 }, 480, 640, 400, 300);
    expect(p.x).toBeCloseTo(400);
    expect(p.y).toBeCloseTo(416.67, 1);
  });

  it('mirrors x for the selfie view', () => {
    expect(coverPoint({ x: 0.25, y: 0.5 }, 640, 480, 320, 240, true)).toEqual({ x: 240, y: 120 });
  });

  it('falls back to direct scaling before the video reports its size', () => {
    expect(coverPoint({ x: 0.5, y: 0.5 }, 0, 0, 300, 400)).toEqual({ x: 150, y: 200 });
  });
});
