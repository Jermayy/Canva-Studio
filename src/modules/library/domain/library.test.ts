import {
  designDocumentSchema,
  designElementSchema,
} from '@/modules/editor/domain/designModel';
import {
  SHAPE_KINDS,
  TEXT_PRESETS,
  createFromLibraryItem,
  createShape,
  createText,
  createUploadedImage,
  parseLibraryItem,
} from '@/modules/library/domain/elementFactory';
import {
  STICKERS,
  findSticker,
  stickerDataUrl,
} from '@/modules/library/domain/stickers';
import { TEMPLATES, findTemplate } from '@/modules/library/domain/templates';
import { ASSET_ID, sequentialIds } from '@/test/factories';

const center = { x: 500, y: 500 };

describe('elementFactory', () => {
  it.each(SHAPE_KINDS)('creates a valid %s centred on the point', (kind) => {
    const shape = createShape(kind, center, sequentialIds());

    expect(designElementSchema.safeParse(shape).success).toBe(true);
    expect(shape.x + shape.width / 2).toBe(500);
    expect(shape.y + shape.height / 2).toBe(500);
  });

  it.each(TEXT_PRESETS)('creates a valid %s text element', (preset) => {
    const text = createText(preset, center, sequentialIds());

    expect(designElementSchema.safeParse(text).success).toBe(true);
  });

  it('scales uploaded images down to fit, keeping aspect ratio', () => {
    const image = createUploadedImage(
      ASSET_ID,
      { width: 4000, height: 2000 },
      center,
      400,
      sequentialIds(),
    );

    expect(image).toMatchObject({ width: 400, height: 200, x: 300, y: 400 });
  });

  it('never upscales small uploaded images', () => {
    const image = createUploadedImage(
      ASSET_ID,
      { width: 100, height: 50 },
      center,
      400,
    );

    expect(image).toMatchObject({ width: 100, height: 50 });
  });

  it('creates elements from every library item kind', () => {
    const size = { width: 1000, height: 1000 };
    const items = [
      { kind: 'shape', shape: 'star' },
      { kind: 'text', preset: 'heading' },
      { kind: 'sticker', stickerId: 'heart' },
      { kind: 'upload', assetId: ASSET_ID, width: 2000, height: 1000 },
    ] as const;

    const types = items.map(
      (item) => createFromLibraryItem(item, center, size, sequentialIds()).type,
    );

    expect(types).toEqual(['star', 'text', 'image', 'image']);
  });
});

describe('parseLibraryItem', () => {
  it('parses valid payloads', () => {
    expect(parseLibraryItem('{"kind":"shape","shape":"rect"}')).toEqual({
      kind: 'shape',
      shape: 'rect',
    });
  });

  it('returns null for foreign or malformed payloads', () => {
    expect(parseLibraryItem('not json')).toBeNull();
    expect(parseLibraryItem('{"kind":"shape","shape":"blob"}')).toBeNull();
    expect(parseLibraryItem('{"kind":"upload","assetId":"x"}')).toBeNull();
  });
});

describe('stickers', () => {
  it('have unique ids and valid SVG markup', () => {
    const ids = STICKERS.map((sticker) => sticker.id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const sticker of STICKERS) {
      expect(sticker.svg.startsWith('<svg')).toBe(true);
    }
  });

  it('build encoded data URLs and look up by id', () => {
    const heart = findSticker('heart');

    expect(heart).toBeDefined();
    expect(stickerDataUrl(heart!)).toMatch(
      /^data:image\/svg\+xml;charset=utf-8,%3Csvg/,
    );
    expect(findSticker('nope')).toBeUndefined();
  });
});

describe('templates', () => {
  it.each(TEMPLATES.map((template) => [template.id, template] as const))(
    '%s builds a valid document with known stickers',
    (_id, template) => {
      const document = template.build(sequentialIds());

      expect(designDocumentSchema.safeParse(document).success).toBe(true);
      for (const element of document.elements) {
        if (element.type === 'image' && element.source.kind === 'sticker') {
          expect(findSticker(element.source.stickerId)).toBeDefined();
        }
      }
    },
  );

  it('produces fresh ids on every build', () => {
    const template = findTemplate('christmas-party');
    const first = template!.build().elements.map((element) => element.id);
    const second = template!.build().elements.map((element) => element.id);

    expect(first.some((id) => second.includes(id))).toBe(false);
  });

  it('covers birthday and christmas categories', () => {
    const categories = new Set(TEMPLATES.map((template) => template.category));

    expect(categories).toEqual(
      new Set(['Birthday', 'Christmas', 'Party', 'Blank']),
    );
    expect(findTemplate('missing')).toBeUndefined();
  });
});
