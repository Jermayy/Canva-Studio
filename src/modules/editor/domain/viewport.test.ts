import { MAX_ZOOM, MIN_ZOOM, fitZoom } from '@/modules/editor/domain/viewport';

describe('fitZoom', () => {
  it('fits the limiting dimension with padding', () => {
    expect(
      fitZoom({ width: 1128, height: 628 }, { width: 1000, height: 1000 }),
    ).toBe(0.5);
  });

  it('clamps to the zoom range', () => {
    expect(
      fitZoom({ width: 100000, height: 100000 }, { width: 100, height: 100 }),
    ).toBe(MAX_ZOOM);
    expect(
      fitZoom({ width: 10, height: 10 }, { width: 8000, height: 8000 }),
    ).toBe(MIN_ZOOM);
  });
});
