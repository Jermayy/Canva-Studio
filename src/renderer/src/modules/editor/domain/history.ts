/**
 * Bounded undo/redo history over immutable snapshots.
 */
export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

export const MAX_HISTORY = 100;

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

export function pushHistory<T>(history: History<T>, next: T): History<T> {
  if (next === history.present) {
    return history;
  }
  const past = [...history.past, history.present].slice(-MAX_HISTORY);
  return { past, present: next, future: [] };
}

export function undo<T>(history: History<T>): History<T> {
  const previous = history.past.at(-1);
  if (previous === undefined) {
    return history;
  }
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redo<T>(history: History<T>): History<T> {
  const [next, ...rest] = history.future;
  if (next === undefined) {
    return history;
  }
  return {
    past: [...history.past, history.present],
    present: next,
    future: rest,
  };
}
