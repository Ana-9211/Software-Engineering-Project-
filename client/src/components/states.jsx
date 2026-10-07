// Loading, empty and error states: every screen shows all three (Architecture 6.4).
export function Loading({ label = 'Loading' }) {
  return (
    <div className="state" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" /> {label}...
    </div>
  );
}

export function EmptyState({ title, children }) {
  return (
    <div className="state empty">
      <p className="state-title">{title}</p>
      {children}
    </div>
  );
}

export function ErrorMessage({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="alert alert-error" role="alert">
      <span>{error.message || 'Something went wrong.'}</span>
      {onRetry && (
        <button type="button" className="btn btn-small" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

// wraps a useFetch result: loading, error, optional empty message, then the content
export function Async({ state, empty, children }) {
  if (state.loading && !state.data) return <Loading />;
  if (state.error) return <ErrorMessage error={state.error} onRetry={state.reload} />;
  if (empty && state.data && empty.test(state.data)) return <EmptyState title={empty.title}>{empty.children}</EmptyState>;
  return children(state.data);
}
