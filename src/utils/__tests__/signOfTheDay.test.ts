import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch before importing the module
const mockMetadata = {
  signs: {
    // single-letter signs (filtered out by the module since length <= 1)
    a: {},
    b: {},
    // multi-character signs (these are kept)
    hello: {},
    goodbye: {},
    thank_you: {},
    please: {},
    happy: {},
    sad: {},
    mother: {},
    father: {},
    january: {},
    february: {},
  },
};

describe('signOfTheDay', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    // Mock global fetch
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({
        json: () => Promise.resolve(mockMetadata),
      })
    ));
  });

  it('should return a string', async () => {
    const { getSignOfTheDay } = await import('../signOfTheDay');
    const sign = await getSignOfTheDay();
    expect(sign).toBeTypeOf('string');
    expect((sign as string).length).toBeGreaterThan(0);
  });

  it('should return the same sign for the same date (deterministic)', async () => {
    // Fix the date so both calls see the same "today"
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-31'));

    const { getSignOfTheDay } = await import('../signOfTheDay');
    const sign1 = await getSignOfTheDay();
    const sign2 = await getSignOfTheDay();
    expect(sign1).toBe(sign2);

    vi.useRealTimers();
  });

  it('should return a sign from the filtered list (multi-character only)', async () => {
    const { getSignOfTheDay } = await import('../signOfTheDay');
    const sign = await getSignOfTheDay();
    // The module filters to signs with length > 1 (not single letters)
    const expectedSigns = Object.keys(mockMetadata.signs).filter(
      (s) => s.length > 1
    );
    expect(expectedSigns).toContain(sign);
  });

  it('should return null when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('Network error'))));
    const { getSignOfTheDay } = await import('../signOfTheDay');
    const sign = await getSignOfTheDay();
    expect(sign).toBeNull();
  });
});
