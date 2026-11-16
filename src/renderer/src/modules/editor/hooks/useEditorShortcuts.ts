import { editorStore } from '@renderer/modules/editor/state/editorStore';
import { useEffect } from 'react';

const ZOOM_STEP = 1.2;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
  );
}

/** Maps a key event to an editor action; returns true if handled. */
export function handleEditorKey(event: KeyboardEvent): boolean {
  if (isTypingTarget(event.target)) {
    return false;
  }
  const state = editorStore.getState();
  const mod = event.metaKey || event.ctrlKey;
  const key = event.key.toLowerCase();
  const step = event.shiftKey ? 10 : 1;

  if (mod && key === 'z') {
    if (event.shiftKey) {
      state.redo();
    } else {
      state.undo();
    }
    return true;
  }
  if (mod && key === 'y') {
    state.redo();
    return true;
  }
  if (mod && key === 'd') {
    state.duplicateSelected();
    return true;
  }
  if (mod && (key === '=' || key === '+')) {
    state.setZoom(state.zoom * ZOOM_STEP);
    return true;
  }
  if (mod && key === '-') {
    state.setZoom(state.zoom / ZOOM_STEP);
    return true;
  }
  if (mod) {
    return false;
  }
  switch (key) {
    case 'delete':
    case 'backspace':
      state.removeSelected();
      return true;
    case 'escape':
      state.select([]);
      return true;
    case 'arrowleft':
      state.nudgeSelected(-step, 0);
      return true;
    case 'arrowright':
      state.nudgeSelected(step, 0);
      return true;
    case 'arrowup':
      state.nudgeSelected(0, -step);
      return true;
    case 'arrowdown':
      state.nudgeSelected(0, step);
      return true;
    default:
      return false;
  }
}

export function useEditorShortcuts(): void {
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (handleEditorKey(event)) {
        event.preventDefault();
      }
    };
    window.addEventListener('keydown', listener);
    return () => {
      window.removeEventListener('keydown', listener);
    };
  }, []);
}
