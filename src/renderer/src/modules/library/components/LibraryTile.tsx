import {
  LIBRARY_DRAG_MIME,
  type LibraryItem,
} from '@renderer/modules/library/domain/elementFactory';
import type { ReactNode } from 'react';

export interface LibraryTileProps {
  item: LibraryItem;
  label: string;
  onAdd: (item: LibraryItem) => void;
  children: ReactNode;
  className?: string;
}

/**
 * A library entry that can be clicked (adds at the page centre) or
 * dragged onto the canvas (adds where it's dropped).
 */
export function LibraryTile({
  item,
  label,
  onAdd,
  children,
  className,
}: LibraryTileProps) {
  return (
    <button
      type="button"
      draggable
      className={`library-tile ${className ?? ''}`}
      title={`${label} — click or drag onto the page`}
      aria-label={`Add ${label}`}
      onClick={() => {
        onAdd(item);
      }}
      onDragStart={(event) => {
        event.dataTransfer.setData(LIBRARY_DRAG_MIME, JSON.stringify(item));
        event.dataTransfer.effectAllowed = 'copy';
      }}
    >
      {children}
    </button>
  );
}
