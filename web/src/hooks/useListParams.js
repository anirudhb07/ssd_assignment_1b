import { useSearchParams } from 'react-router';

// Page number and filters for a paginated list, kept in the URL
// (?tab=orders&status=PREPARING&page=3) so the back button, refresh and
// shared links all show the same list.
//
//   const { params, page, update } = useListParams();
//   update({ status: 'PREPARING', page: null });   // null or '' removes a key
//
// Pass { replace: true } for changes made while typing (search boxes), so
// every keystroke doesn't become a separate step in the back button.
export function useListParams() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number.parseInt(params.get('page'), 10) || 1);

  const update = (changes, { replace = false } = {}) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      for (const [key, value] of Object.entries(changes)) {
        if (value === '' || value == null) next.delete(key);
        else next.set(key, String(value));
      }
      return next;
    }, { replace });
  };

  return { params, page, update };
}
