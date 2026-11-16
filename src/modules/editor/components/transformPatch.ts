import type {
  DesignElement,
  ElementPatch,
} from '@/modules/editor/domain/designModel';
import type Konva from 'konva';

const MIN_SIZE = 5;

/**
 * Converts the Transformer's scale on a node back into model sizes so
 * elements never keep a scale (keeps strokes and text crisp).
 */
export function transformPatch(
  element: DesignElement,
  node: Konva.Node,
): ElementPatch {
  const scaleX = node.scaleX();
  const scaleY = node.scaleY();
  node.scaleX(1);
  node.scaleY(1);
  const base = { x: node.x(), y: node.y(), rotation: node.rotation() };
  if (element.type === 'text') {
    return {
      ...base,
      width: Math.max(MIN_SIZE, element.width * scaleX),
      fontSize: Math.max(4, Math.round(element.fontSize * scaleY)),
    };
  }
  return {
    ...base,
    width: Math.max(MIN_SIZE, element.width * scaleX),
    height: Math.max(MIN_SIZE, element.height * scaleY),
  };
}
