import {
  MAX_HISTORY,
  createHistory,
  pushHistory,
  redo,
  undo,
} from '@renderer/modules/editor/domain/history';

describe('history', () => {
  it('undoes and redoes in order', () => {
    let history = createHistory(1);
    history = pushHistory(history, 2);
    history = pushHistory(history, 3);

    history = undo(history);
    expect(history.present).toBe(2);
    history = undo(history);
    expect(history.present).toBe(1);
    history = redo(history);
    expect(history.present).toBe(2);
  });

  it('clears the redo stack on a new change', () => {
    let history = pushHistory(createHistory(1), 2);
    history = undo(history);

    history = pushHistory(history, 5);

    expect(history.future).toEqual([]);
    expect(redo(history)).toBe(history);
  });

  it('ignores pushes of the same snapshot and undo at the start', () => {
    const history = createHistory('a');

    expect(pushHistory(history, 'a')).toBe(history);
    expect(undo(history)).toBe(history);
  });

  it('caps the number of undo steps', () => {
    let history = createHistory(0);
    for (let step = 1; step <= MAX_HISTORY + 20; step += 1) {
      history = pushHistory(history, step);
    }

    expect(history.past).toHaveLength(MAX_HISTORY);
  });
});
