import {
  MAX_ELEMENTS,
  designElementSchema,
  type DesignDocument,
  type DesignElement,
  type ElementPatch,
} from '@renderer/modules/editor/domain/designModel';

/**
 * Pure, immutable operations on a design document.
 *
 * The editor store composes these; they never mutate their input so undo
 * history can keep references to earlier documents.
 */

export type LayerMove = 'forward' | 'backward' | 'front' | 'back';

export class ElementLimitError extends Error {
  constructor() {
    super(`A design can contain at most ${MAX_ELEMENTS} elements`);
    this.name = 'ElementLimitError';
  }
}

export class InvalidElementError extends Error {
  constructor() {
    super("That item couldn't be added to the design");
    this.name = 'InvalidElementError';
  }
}

/**
 * Appends elements on top. Each one is validated so a bad value (e.g. a
 * NaN position) can never make the saved document unreadable.
 */
export function addElements(
  document: DesignDocument,
  elements: DesignElement[],
): DesignDocument {
  if (document.elements.length + elements.length > MAX_ELEMENTS) {
    throw new ElementLimitError();
  }
  const valid = elements.map((element) => {
    const result = designElementSchema.safeParse(element);
    if (!result.success) {
      throw new InvalidElementError();
    }
    return result.data;
  });
  return { ...document, elements: [...document.elements, ...valid] };
}

/**
 * Applies a patch to the matching elements.
 *
 * The result is re-validated so a bad value from the UI (e.g. a negative
 * width) can never enter the document; invalid patches are ignored for
 * that element and reported via the returned list.
 */
export function updateElements(
  document: DesignDocument,
  ids: readonly string[],
  patch: ElementPatch,
): { document: DesignDocument; rejectedIds: string[] } {
  const targets = new Set(ids);
  const rejectedIds: string[] = [];
  const elements = document.elements.map((element) => {
    if (!targets.has(element.id)) {
      return element;
    }
    const result = designElementSchema.safeParse({
      ...element,
      ...patch,
      id: element.id,
      type: element.type,
    });
    if (!result.success) {
      rejectedIds.push(element.id);
      return element;
    }
    return result.data;
  });
  return {
    document: elements.some(
      (element, index) => element !== document.elements[index],
    )
      ? { ...document, elements }
      : document,
    rejectedIds,
  };
}

export function removeElements(
  document: DesignDocument,
  ids: readonly string[],
): DesignDocument {
  const targets = new Set(ids);
  return {
    ...document,
    elements: document.elements.filter((element) => !targets.has(element.id)),
  };
}

export function duplicateElements(
  document: DesignDocument,
  ids: readonly string[],
  newId: () => string,
  offset = 24,
): { document: DesignDocument; newIds: string[] } {
  const targets = new Set(ids);
  const copies = document.elements
    .filter((element) => targets.has(element.id))
    .map((element) => ({
      ...element,
      id: newId(),
      x: element.x + offset,
      y: element.y + offset,
    }));
  return {
    document: addElements(document, copies),
    newIds: copies.map((copy) => copy.id),
  };
}

/** Moves elements within the z-order; index 0 is the bottom layer. */
export function moveLayers(
  document: DesignDocument,
  ids: readonly string[],
  move: LayerMove,
): DesignDocument {
  const targets = new Set(ids);
  const selected = document.elements.filter((element) =>
    targets.has(element.id),
  );
  if (selected.length === 0) {
    return document;
  }
  const others = document.elements.filter(
    (element) => !targets.has(element.id),
  );
  switch (move) {
    case 'front':
      return { ...document, elements: [...others, ...selected] };
    case 'back':
      return { ...document, elements: [...selected, ...others] };
    case 'forward':
      return {
        ...document,
        elements: stepLayers(document.elements, targets, 1),
      };
    case 'backward':
      return {
        ...document,
        elements: stepLayers(document.elements, targets, -1),
      };
  }
}

function stepLayers(
  elements: DesignElement[],
  targets: Set<string>,
  direction: 1 | -1,
): DesignElement[] {
  const result = [...elements];
  const indices = result.map((_, index) => index);
  // Walk from the edge we move towards so adjacent selections move together.
  const order = direction === 1 ? indices.reverse() : indices;
  for (const index of order) {
    const current = result[index];
    const neighbourIndex = index + direction;
    const neighbour = result[neighbourIndex];
    if (
      current === undefined ||
      neighbour === undefined ||
      !targets.has(current.id) ||
      targets.has(neighbour.id)
    ) {
      continue;
    }
    result[index] = neighbour;
    result[neighbourIndex] = current;
  }
  return result;
}

export function setBackground(
  document: DesignDocument,
  background: string,
): DesignDocument {
  return { ...document, background };
}

/** Asset ids of uploaded images the document depends on. */
export function referencedAssetIds(document: DesignDocument): string[] {
  const ids = new Set<string>();
  for (const element of document.elements) {
    if (element.type === 'image' && element.source.kind === 'upload') {
      ids.add(element.source.assetId);
    }
  }
  return [...ids];
}

export function findElement(
  document: DesignDocument,
  id: string,
): DesignElement | undefined {
  return document.elements.find((element) => element.id === id);
}
