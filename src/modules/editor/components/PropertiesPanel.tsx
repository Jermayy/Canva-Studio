import {
  ColorField,
  NumberField,
  SelectField,
} from '@/modules/editor/components/fields';
import {
  isShapeElement,
  type DesignDocument,
  type DesignElement,
  type FontStyle,
  type ShapeElement,
  type TextAlign,
  type TextElement,
} from '@/modules/editor/domain/designModel';
import { editorStore, useEditor } from '@/modules/editor/state/editorStore';
import { FONT_FAMILIES } from '@/modules/library/domain/elementFactory';

export interface PropertiesPanelProps {
  document: DesignDocument;
}

/** Context-sensitive editing for the selection, or the page when empty. */
export function PropertiesPanel({ document }: PropertiesPanelProps) {
  const selectedIds = useEditor((state) => state.selectedIds);
  const selected = document.elements.filter((element) =>
    selectedIds.includes(element.id),
  );
  const [single] = selected;

  return (
    <aside className="properties-panel" aria-label="Properties">
      {selected.length === 0 && <PageProperties document={document} />}
      {selected.length === 1 && single && (
        <ElementProperties element={single} />
      )}
      {selected.length > 1 && (
        <MultiSelectionProperties ids={selectedIds} count={selected.length} />
      )}
    </aside>
  );
}

function PageProperties({ document }: { document: DesignDocument }) {
  return (
    <section>
      <h2>Page</h2>
      <p className="muted">
        {document.width} × {document.height} px
      </p>
      <ColorField
        label="Background"
        value={document.background}
        onCommit={editorStore.getState().setBackground}
      />
    </section>
  );
}

function ElementProperties({ element }: { element: DesignElement }) {
  const update = (patch: Record<string, unknown>) => {
    editorStore.getState().updateElements([element.id], patch);
  };
  return (
    <>
      <section>
        <h2>
          {element.type === 'text'
            ? 'Text'
            : element.type === 'image'
              ? 'Image'
              : 'Shape'}
        </h2>
        <div className="field-grid">
          <NumberField
            label="X"
            value={element.x}
            onCommit={(x) => {
              update({ x });
            }}
          />
          <NumberField
            label="Y"
            value={element.y}
            onCommit={(y) => {
              update({ y });
            }}
          />
          <NumberField
            label="Width"
            value={element.width}
            min={1}
            onCommit={(width) => {
              update({ width });
            }}
          />
          {element.type !== 'text' && (
            <NumberField
              label="Height"
              value={element.height}
              min={1}
              onCommit={(height) => {
                update({ height });
              }}
            />
          )}
          <NumberField
            label="Rotation"
            value={element.rotation}
            min={-360}
            max={360}
            onCommit={(rotation) => {
              update({ rotation });
            }}
          />
          <NumberField
            label="Opacity %"
            value={Math.round(element.opacity * 100)}
            min={0}
            max={100}
            onCommit={(percent) => {
              update({ opacity: percent / 100 });
            }}
          />
        </div>
      </section>
      {element.type === 'text' && (
        <TextProperties element={element} update={update} />
      )}
      {isShapeElement(element) && (
        <ShapeProperties element={element} update={update} />
      )}
      <ArrangeSection />
    </>
  );
}

interface SectionProps<T> {
  element: T;
  update: (patch: Record<string, unknown>) => void;
}

const ALIGN_OPTIONS: { value: TextAlign; label: string }[] = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Centre' },
  { value: 'right', label: 'Right' },
];

function toggleStyle(current: FontStyle, part: 'bold' | 'italic'): FontStyle {
  const bold = current.includes('bold') !== (part === 'bold');
  const italic = current.includes('italic') !== (part === 'italic');
  if (bold && italic) {
    return 'italic bold';
  }
  if (bold) {
    return 'bold';
  }
  return italic ? 'italic' : 'normal';
}

