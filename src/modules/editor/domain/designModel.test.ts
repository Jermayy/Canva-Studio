import {
  DESIGN_SCHEMA_VERSION,
  NewerSchemaVersionError,
  createBlankDocument,
  isShapeElement,
  parseDesignDocument,
  safeParseDesignDocument,
  upgradeDesignDocument,
} from '@/modules/editor/domain/designModel';
import {
  ASSET_ID,
  buildDocument,
  buildRect,
  buildText,
} from '@/test/factories';

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

describe('upgradeDesignDocument', () => {
  // A pretend v1 -> v2 -> v3 history: v2 renamed `bg` to `background`,
  // v3 added a `guides` list.
  const migrations = {
    1: ({ bg, ...rest }: Record<string, unknown>) => ({
      ...rest,
      background: bg,
    }),
    2: (document: Record<string, unknown>) => ({ ...document, guides: [] }),
  };

  it('applies each migration in order up to the current version', () => {
    const upgraded = upgradeDesignDocument(
      { schemaVersion: 1, bg: '#FFFFFF', elements: [] },
      migrations,
      3,
    );

    expect(upgraded).toEqual({
      schemaVersion: 3,
      background: '#FFFFFF',
      elements: [],
      guides: [],
    });
  });

  it('leaves current documents untouched', () => {
    const document = buildDocument();

    expect(upgradeDesignDocument(document)).toBe(document);
    expect(document.schemaVersion).toBe(DESIGN_SCHEMA_VERSION);
  });

  it('refuses documents from a newer app version', () => {
    const newer = {
      ...buildDocument(),
      schemaVersion: DESIGN_SCHEMA_VERSION + 1,
    };

    expect(() => upgradeDesignDocument(newer)).toThrow(NewerSchemaVersionError);
    // Not swallowed as "invalid": skipping it would drop the user's design.
    expect(() => safeParseDesignDocument(newer)).toThrow(
      NewerSchemaVersionError,
    );
  });

  it('fails loudly when a migration step is missing', () => {
    expect(() =>
      upgradeDesignDocument({ schemaVersion: 1 }, { 2: (d) => d }, 3),
    ).toThrow('No migration from schema version 1');
  });

  it('passes unversioned or malformed input through for schema validation', () => {
    for (const input of [
      null,
      [],
      'x',
      { schemaVersion: 'one' },
      { schemaVersion: 0 },
    ]) {
      expect(upgradeDesignDocument(input)).toBe(input);
      expect(safeParseDesignDocument(input)).toBeNull();
    }
  });
});
