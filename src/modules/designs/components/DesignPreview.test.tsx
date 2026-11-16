import { DesignPreview } from '@/modules/designs/components/DesignPreview';
import { polygonPoints } from '@/modules/designs/domain/geometry';
import { createShape } from '@/modules/library/domain/elementFactory';
import {
  ASSET_ID,
  buildDocument,
  buildRect,
  buildText,
} from '@/test/factories';
import { renderWithProviders } from '@/test/renderWithProviders';
import { screen } from '@testing-library/react';

describe('DesignPreview', () => {
  it('renders every element type as SVG', () => {
    const { container } = renderWithProviders(
      <DesignPreview
        title="Party"
        document={buildDocument([
          buildRect({ id: 'r' }),
          createShape('ellipse', { x: 0, y: 0 }, () => 'e'),
          createShape('hexagon', { x: 0, y: 0 }, () => 'h'),
          createShape('star', { x: 0, y: 0 }, () => 's'),
          buildText({ id: 't', text: 'Hello there', fontStyle: 'italic bold' }),
          {
            id: 'sticker',
            type: 'image',
            x: 0,
            y: 0,
            rotation: 0,
            opacity: 1,
            width: 10,
            height: 10,
            source: { kind: 'sticker', stickerId: 'heart' },
          },
          {
            id: 'upload',
            type: 'image',
            x: 0,
            y: 0,
            rotation: 0,
            opacity: 1,
            width: 10,
            height: 10,
            source: { kind: 'upload', assetId: ASSET_ID },
          },
        ])}
      />,
    );

    expect(
      screen.getByRole('img', { name: 'Preview of Party' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Hello there')).toBeInTheDocument();
    expect(container.querySelectorAll('polygon')).toHaveLength(2);
    expect(container.querySelector('ellipse')).not.toBeNull();
    expect(container.querySelector('image')?.getAttribute('href')).toMatch(
      /^data:image\/svg/,
    );
  });
});

describe('polygonPoints', () => {
  it('places vertices on the bounding box, starting at the top', () => {
    expect(polygonPoints({ width: 100, height: 100 }, 4)).toBe(
      '50.0,0.0 100.0,50.0 50.0,100.0 0.0,50.0',
    );
  });

  it('alternates inner points for stars', () => {
    const points = polygonPoints({ width: 100, height: 100 }, 2, 0.5).split(
      ' ',
    );

    expect(points).toEqual([
      '50.0,0.0',
      '75.0,50.0',
      '50.0,100.0',
      '25.0,50.0',
    ]);
  });
});
