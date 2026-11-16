import type { TextElement } from '@renderer/modules/editor/domain/designModel';
import { useEffect, useRef, useState } from 'react';

export interface TextEditOverlayProps {
  element: TextElement;
  zoom: number;
  onCommit: (text: string) => void;
  onCancel: () => void;
}

/**
 * A textarea placed exactly over a Konva text node so text is edited in
 * place. Blur or Cmd/Ctrl+Enter commits; Escape cancels.
 */
export function TextEditOverlay({
  element,
  zoom,
  onCommit,
  onCancel,
}: TextEditOverlayProps) {
  const [value, setValue] = useState(element.text);
  const ref = useRef<HTMLTextAreaElement>(null);
  const finished = useRef(false);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const finish = (commit: boolean) => {
    if (finished.current) {
      return;
    }
    finished.current = true;
    if (commit) {
      onCommit(value);
    } else {
      onCancel();
    }
  };

  const isBold = element.fontStyle.includes('bold');
  const isItalic = element.fontStyle.includes('italic');

  return (
    <textarea
      ref={ref}
      aria-label="Edit text"
      className="text-edit-overlay"
      value={value}
      onChange={(event) => {
        setValue(event.target.value);
      }}
      onBlur={() => {
        finish(true);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          finish(false);
        } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          finish(true);
        }
      }}
      style={{
        left: element.x * zoom,
        top: element.y * zoom,
        width: element.width * zoom,
        minHeight: element.fontSize * element.lineHeight * zoom,
        fontSize: element.fontSize * zoom,
        fontFamily: element.fontFamily,
        fontWeight: isBold ? 700 : 400,
        fontStyle: isItalic ? 'italic' : 'normal',
        lineHeight: element.lineHeight,
        letterSpacing: element.letterSpacing * zoom,
        textAlign: element.align,
        color: element.fill,
        transform: `rotate(${element.rotation}deg)`,
      }}
    />
  );
}
