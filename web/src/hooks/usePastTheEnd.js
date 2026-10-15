import { useEffect } from 'react';

// A page number past the end (an old link, or an edited URL) comes back with
// no rows although there are some: go to the last page instead of saying
// "nothing found". Returns true while that jump is happening.
export function usePastTheEnd(data, page, update) {
  const lastPage = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const past = Boolean(data && data.items.length === 0 && data.total > 0 && page > lastPage);
  useEffect(() => {
    if (past) update({ page: lastPage === 1 ? null : lastPage }, { replace: true });
  }, [past, lastPage, update]);
  return past;
}
