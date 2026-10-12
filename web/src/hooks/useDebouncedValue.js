import { useEffect, useState } from 'react';

// Returns `value` after it has stopped changing for `delay` ms.
// Use it for search boxes so we don't query the API on every keystroke.
export function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
