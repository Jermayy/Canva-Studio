import {
  createBlankDocument,
  isShapeElement,
  parseDesignDocument,
  safeParseDesignDocument,
} from '@renderer/modules/editor/domain/designModel';
import {
  ASSET_ID,
  buildDocument,
  buildRect,
  buildText,
} from '@renderer/test/factories';

describe('designModel', () => {
  it('creates a valid blank document', () => {
    const document = createBlankDocument(1080, 1080, '#112233');

    expect(document).toEqual({
      schemaVersion: 1,
      width: 1080,
      height: 1080,
      background: '#112233',
      elements: [],
    });
  });

  it('accepts every element type', () => {
    const document = buildDocument([
      buildRect(),
      buildText(),
      { ...buildRect({ id: 'e' }), type: 'ellipse' } as never,
      {
        id: 'img',
        type: 'image',
        x: 0,
        y: 0,
        rotation: 0,
        opacity: 1,
        width: 10,
        height: 10,
        source: { kind: 'upload', assetId: ASSET_ID },
      },
    ]);

    expect(() => parseDesignDocument(document)).not.toThrow();
  });

  it('rejects malformed colours, sizes and unknown element types', () => {
    expect(
      safeParseDesignDocument(buildDocument([buildRect({ fill: 'red' })])),
    ).toBeNull();
    expect(
      safeParseDesignDocument(buildDocument([buildRect({ width: -5 })])),
    ).toBeNull();
    expect(
      safeParseDesignDocument({
        ...buildDocument(),
        elements: [{ ...buildRect(), type: 'script' }],
      }),
    ).toBeNull();
    expect(
      safeParseDesignDocument({ ...buildDocument(), width: 50 }),
    ).toBeNull();
  });

  it('rejects upload asset ids that are not SHA-256 hex', () => {
    const document = buildDocument([
      {
        id: 'img',
        type: 'image',
        x: 0,
        y: 0,
        rotation: 0,
        opacity: 1,
        width: 10,
        height: 10,
        source: { kind: 'upload', assetId: '../../secret' },
      },
    ]);

    expect(safeParseDesignDocument(document)).toBeNull();
  });

  it('identifies shape elements', () => {
    expect(isShapeElement(buildRect())).toBe(true);
    expect(isShapeElement(buildText())).toBe(false);
  });
});
