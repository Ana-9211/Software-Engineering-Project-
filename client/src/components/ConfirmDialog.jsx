import { useEffect, useRef } from 'react';

// Simple modal dialog with focus handling and Escape to close
export default function ConfirmDialog({ title, children, confirmLabel = 'Confirm', danger, onConfirm, onCancel, busy, hideConfirm }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onCancel();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [onCancel]);
  return (
    <div className="overlay">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-title" tabIndex={-1} ref={ref}>
        <h2 id="dlg-title">{title}</h2>
        <div>{children}</div>
        <div className="actions">
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>
            {hideConfirm ? 'Close' : 'Cancel'}
          </button>
          {!hideConfirm && (
            <button type="button" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={busy}>
              {confirmLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
