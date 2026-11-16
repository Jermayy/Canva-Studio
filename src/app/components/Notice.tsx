export interface NoticeProps {
  message: string | null;
  tone?: 'info' | 'error';
  onDismiss: () => void;
}

/** Dismissible banner for feedback such as export results or errors. */
export function Notice({ message, tone = 'info', onDismiss }: NoticeProps) {
  if (!message) {
    return null;
  }
  return (
    <div
      className={`notice notice-${tone}`}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <span>{message}</span>
      <button
        type="button"
        className="ghost"
        aria-label="Dismiss"
        onClick={onDismiss}
      >
        ×
      </button>
    </div>
  );
}
