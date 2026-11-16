import { TextEditOverlay } from '@/modules/editor/components/TextEditOverlay';
import { buildText } from '@/test/factories';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

function setup() {
  const onCommit = vi.fn();
  const onCancel = vi.fn();
  render(
    <TextEditOverlay
      element={buildText({
        text: 'Hello',
        fontStyle: 'italic bold',
        x: 10,
        y: 20,
      })}
      zoom={0.5}
      onCommit={onCommit}
      onCancel={onCancel}
    />,
  );
  return { onCommit, onCancel, textarea: screen.getByLabelText('Edit text') };
}

describe('TextEditOverlay', () => {
  it('focuses, positions over the text and mirrors its style', () => {
    const { textarea } = setup();

    expect(textarea).toHaveFocus();
    expect(textarea).toHaveStyle({
      left: '5px',
      top: '10px',
      fontWeight: '700',
      fontStyle: 'italic',
    });
  });

  it('commits edited text on blur exactly once', async () => {
    const { onCommit, textarea } = setup();

    await userEvent.clear(textarea);
    await userEvent.type(textarea, 'Bye');
    fireEvent.blur(textarea);
    fireEvent.blur(textarea);

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('Bye');
  });

  it('commits on Cmd+Enter and cancels on Escape', () => {
    const first = setup();
    fireEvent.keyDown(first.textarea, { key: 'Enter', metaKey: true });
    expect(first.onCommit).toHaveBeenCalledWith('Hello');
  });

  it('cancels on Escape without committing', () => {
    const { onCommit, onCancel, textarea } = setup();

    fireEvent.keyDown(textarea, { key: 'Escape' });
    fireEvent.blur(textarea);

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('keeps plain Enter for new lines', () => {
    const { onCommit, textarea } = setup();

    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(onCommit).not.toHaveBeenCalled();
  });
});
