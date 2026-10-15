import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';

// Search one server-side page, retaining the current choice outside matches.
// Automatic selection is opt-in: Wallet keeps its explicit selection behavior.
// selected / onSelect use { id, name } (or null for no choice).
export function SearchPicker({
  noun, fetchList, selected, onSelect,
  searchLabel = `Search ${noun}s`, selectLabel = `Choose a ${noun}`,
  autoSelectMatch = false,
}) {
  const [search, setSearch] = useState('');
  const statusId = useId();
  const pendingSelection = useRef(false);
  const debounced = useDebouncedValue(search);
  const list = useQuery({
    queryKey: ['actor-picker', noun, debounced],
    queryFn: () => fetchList({ search: debounced, pageSize: 20 }),
    placeholderData: keepPreviousData,
  });
  const items = list.data?.items ?? [];
  const searching = search !== debounced || list.isFetching || list.isPending;
  const ready = !searching && !list.isPlaceholderData && list.isSuccess;

  // Only a user edit arms selection: refetches or manual clearing must not
  // change the actor later. Like Map, retain a matching choice or use the first result.
  useEffect(() => {
    if (list.isError) pendingSelection.current = false;
    if (!ready || !pendingSelection.current) return;
    pendingSelection.current = false;
    const match = items.find((item) => item.id === selected?.id) ?? items[0];
    if (autoSelectMatch && search.trim()
      && match?.id && match.name && match.id !== selected?.id) {
      onSelect({ id: match.id, name: match.name });
    }
  }, [ready, autoSelectMatch, search, list.data, list.isError, items, selected?.id, onSelect]);

  const firstOption = searching ? 'Loading…'
    : list.isError ? `Couldn’t load ${noun}s`
    : items.length ? `Choose a ${noun}` : 'No matches';
  const status = searching ? `Loading ${noun}s…`
    : list.isError ? `Couldn’t load ${noun}s. ${list.error.message}`
    : !items.length ? 'No matches. Try another search.' : '';

  return (
    <div className="search-picker">
      <input
        className="input" type="search" aria-label={searchLabel}
        placeholder={`Search ${noun}s`} aria-describedby={statusId}
        value={search} onChange={(e) => {
          pendingSelection.current = Boolean(e.target.value.trim());
          setSearch(e.target.value);
        }}
      />
      <select
        className="select" aria-label={selectLabel} value={selected?.id ?? ''}
        disabled={!ready} aria-describedby={statusId}
        onChange={(e) => {
          pendingSelection.current = false;
          const found = items.find((x) => x.id === e.target.value);
          if (found) onSelect({ id: found.id, name: found.name });
          else if (!e.target.value) onSelect(null);
        }}
      >
        <option value="">{firstOption}</option>
        {selected && !items.some((x) => x.id === selected.id) && <option value={selected.id}>{selected.name}</option>}
        {items.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
      <span id={statusId} className="search-picker__status muted small" role="status">{status}</span>
    </div>
  );
}
