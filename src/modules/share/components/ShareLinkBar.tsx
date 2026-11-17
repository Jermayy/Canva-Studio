import { useId } from 'react';

export interface ShareLinkBarProps {
  url: string;
  busy: boolean;
  onCopy: () => void;
  onStop: () => void;
}

/** The live share link of the open design, with copy and stop controls. */
export function ShareLinkBar({ url, busy, onCopy, onStop }: ShareLinkBarProps) {
  const inputId = useId();
  return (
    <section className="share-bar" aria-label="Share link">
      <label htmlFor={inputId} className="muted small">
        Anyone with this link can view this design as an image (they can't edit
        it). Copy the link again after changes to update it.
      </label>
      <div className="share-bar-row">
        <input
          id={inputId}
          className="share-url"
          type="url"
          readOnly
          value={url}
          onFocus={(event) => {
            event.currentTarget.select();
          }}
        />
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={onCopy}
        >
          Copy
        </button>
        <button
          type="button"
          className="link-danger"
          disabled={busy}
          onClick={onStop}
        >
          Stop sharing
        </button>
      </div>
    </section>
  );
}
