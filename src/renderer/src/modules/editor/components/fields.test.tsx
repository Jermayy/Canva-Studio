import {
  ColorField,
  NumberField,
  SelectField,
} from '@renderer/modules/editor/components/fields';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

describe('NumberField', () => {
  function setup(value = 10) {
    const onCommit = vi.fn();
    const view = render(
      <NumberField
        label="Width"
        value={value}
        min={1}
        max={100}
        onCommit={onCommit}
      />,
    );
    return { onCommit, input: screen.getByLabelText('Width'), view };
  }

  it('commits on blur, clamped to the range', async () => {
    const { onCommit, input } = setup();

    await userEvent.clear(input);
    await userEvent.type(input, '500');
    fireEvent.blur(input);

    expect(onCommit).toHaveBeenCalledWith(100);
  });

  it('commits on Enter and ignores unchanged values', async () => {
    const { onCommit, input } = setup();

    await userEvent.type(input, '{Enter}');
    expect(onCommit).not.toHaveBeenCalled();

    await userEvent.clear(input);
    await userEvent.type(input, '42{Enter}');
    expect(onCommit).toHaveBeenCalledWith(42);
  });

  it('reverts empty input without committing', async () => {
    const { onCommit, input } = setup();

    await userEvent.clear(input);
    fireEvent.blur(input);

    expect(onCommit).not.toHaveBeenCalled();
    expect(input).toHaveValue(10);
  });

  it('shows external value changes when not editing', () => {
    const { view, input } = setup();

    view.rerender(
      <NumberField label="Width" value={33.333} onCommit={vi.fn()} />,
    );

    expect(input).toHaveValue(33.33);
  });
});

describe('ColorField', () => {
  function setup() {
    const onCommit = vi.fn();
    render(<ColorField label="Fill" value="#112233" onCommit={onCommit} />);
    return {
      onCommit,
      text: screen.getByLabelText('Fill'),
      picker: screen.getByLabelText('Fill picker'),
    };
  }

  it('commits from the colour picker in upper case', () => {
    const { onCommit, picker } = setup();

    fireEvent.change(picker, { target: { value: '#abcdef' } });

    expect(onCommit).toHaveBeenCalledWith('#ABCDEF');
  });

  it('accepts typed hex with or without #', async () => {
    const { onCommit, text } = setup();

    await userEvent.clear(text);
    await userEvent.type(text, 'ff0000{Enter}');

    expect(onCommit).toHaveBeenCalledWith('#FF0000');
  });

  it('reverts invalid hex', async () => {
    const { onCommit, text } = setup();

    await userEvent.clear(text);
    await userEvent.type(text, 'red');
    fireEvent.blur(text);
    fireEvent.blur(text);

    expect(onCommit).not.toHaveBeenCalled();
    expect(text).toHaveValue('#112233');
  });
});

describe('SelectField', () => {
  it('reports the chosen option', async () => {
    const onChange = vi.fn();
    render(
      <SelectField
        label="Align"
        value="left"
        options={[
          { value: 'left', label: 'Left' },
          { value: 'right', label: 'Right' },
        ]}
        onChange={onChange}
      />,
    );

    await userEvent.selectOptions(screen.getByLabelText('Align'), 'Right');

    expect(onChange).toHaveBeenCalledWith('right');
  });
});
