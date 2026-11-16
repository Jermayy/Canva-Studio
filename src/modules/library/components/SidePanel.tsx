import { DesignPreview } from '@/modules/designs/components/DesignPreview';
import type { DesignDocument } from '@/modules/editor/domain/designModel';
import { editorStore } from '@/modules/editor/state/editorStore';
import { LibraryTile } from '@/modules/library/components/LibraryTile';
import { UploadsTab } from '@/modules/library/components/UploadsTab';
import {
  createFromLibraryItem,
  type LibraryItem,
  type ShapeKind,
  type TextPreset,
} from '@/modules/library/domain/elementFactory';
import {
  STICKERS,
  stickerDataUrl,
  type StickerCategory,
} from '@/modules/library/domain/stickers';
import { TEMPLATES, type Template } from '@/modules/library/domain/templates';
import { useMemo, useState } from 'react';

const SIDE_TABS = [
  'Templates',
  'Elements',
  'Text',
  'Stickers',
  'Uploads',
] as const;
type SideTab = (typeof SIDE_TABS)[number];

export interface SidePanelProps {
  document: DesignDocument;
}

export function SidePanel({ document }: SidePanelProps) {
  const [tab, setTab] = useState<SideTab>('Templates');

  const addItem = (item: LibraryItem) => {
    const center = { x: document.width / 2, y: document.height / 2 };
    editorStore
      .getState()
      .addElement(createFromLibraryItem(item, center, document));
  };

  return (
    <aside className="side-panel" aria-label="Library">
      <div role="tablist" aria-label="Library sections" className="side-tabs">
        {SIDE_TABS.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            id={`tab-${name}`}
            aria-selected={tab === name}
            aria-controls={`panel-${name}`}
            className={tab === name ? 'active' : undefined}
            onClick={() => {
              setTab(name);
            }}
          >
            {name}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
        className="side-content"
      >
        {tab === 'Templates' && <TemplatesTab document={document} />}
        {tab === 'Elements' && <ShapesTab onAdd={addItem} />}
        {tab === 'Text' && <TextTab onAdd={addItem} />}
        {tab === 'Stickers' && <StickersTab onAdd={addItem} />}
        {tab === 'Uploads' && <UploadsTab onAdd={addItem} />}
      </div>
    </aside>
  );
}

function TemplatesTab({ document }: { document: DesignDocument }) {
  const apply = (template: Template) => {
    const hasContent = document.elements.length > 0;
    if (
      hasContent &&
      !window.confirm(
        `Replace this page with “${template.name}”? You can undo this.`,
      )
    ) {
      return;
    }
    editorStore.getState().replaceDocument(template.build());
  };
  return (
    <div className="template-list">
      {TEMPLATES.map((template) => (
        <TemplateCard key={template.id} template={template} onSelect={apply} />
      ))}
    </div>
  );
}

export function TemplateCard({
  template,
  onSelect,
}: {
  template: Template;
  onSelect: (template: Template) => void;
}) {
  // Built once per card; ids are throwaway for the preview.
  const preview = useMemo(() => template.build(), [template]);
  return (
    <button
      type="button"
      className="template-card"
      onClick={() => {
        onSelect(template);
      }}
    >
      <DesignPreview document={preview} title={template.name} />
      <span className="template-name">{template.name}</span>
      <span className="template-category">{template.category}</span>
    </button>
  );
}

const SHAPES: { kind: ShapeKind; label: string; className: string }[] = [
  { kind: 'rect', label: 'Square', className: 'shape-rect' },
  { kind: 'rounded-rect', label: 'Rounded square', className: 'shape-rounded' },
  { kind: 'ellipse', label: 'Circle', className: 'shape-ellipse' },
  { kind: 'triangle', label: 'Triangle', className: 'shape-triangle' },
  { kind: 'hexagon', label: 'Hexagon', className: 'shape-hexagon' },
  { kind: 'star', label: 'Star', className: 'shape-star' },
];

function ShapesTab({ onAdd }: { onAdd: (item: LibraryItem) => void }) {
  return (
    <div className="tile-grid">
      {SHAPES.map((shape) => (
        <LibraryTile
          key={shape.kind}
          item={{ kind: 'shape', shape: shape.kind }}
          label={shape.label}
          onAdd={onAdd}
        >
          <span
            className={`shape-swatch ${shape.className}`}
            aria-hidden="true"
          />
        </LibraryTile>
      ))}
    </div>
  );
}

const TEXT_PRESET_LABELS: {
  preset: TextPreset;
  label: string;
  className: string;
}[] = [
  { preset: 'heading', label: 'Add a heading', className: 'text-heading' },
  {
    preset: 'subheading',
    label: 'Add a subheading',
    className: 'text-subheading',
  },
  { preset: 'body', label: 'Add body text', className: 'text-body' },
];

function TextTab({ onAdd }: { onAdd: (item: LibraryItem) => void }) {
  return (
    <div className="text-presets">
      {TEXT_PRESET_LABELS.map((entry) => (
        <LibraryTile
          key={entry.preset}
          item={{ kind: 'text', preset: entry.preset }}
          label={entry.label}
          onAdd={onAdd}
          className={`text-preset ${entry.className}`}
        >
          {entry.label}
        </LibraryTile>
      ))}
    </div>
  );
}

const CATEGORY_LABELS: Record<StickerCategory, string> = {
  birthday: 'Birthday',
  christmas: 'Christmas',
  party: 'Party',
  general: 'General',
};

function StickersTab({ onAdd }: { onAdd: (item: LibraryItem) => void }) {
  const categories = Object.keys(CATEGORY_LABELS) as StickerCategory[];
  return (
    <div>
      {categories.map((category) => (
        <section key={category}>
          <h3>{CATEGORY_LABELS[category]}</h3>
          <div className="tile-grid">
            {STICKERS.filter((sticker) => sticker.category === category).map(
              (sticker) => (
                <LibraryTile
                  key={sticker.id}
                  item={{ kind: 'sticker', stickerId: sticker.id }}
                  label={sticker.name}
                  onAdd={onAdd}
                >
                  <img src={stickerDataUrl(sticker)} alt="" />
                </LibraryTile>
              ),
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