function TextProperties({ element, update }: SectionProps<TextElement>) {
  return (
    <section>
      <h2>Typography</h2>
      <SelectField
        label="Font"
        value={element.fontFamily}
        options={FONT_FAMILIES.map((font) => ({ value: font, label: font }))}
        onChange={(fontFamily) => {
          update({ fontFamily });
        }}
      />
      <div className="field-grid">
        <NumberField
          label="Size"
          value={element.fontSize}
          min={4}
          max={1000}
          onCommit={(fontSize) => {
            update({ fontSize });
          }}
        />
        <NumberField
          label="Line height"
          value={element.lineHeight}
          min={0.5}
          max={4}
          step={0.1}
          onCommit={(lineHeight) => {
            update({ lineHeight });
          }}
        />
        <NumberField
          label="Spacing"
          value={element.letterSpacing}
          min={-50}
          max={200}
          onCommit={(letterSpacing) => {
            update({ letterSpacing });
          }}
        />
      </div>
      <div className="button-row" role="group" aria-label="Font style">
        <button
          type="button"
          aria-pressed={element.fontStyle.includes('bold')}
          onClick={() => {
            update({ fontStyle: toggleStyle(element.fontStyle, 'bold') });
          }}
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          aria-pressed={element.fontStyle.includes('italic')}
          onClick={() => {
            update({ fontStyle: toggleStyle(element.fontStyle, 'italic') });
          }}
        >
          <em>I</em>
        </button>
      </div>
      <SelectField
        label="Align"
        value={element.align}
        options={ALIGN_OPTIONS}
        onChange={(align) => {
          update({ align });
        }}
      />
      <ColorField
        label="Colour"
        value={element.fill}
        onCommit={(fill) => {
          update({ fill });
        }}
      />
      <button
        type="button"
        className="secondary"
        onClick={() => {
          editorStore.getState().startTextEdit(element.id);
        }}
      >
        Edit text
      </button>
    </section>
  );
}

function ShapeProperties({ element, update }: SectionProps<ShapeElement>) {
  return (
    <section>
      <h2>Fill & border</h2>
      <ColorField
        label="Fill"
        value={element.fill}
        onCommit={(fill) => {
          update({ fill });
        }}
      />
      <ColorField
        label="Border"
        value={element.stroke}
        onCommit={(stroke) => {
          update({ stroke });
        }}
      />
      <div className="field-grid">
        <NumberField
          label="Border width"
          value={element.strokeWidth}
          min={0}
          max={200}
          onCommit={(strokeWidth) => {
            update({ strokeWidth });
          }}
        />
        {element.type === 'rect' && (
          <NumberField
            label="Corner radius"
            value={element.cornerRadius}
            min={0}
            onCommit={(cornerRadius) => {
              update({ cornerRadius });
            }}
          />
        )}
        {element.type === 'polygon' && (
          <NumberField
            label="Sides"
            value={element.sides}
            min={3}
            max={12}
            onCommit={(sides) => {
              update({ sides: Math.round(sides) });
            }}
          />
        )}
        {element.type === 'star' && (
          <NumberField
            label="Points"
            value={element.points}
            min={3}
            max={20}
            onCommit={(points) => {
              update({ points: Math.round(points) });
            }}
          />
        )}
      </div>
    </section>
  );
}

function MultiSelectionProperties({
  ids,
  count,
}: {
  ids: string[];
  count: number;
}) {
  return (
    <>
      <section>
        <h2>{count} elements selected</h2>
        <NumberField
          label="Opacity %"
          value={100}
          min={0}
          max={100}
          onCommit={(percent) => {
            editorStore
              .getState()
              .updateElements(ids, { opacity: percent / 100 });
          }}
        />
      </section>
      <ArrangeSection />
    </>
  );
}

function ArrangeSection() {
  const actions = editorStore.getState();
  return (
    <section>
      <h2>Arrange</h2>
      <div className="button-grid">
        <button
          type="button"
          onClick={() => {
            actions.moveSelected('front');
          }}
        >
          Bring to front
        </button>
        <button
          type="button"
          onClick={() => {
            actions.moveSelected('forward');
          }}
        >
          Forward
        </button>
        <button
          type="button"
          onClick={() => {
            actions.moveSelected('backward');
          }}
        >
          Backward
        </button>
        <button
          type="button"
          onClick={() => {
            actions.moveSelected('back');
          }}
        >
          Send to back
        </button>
        <button type="button" onClick={actions.duplicateSelected}>
          Duplicate
        </button>
        <button
          type="button"
          className="danger"
          onClick={actions.removeSelected}
        >
          Delete
        </button>
      </div>
    </section>
  );
}
