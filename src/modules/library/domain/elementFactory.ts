import type {
  DesignElement,
  ImageElement,
  ShapeElement,
  TextElement,
} from '@/modules/editor/domain/designModel';
import { z } from 'zod';

/**
 * Creates new elements from library items. Positions are the element's
 * centre so dropped items land under the cursor.
 */

export type IdFactory = () => string;

export const defaultIdFactory: IdFactory = () => crypto.randomUUID();

export const SHAPE_KINDS = [
  'rect',
  'rounded-rect',
  'ellipse',
  'triangle',
  'hexagon',
  'star',
] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];

export const TEXT_PRESETS = ['heading', 'subheading', 'body'] as const;
export type TextPreset = (typeof TEXT_PRESETS)[number];

export const FONT_FAMILIES = [
  'Helvetica Neue',
  'Georgia',
  'Arial',
  'Times New Roman',
  'Trebuchet MS',
  'Courier New',
  'Impact',
  'Brush Script MT',
] as const;

/** What the side panel hands to the canvas on click or drop. */
export const libraryItemSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('shape'), shape: z.enum(SHAPE_KINDS) }),
  z.object({ kind: z.literal('text'), preset: z.enum(TEXT_PRESETS) }),
  z.object({
    kind: z.literal('sticker'),
    stickerId: z.string().min(1).max(64),
  }),
  z.object({
    kind: z.literal('upload'),
    assetId: z.string().regex(/^[0-9a-f]{64}$/),
    width: z.number().positive(),
    height: z.number().positive(),
  }),
]);
export type LibraryItem = z.infer<typeof libraryItemSchema>;

/** MIME type used for library drag-and-drop payloads. */
export const LIBRARY_DRAG_MIME = 'application/x-canvas-studio-item';

export interface Point {
  x: number;
  y: number;
}

const SHAPE_SIZE = 200;
const STICKER_SIZE = 180;
const DEFAULT_FILL = '#7C5CFF';

export function createShape(
  kind: ShapeKind,
  center: Point,
  newId: IdFactory = defaultIdFactory,
): ShapeElement {
  const common = {
    id: newId(),
    x: center.x - SHAPE_SIZE / 2,
    y: center.y - SHAPE_SIZE / 2,
    rotation: 0,
    opacity: 1,
    width: SHAPE_SIZE,
    height: SHAPE_SIZE,
    fill: DEFAULT_FILL,
    stroke: '#000000',
    strokeWidth: 0,
  };
  switch (kind) {
    case 'rect':
      return { ...common, type: 'rect', cornerRadius: 0 };
    case 'rounded-rect':
      return { ...common, type: 'rect', cornerRadius: 32 };
    case 'ellipse':
      return { ...common, type: 'ellipse' };
    case 'triangle':
      return { ...common, type: 'polygon', sides: 3 };
    case 'hexagon':
      return { ...common, type: 'polygon', sides: 6 };
    case 'star':
      return { ...common, type: 'star', points: 5, innerRatio: 0.45 };
  }
}

const TEXT_PRESET_STYLE: Record<
  TextPreset,
  Pick<TextElement, 'text' | 'fontSize' | 'fontStyle' | 'width'>
> = {
  heading: {
    text: 'Add a heading',
    fontSize: 72,
    fontStyle: 'bold',
    width: 600,
  },
  subheading: {
    text: 'Add a subheading',
    fontSize: 40,
    fontStyle: 'normal',
    width: 500,
  },
  body: {
    text: 'Add a little bit of body text',
    fontSize: 24,
    fontStyle: 'normal',
    width: 400,
  },
};

export function createText(
  preset: TextPreset,
  center: Point,
  newId: IdFactory = defaultIdFactory,
): TextElement {
  const style = TEXT_PRESET_STYLE[preset];
  return {
    id: newId(),
    type: 'text',
    x: center.x - style.width / 2,
    y: center.y - style.fontSize / 2,
    rotation: 0,
    opacity: 1,
    ...style,
    fontFamily: 'Helvetica Neue',
    align: 'center',
    lineHeight: 1.2,
    letterSpacing: 0,
    fill: '#1F1F1F',
  };
}

export function createSticker(
  stickerId: string,
  center: Point,
  newId: IdFactory = defaultIdFactory,
): ImageElement {
  return {
    id: newId(),
    type: 'image',
    x: center.x - STICKER_SIZE / 2,
    y: center.y - STICKER_SIZE / 2,
    rotation: 0,
    opacity: 1,
    width: STICKER_SIZE,
    height: STICKER_SIZE,
    source: { kind: 'sticker', stickerId },
  };
}

/** Scales an uploaded image to fit within `maxSize`, keeping aspect ratio. */
export function createUploadedImage(
  assetId: string,
  natural: { width: number; height: number },
  center: Point,
  maxSize: number,
  newId: IdFactory = defaultIdFactory,
): ImageElement {
  const scale = Math.min(1, maxSize / Math.max(natural.width, natural.height));
  const width = Math.max(1, Math.round(natural.width * scale));
  const height = Math.max(1, Math.round(natural.height * scale));
  return {
    id: newId(),
    type: 'image',
    x: center.x - width / 2,
    y: center.y - height / 2,
    rotation: 0,
    opacity: 1,
    width,
    height,
    source: { kind: 'upload', assetId },
  };
}

export function createFromLibraryItem(
  item: LibraryItem,
  center: Point,
  designSize: { width: number; height: number },
  newId: IdFactory = defaultIdFactory,
): DesignElement {
  switch (item.kind) {
    case 'shape':
      return createShape(item.shape, center, newId);
    case 'text':
      return createText(item.preset, center, newId);
    case 'sticker':
      return createSticker(item.stickerId, center, newId);
    case 'upload':
      return createUploadedImage(
        item.assetId,
        { width: item.width, height: item.height },
        center,
        Math.min(designSize.width, designSize.height) * 0.6,
        newId,
      );
  }
}

/** Parses an untrusted drag payload; returns null when it isn't ours. */
export function parseLibraryItem(raw: string): LibraryItem | null {
  try {
    const result = libraryItemSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
