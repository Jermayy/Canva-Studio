import { useImageSourceUrl } from '@renderer/modules/designs/hooks/useImageSourceUrl';
import { polygonPoints } from '@renderer/modules/designs/domain/geometry';
import type {
  DesignDocument,
  DesignElement,
  ImageElement,
  PolygonElement,
  StarElement,
} from '@renderer/modules/editor/domain/designModel';

export interface DesignPreviewProps {
  document: DesignDocument;
  title: string;
}

/**
 * Lightweight SVG rendering of a design for galleries. Cheaper than a
 * Konva stage per card and scales crisply at any size.
 */
export function DesignPreview({ document, title }: DesignPreviewProps) {
  return (
    <svg
      className="design-preview"
      viewBox={`0 0 ${document.width} ${document.height}`}
      role="img"
      aria-label={`Preview of ${title}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <rect
        width={document.width}
        height={document.height}
        fill={document.background}
      />
      {document.elements.map((element) => (
        <PreviewElement key={element.id} element={element} />
      ))}
    </svg>
  );
}

function PreviewElement({ element }: { element: DesignElement }) {
  const transform = `translate(${element.x} ${element.y}) rotate(${element.rotation})`;
  switch (element.type) {
    case 'rect':
      return (
        <rect
          transform={transform}
          width={element.width}
          height={element.height}
          rx={element.cornerRadius}
          fill={element.fill}
          stroke={element.stroke}
          strokeWidth={element.strokeWidth}
          opacity={element.opacity}
        />
      );
    case 'ellipse':
      return (
        <ellipse
          transform={transform}
          cx={element.width / 2}
          cy={element.height / 2}
          rx={element.width / 2}
          ry={element.height / 2}
          fill={element.fill}
          stroke={element.stroke}
          strokeWidth={element.strokeWidth}
          opacity={element.opacity}
        />
      );
    case 'polygon':
    case 'star':
      return <PreviewPolygon element={element} transform={transform} />;
    case 'text':
      return (
        <foreignObject
          transform={transform}
          width={element.width}
          height={
            element.fontSize *
            element.lineHeight *
            (element.text.split('\n').length + 1)
          }
          opacity={element.opacity}
        >
          <div
            style={{
              fontFamily: element.fontFamily,
              fontSize: element.fontSize,
              fontWeight: element.fontStyle.includes('bold') ? 700 : 400,
              fontStyle: element.fontStyle.includes('italic')
                ? 'italic'
                : 'normal',
              lineHeight: element.lineHeight,
              letterSpacing: element.letterSpacing,
              textAlign: element.align,
              color: element.fill,
              whiteSpace: 'pre-wrap',
            }}
          >
            {element.text}
          </div>
        </foreignObject>
      );
    case 'image':
      return <PreviewImage element={element} transform={transform} />;
  }
}

function PreviewPolygon({
  element,
  transform,
}: {
  element: PolygonElement | StarElement;
  transform: string;
}) {
  const points =
    element.type === 'star'
      ? polygonPoints(element, element.points, element.innerRatio)
      : polygonPoints(element, element.sides);
  return (
    <polygon
      transform={transform}
      points={points}
      fill={element.fill}
      stroke={element.stroke}
      strokeWidth={element.strokeWidth}
      opacity={element.opacity}
    />
  );
}

function PreviewImage({
  element,
  transform,
}: {
  element: ImageElement;
  transform: string;
}) {
  const url = useImageSourceUrl(element.source);
  if (!url) {
    return (
      <rect
        transform={transform}
        width={element.width}
        height={element.height}
        fill="#E5E7EB"
      />
    );
  }
  return (
    <image
      transform={transform}
      href={url}
      width={element.width}
      height={element.height}
      opacity={element.opacity}
      preserveAspectRatio="none"
    />
  );
}
