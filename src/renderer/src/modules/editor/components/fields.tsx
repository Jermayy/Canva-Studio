import { useId, useState } from 'react';

export interface NumberFieldProps {
  label: string;
  value: number;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

/**
 * Numeric input that commits on blur/Enter so typing "1" on the way to
 * "120" doesn't create intermediate undo steps.
 */
export function NumberField({
  label,
  value,
  onCommit,
  min,
  max,
  step = 1,
}: NumberFieldProps) {
  const id = useId();
  // null while not editing, so the field always reflects the live value.
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft === null) {
      return;
    }
    setDraft(null);
    const parsed = Number(draft);
    if (draft.trim() === '' || !Number.isFinite(parsed)) {
      return;
    }
    const clamped = Math.min(
      max ?? Infinity,
      Math.max(min ?? -Infinity, parsed),
    );
    if (clamped !== value) {
      onCommit(clamped);
    }
  };

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        value={draft ?? formatNumber(value)}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            commit();
          }
        }}
      />
    </div>
  );
}

function formatNumber(value: number): string {
  return String(Math.round(value * 100) / 100);
}

export interface ColorFieldProps {
  label: string;
  value: string;
  onCommit: (value: string) => void;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

export function ColorField({ label, value, onCommit }: ColorFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);

  const commitHex = () => {
    if (draft === null) {
      return;
    }
    setDraft(null);
    const normalised = draft.startsWith('#') ? draft : `#${draft}`;
    if (HEX.test(normalised)) {
      onCommit(normalised.toUpperCase());
    }
  };

  return (
    <div className="field field-color">
      <label htmlFor={id}>{label}</label>
      <div className="color-inputs">
        <input
          type="color"
          aria-label={`${label} picker`}
          value={value.slice(0, 7)}
          onChange={(event) => {
            onCommit(event.target.value.toUpperCase());
          }}
        />
        <input
          id={id}
          type="text"
          value={draft ?? value}
          maxLength={7}
          spellCheck={false}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          onBlur={commitHex}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              commitHex();
            }
          }}
        />
      </div>
    </div>
  );
}

export interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: SelectFieldProps<T>) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        onChange={(event) => {
          const next = options.find(
            (option) => option.value === event.target.value,
          );
          if (next) {
            onChange(next.value);
          }
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
