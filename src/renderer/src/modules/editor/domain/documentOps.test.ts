import { MAX_ELEMENTS } from '@renderer/modules/editor/domain/designModel';
import {
  ElementLimitError,
  InvalidElementError,
  addElements,
  duplicateElements,
  findElement,
  moveLayers,
  referencedAssetIds,
  removeElements,
  setBackground,
  updateElements,
} from '@renderer/modules/editor/domain/documentOps';
import {
  ASSET_ID,
  buildDocument,
  buildRect,
  sequentialIds,
} from '@renderer/test/factories';

const ids = (document: { elements: { id: string }[] }) =>
  document.elements.map((element) => element.id);

describe('addElements', () => {
  it('appends elements on top without mutating the input', () => {
    const original = buildDocument([buildRect({ id: 'a' })]);

    const next = addElements(original, [buildRect({ id: 'b' })]);

    expect(ids(next)).toEqual(['a', 'b']);
    expect(ids(original)).toEqual(['a']);
  });

  it('rejects invalid elements such as NaN positions', () => {
    expect(() =>
      addElements(buildDocument(), [buildRect({ x: Number.NaN })]),
    ).toThrow(InvalidElementError);
  });

  it('enforces the element limit', () => {
    const full = buildDocument(
      Array.from({ length: MAX_ELEMENTS }, (_, index) =>
        buildRect({ id: `r${index}` }),
      ),
    );

    expect(() => addElements(full, [buildRect({ id: 'x' })])).toThrow(
      ElementLimitError,
    );
  });
});

describe('updateElements', () => {
  it('patches only the targeted elements', () => {
    const document = buildDocument([
      buildRect({ id: 'a' }),
      buildRect({ id: 'b' }),
    ]);

    const { document: next, rejectedIds } = updateElements(document, ['b'], {
      x: 99,
      fill: '#00FF00',
    });

    expect(findElement(next, 'a')).toMatchObject({ x: 10 });
    expect(findElement(next, 'b')).toMatchObject({ x: 99, fill: '#00FF00' });
    expect(rejectedIds).toEqual([]);
  });

  it('rejects invalid patches and keeps the original element', () => {
    const document = buildDocument([buildRect({ id: 'a' })]);

    const result = updateElements(document, ['a'], { width: -1 });

    expect(result.document).toBe(document);
    expect(result.rejectedIds).toEqual(['a']);
  });

  it('never lets a patch change id or type', () => {
    const document = buildDocument([buildRect({ id: 'a' })]);

    const { document: next } = updateElements(document, ['a'], {
      id: 'hijack',
      type: 'text',
    });

    expect(next.elements[0]).toMatchObject({ id: 'a', type: 'rect' });
  });

  it('returns the same document when nothing matches', () => {
    const document = buildDocument([buildRect({ id: 'a' })]);

    expect(updateElements(document, ['missing'], { x: 1 }).document).toBe(
      document,
    );
  });
});

describe('removeElements', () => {
  it('removes the given ids', () => {
    const document = buildDocument([
      buildRect({ id: 'a' }),
      buildRect({ id: 'b' }),
    ]);

    expect(ids(removeElements(document, ['a']))).toEqual(['b']);
  });
});

describe('duplicateElements', () => {
  it('copies elements with new ids and an offset', () => {
    const document = buildDocument([buildRect({ id: 'a', x: 0, y: 0 })]);

    const { document: next, newIds } = duplicateElements(
      document,
      ['a'],
      sequentialIds('copy'),
      10,
    );

    expect(newIds).toEqual(['copy-1']);
    expect(findElement(next, 'copy-1')).toMatchObject({ x: 10, y: 10 });
    expect(ids(next)).toEqual(['a', 'copy-1']);
  });
});

describe('moveLayers', () => {
  const document = buildDocument(
    ['a', 'b', 'c', 'd'].map((id) => buildRect({ id })),
  );

  it('brings elements to the front and back', () => {
    expect(ids(moveLayers(document, ['b'], 'front'))).toEqual([
      'a',
      'c',
      'd',
      'b',
    ]);
    expect(ids(moveLayers(document, ['c'], 'back'))).toEqual([
      'c',
      'a',
      'b',
      'd',
    ]);
  });

  it('steps elements forward and backward one layer', () => {
    expect(ids(moveLayers(document, ['b'], 'forward'))).toEqual([
      'a',
      'c',
      'b',
      'd',
    ]);
    expect(ids(moveLayers(document, ['c'], 'backward'))).toEqual([
      'a',
      'c',
      'b',
      'd',
    ]);
  });

  it('moves adjacent selections together and stops at the edges', () => {
    expect(ids(moveLayers(document, ['b', 'c'], 'forward'))).toEqual([
      'a',
      'd',
      'b',
      'c',
    ]);
    expect(ids(moveLayers(document, ['d'], 'forward'))).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
    expect(ids(moveLayers(document, ['a'], 'backward'))).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
  });

  it('returns the same document for an empty selection', () => {
    expect(moveLayers(document, ['zzz'], 'front')).toBe(document);
  });
});

describe('setBackground and referencedAssetIds', () => {
  it('sets the background colour', () => {
    expect(setBackground(buildDocument(), '#000000').background).toBe(
      '#000000',
    );
  });

  it('lists unique uploaded asset ids only', () => {
    const image = {
      id: 'i1',
      type: 'image' as const,
      x: 0,
      y: 0,
      rotation: 0,
      opacity: 1,
      width: 10,
      height: 10,
      source: { kind: 'upload' as const, assetId: ASSET_ID },
    };
    const document = buildDocument([
      image,
      { ...image, id: 'i2' },
      { ...image, id: 's', source: { kind: 'sticker', stickerId: 'heart' } },
      buildRect(),
    ]);

    expect(referencedAssetIds(document)).toEqual([ASSET_ID]);
  });
});
