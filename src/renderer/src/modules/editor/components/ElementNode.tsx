import { useLoadedImage } from '@renderer/app/hooks';
import { useImageSourceUrl } from '@renderer/modules/designs/hooks/useImageSourceUrl';
import { transformPatch } from '@renderer/modules/editor/components/transformPatch';
import type {
  DesignElement,
  ElementPatch,
  ImageElement,
} from '@renderer/modules/editor/domain/designModel';
import type { KonvaEventObject } from 'konva/lib/Node';
import {
  Ellipse,
  Group,
  Image as KonvaImage,
  Rect,
  RegularPolygon,
  Star,
  Text,
} from 'react-konva';

export interface ElementNodeProps {
  element: DesignElement;
  isEditingText: boolean;
  onSelect: (id: string, additive: boolean) => void;
  onChange: (id: string, patch: ElementPatch) => void;
  onStartTextEdit: (id: string) => void;
}

export function ElementNode({
  element,
  isEditingText,
  onSelect,
  onChange,
  onStartTextEdit,
}: ElementNodeProps) {
  const common = {
    id: element.id,
    name: 'design-element',
    x: element.x,
    y: element.y,
    rotation: element.rotation,
    opacity: element.opacity,
    draggable: true,
    onMouseDown: (event: KonvaEventObject<MouseEvent>) => {
      onSelect(element.id, event.evt.shiftKey || event.evt.metaKey);
    },
    onTap: () => {
      onSelect(element.id, false);
    },
    onDragEnd: (event: KonvaEventObject<DragEvent>) => {
      onChange(element.id, { x: event.target.x(), y: event.target.y() });
    },
    onTransformEnd: (event: KonvaEventObject<Event>) => {
      onChange(element.id, transformPatch(element, event.target));
    },
  };

  switch (element.type) {
    case 'rect':
      return (
        <Rect
          {...common}
          width={element.width}
          height={element.height}
          fill={element.fill}
          stroke={element.stroke}
          strokeWidth={element.strokeWidth}
          cornerRadius={element.cornerRadius}
        />
      );
    case 'ellipse':
      return (
        <Group {...common}>
          <Ellipse
            x={element.width / 2}
            y={element.height / 2}
            radiusX={element.width / 2}
            radiusY={element.height / 2}
            fill={element.fill}
            stroke={element.stroke}
            strokeWidth={element.strokeWidth}
          />
        </Group>
      );
    case 'polygon':
      return (
        <Group {...common}>
          <RegularPolygon
            x={element.width / 2}
            y={element.height / 2}
            sides={element.sides}
            radius={element.width / 2}
            scaleY={element.height / element.width}
            strokeScaleEnabled={false}
            fill={element.fill}
            stroke={element.stroke}
            strokeWidth={element.strokeWidth}
          />
        </Group>
      );
    case 'star':
      return (
        <Group {...common}>
          <Star
            x={element.width / 2}
            y={element.height / 2}
            numPoints={element.points}
            outerRadius={element.width / 2}
            innerRadius={(element.width / 2) * element.innerRatio}
            scaleY={element.height / element.width}
            strokeScaleEnabled={false}
            fill={element.fill}
            stroke={element.stroke}
            strokeWidth={element.strokeWidth}
          />
        </Group>
      );
    case 'text':
      return (
        <Text
          {...common}
          text={element.text}
          width={element.width}
          fontFamily={element.fontFamily}
          fontSize={element.fontSize}
          fontStyle={element.fontStyle}
          align={element.align}
          lineHeight={element.lineHeight}
          letterSpacing={element.letterSpacing}
          fill={element.fill}
          visible={!isEditingText}
          onDblClick={() => {
            onStartTextEdit(element.id);
          }}
          onDblTap={() => {
            onStartTextEdit(element.id);
          }}
        />
      );
    case 'image':
      return <ImageNode element={element} common={common} />;
  }
}

interface ImageNodeProps {
  element: ImageElement;
  common: Record<string, unknown>;
}

function ImageNode({ element, common }: ImageNodeProps) {
  const url = useImageSourceUrl(element.source);
  const image = useLoadedImage(url);
  if (!image) {
    // Placeholder keeps the element selectable while the image loads.
    return (
      <Rect
        {...common}
        width={element.width}
        height={element.height}
        fill="#E5E7EB"
      />
    );
  }
  return (
    <KonvaImage
      {...common}
      image={image}
      width={element.width}
      height={element.height}
    />
  );
}
