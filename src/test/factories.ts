import {
  createBlankDocument,
  type DesignDocument,
  type DesignElement,
  type RectElement,
  type TextElement,
} from '@/modules/editor/domain/designModel';

/** Deterministic id factory for tests: id-1, id-2, ... */
export function sequentialIds(prefix = 'id'): () => string {
  let next = 0;
  return () => {
    next += 1;
    return `${prefix}-${next}`;
  };
}

export function buildRect(overrides: Partial<RectElement> = {}): RectElement {
  return {
    id: 'rect-1',
    type: 'rect',
    x: 10,
    y: 20,
    rotation: 0,
    opacity: 1,
    width: 100,
    height: 50,
    fill: '#FF0000',
    stroke: '#000000',
    strokeWidth: 0,
    cornerRadius: 0,
    ...overrides,
  };
}

export function buildText(overrides: Partial<TextElement> = {}): TextElement {
  return {
    id: 'text-1',
    type: 'text',
    x: 0,
    y: 0,
    rotation: 0,
    opacity: 1,
    text: 'Hello',
    width: 300,
    fontFamily: 'Arial',
    fontSize: 32,
    fontStyle: 'normal',
    align: 'left',
    lineHeight: 1.2,
    letterSpacing: 0,
    fill: '#000000',
    ...overrides,
  };
}

export function buildDocument(elements: DesignElement[] = []): DesignDocument {
  return { ...createBlankDocument(800, 600), elements };
}

/** A valid asset id (SHA-256 hex) for tests. */
export const ASSET_ID = 'a'.repeat(64);
