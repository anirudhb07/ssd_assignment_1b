import { Button } from './Button.jsx';

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="state" role="status">
      <div className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ title = 'Nothing to show', message }) {
  return (
    <div className="state">
      <strong>{title}</strong>
      {message && <span>{message}</span>}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="state state--error" role="alert">
      <strong>Couldn’t load this</strong>
      <span>{error?.message ?? 'Something went wrong.'}</span>
      {onRetry && <Button variant="secondary" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

// Wraps a TanStack Query result and renders loading, error and empty states
// so no screen is ever blank. Usage:
//
//   const query = useQuery({ queryKey: [...], queryFn: ... });
//   <QueryState query={query} isEmpty={(d) => d.items.length === 0} emptyMessage="No orders yet.">
//     {(data) => <DataTable rows={data.items} ... />}
//   </QueryState>
export function QueryState({ query, isEmpty, emptyTitle, emptyMessage, loadingLabel, children }) {
  if (query.isPending) return <Loading label={loadingLabel} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (isEmpty?.(query.data)) return <EmptyState title={emptyTitle} message={emptyMessage} />;
  return children(query.data);
}
