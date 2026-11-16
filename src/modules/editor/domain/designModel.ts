import { z } from 'zod';

/**
 * The design document format.
 *
 * Every document loaded from disk or the cloud is parsed with
 * `designDocumentSchema`, so the editor can trust its shape. Bump
 * `schemaVersion` and add a migration when the format changes.
 */

export const DESIGN_SCHEMA_VERSION = 1;
export const MAX_ELEMENTS = 500;
export const MIN_DESIGN_SIZE = 100;
export const MAX_DESIGN_SIZE = 8000;

// Zod 4 numbers already reject Infinity/NaN.
const finite = z.number();
const size = z.number().min(1).max(20_000);
const color = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/, 'expected #RRGGBB colour');

const baseElement = {
  id: z.string().min(1).max(64),
  x: finite,
  y: finite,
  rotation: finite,
  opacity: z.number().min(0).max(1),
};

const paint = {
  fill: color,
  stroke: color,
  strokeWidth: z.number().min(0).max(200),
};

export const rectElementSchema = z.object({
  ...baseElement,
  ...paint,
  type: z.literal('rect'),
  width: size,
  height: size,
  cornerRadius: z.number().min(0).max(10_000),
});

export const ellipseElementSchema = z.object({
  ...baseElement,
  ...paint,
  type: z.literal('ellipse'),
  width: size,
  height: size,
});

export const polygonElementSchema = z.object({
  ...baseElement,
  ...paint,
  type: z.literal('polygon'),
  width: size,
  height: size,
  sides: z.number().int().min(3).max(12),
});

export const starElementSchema = z.object({
  ...baseElement,
  ...paint,
  type: z.literal('star'),
  width: size,
  height: size,
  points: z.number().int().min(3).max(20),
  innerRatio: z.number().min(0.1).max(0.95),
});

export const FONT_STYLES = ['normal', 'bold', 'italic', 'italic bold'] as const;
export const TEXT_ALIGNS = ['left', 'center', 'right'] as const;

export const textElementSchema = z.object({
  ...baseElement,
  type: z.literal('text'),
  text: z.string().max(5000),
  width: size,
  fontFamily: z.string().min(1).max(100),
  fontSize: z.number().min(4).max(1000),
  fontStyle: z.enum(FONT_STYLES),
  align: z.enum(TEXT_ALIGNS),
  lineHeight: z.number().min(0.5).max(4),
  letterSpacing: z.number().min(-50).max(200),
  fill: color,
});

export const imageSourceSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('sticker'),
    stickerId: z.string().min(1).max(64),
  }),
  z.object({
    kind: z.literal('upload'),
    // SHA-256 hex of the image bytes.
    assetId: z.string().regex(/^[0-9a-f]{64}$/),
  }),
]);

export const imageElementSchema = z.object({
  ...baseElement,
  type: z.literal('image'),
  width: size,
  height: size,
  source: imageSourceSchema,
});

export const designElementSchema = z.discriminatedUnion('type', [
  rectElementSchema,
  ellipseElementSchema,
  polygonElementSchema,
  starElementSchema,
  textElementSchema,
  imageElementSchema,
]);

export const designDocumentSchema = z.object({
  schemaVersion: z.literal(DESIGN_SCHEMA_VERSION),
  width: z.number().int().min(MIN_DESIGN_SIZE).max(MAX_DESIGN_SIZE),
  height: z.number().int().min(MIN_DESIGN_SIZE).max(MAX_DESIGN_SIZE),
  background: color,
  elements: z.array(designElementSchema).max(MAX_ELEMENTS),
});

export type RectElement = z.infer<typeof rectElementSchema>;
export type EllipseElement = z.infer<typeof ellipseElementSchema>;
export type PolygonElement = z.infer<typeof polygonElementSchema>;
export type StarElement = z.infer<typeof starElementSchema>;
export type TextElement = z.infer<typeof textElementSchema>;
export type ImageElement = z.infer<typeof imageElementSchema>;
export type ImageSource = z.infer<typeof imageSourceSchema>;
export type DesignElement = z.infer<typeof designElementSchema>;
export type DesignDocument = z.infer<typeof designDocumentSchema>;
export type ShapeElement =
  RectElement | EllipseElement | PolygonElement | StarElement;
export type FontStyle = (typeof FONT_STYLES)[number];
export type TextAlign = (typeof TEXT_ALIGNS)[number];

/** Fields any element may have patched from the properties panel. */
export type ElementPatch = Partial<Omit<DesignElement, 'id' | 'type'>> &
  Record<string, unknown>;

export function isShapeElement(
  element: DesignElement,
): element is ShapeElement {
  return (
    element.type === 'rect' ||
    element.type === 'ellipse' ||
    element.type === 'polygon' ||
    element.type === 'star'
  );
}

export function parseDesignDocument(input: unknown): DesignDocument {
  return designDocumentSchema.parse(input);
}

export function safeParseDesignDocument(input: unknown): DesignDocument | null {
  const result = designDocumentSchema.safeParse(input);
  return result.success ? result.data : null;
}

export function createBlankDocument(
  width: number,
  height: number,
  background = '#FFFFFF',
): DesignDocument {
  return parseDesignDocument({
    schemaVersion: DESIGN_SCHEMA_VERSION,
    width,
    height,
    background,
    elements: [],
  });
}
