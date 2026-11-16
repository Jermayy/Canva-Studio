import { ElementNode } from '@/modules/editor/components/ElementNode';
import { TextEditOverlay } from '@/modules/editor/components/TextEditOverlay';
import type { DesignDocument } from '@/modules/editor/domain/designModel';
import { findElement } from '@/modules/editor/domain/documentOps';
import { editorStore, useEditor } from '@/modules/editor/state/editorStore';
import { setActiveStage } from '@/modules/editor/state/stageRegistry';
import { EDITOR_ONLY_NAME } from '@/modules/export/exportService';
import {
  LIBRARY_DRAG_MIME,
  createFromLibraryItem,
  parseLibraryItem,
} from '@/modules/library/domain/elementFactory';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useEffect, useRef, type DragEvent } from 'react';
import { Layer, Rect, Stage, Transformer } from 'react-konva';

export interface CanvasStageProps {
  document: DesignDocument;
}

const BACKGROUND_NAME = 'design-background';

/**
 * The interactive design surface: renders elements, handles selection,
 * move/resize/rotate via the Transformer, and drops from the side panel.
 */
export function CanvasStage({ document }: CanvasStageProps) {
  const zoom = useEditor((state) => state.zoom);
  const selectedIds = useEditor((state) => state.selectedIds);
  const editingTextId = useEditor((state) => state.editingTextId);
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const actions = editorStore.getState();

  useEffect(() => {
    setActiveStage(stageRef.current);
    return () => {
      setActiveStage(null);
    };
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    const transformer = transformerRef.current;
    if (!stage || !transformer) {
      return;
    }
    const nodes = selectedIds
      .filter((id) => id !== editingTextId)
      .map((id) => stage.findOne(`#${id}`))
      .filter((node): node is Konva.Node => node !== undefined);
    transformer.nodes(nodes);
  }, [selectedIds, editingTextId, document]);

  const handleStageMouseDown = (event: KonvaEventObject<MouseEvent>) => {
    const target = event.target;
    if (target === target.getStage() || target.name() === BACKGROUND_NAME) {
      actions.select([]);
    }
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (event.dataTransfer.types.includes(LIBRARY_DRAG_MIME)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    const item = parseLibraryItem(
      event.dataTransfer.getData(LIBRARY_DRAG_MIME),
    );
    const surface = surfaceRef.current;
    if (!item || !surface) {
      return;
    }
    event.preventDefault();
    const rect = surface.getBoundingClientRect();
    const point = {
      x: (event.clientX - rect.left) / zoom,
      y: (event.clientY - rect.top) / zoom,
    };
    actions.addElement(createFromLibraryItem(item, point, document));
  };

  const editingElement = editingTextId
    ? findElement(document, editingTextId)
    : undefined;

  return (
    <div
      className="canvas-viewport"
      data-testid="canvas-viewport"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div
        ref={surfaceRef}
        className="canvas-surface"
        style={{ width: document.width * zoom, height: document.height * zoom }}
      >
        <Stage
          ref={stageRef}
          width={document.width * zoom}
          height={document.height * zoom}
          scaleX={zoom}
          scaleY={zoom}
          onMouseDown={handleStageMouseDown}
        >
          <Layer>
            <Rect
              name={BACKGROUND_NAME}
              x={0}
              y={0}
              width={document.width}
              height={document.height}
              fill={document.background}
            />
            {document.elements.map((element) => (
              <ElementNode
                key={element.id}
                element={element}
                isEditingText={element.id === editingTextId}
                onSelect={(id, additive) => {
                  if (additive) {
                    actions.toggleSelection(id);
                  } else if (!editorStore.getState().selectedIds.includes(id)) {
                    actions.select([id]);
                  }
                }}
                onChange={(id, patch) => {
                  actions.updateElements([id], patch);
                }}
                onStartTextEdit={actions.startTextEdit}
              />
            ))}
            <Transformer
              ref={transformerRef}
              name={EDITOR_ONLY_NAME}
              rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
              keepRatio={false}
              boundBoxFunc={(oldBox, newBox) =>
                newBox.width < 5 || newBox.height < 5 ? oldBox : newBox
              }
            />
          </Layer>
        </Stage>
        {editingElement?.type === 'text' && (
          <TextEditOverlay
            key={editingElement.id}
            element={editingElement}
            zoom={zoom}
            onCommit={(text) => {
              actions.updateElements([editingElement.id], { text });
              actions.stopTextEdit();
            }}
            onCancel={actions.stopTextEdit}
          />
        )}
      </div>
    </div>
  );
}
