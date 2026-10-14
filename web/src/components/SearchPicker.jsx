import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';

// A search box that narrows a dropdown of up to 20 matches, so any of the
// 10,000 customers or 500 restaurants can be picked. The current choice
// stays listed even when it isn't among the matches. Used by the "Acting as"
// switcher and the Wallet screen.
//
// selected / onSelect use { id, name } (or null for no choice).
export function SearchPicker({
  noun, fetchList, selected, onSelect,
  searchLabel = `Search ${noun}s`, selectLabel = `Choose a ${noun}`,
}) {
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search);
  const list = useQuery({
    queryKey: ['actor-picker', noun, debounced],
    queryFn: () => fetchList({ search: debounced, pageSize: 20 }),
    placeholderData: keepPreviousData,
  });
  const items = list.data?.items ?? [];

  const firstOption = list.isPending ? 'Loading…'
    : list.isError ? `Couldn’t load ${noun}s`
    : items.length ? `Choose a ${noun}`
    : 'No matches';

  return (
    <>
      <input
        className="input"
        type="search"
        aria-label={searchLabel}
        placeholder={`Search ${noun}s`}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ width: '10rem' }}
      />
      <select
        className="select"
        aria-label={selectLabel}
        value={selected?.id ?? ''}
        onChange={(e) => {
          const found = items.find((x) => x.id === e.target.value);
          onSelect(found ? { id: found.id, name: found.name } : null);
        }}
      >
        <option value="">{firstOption}</option>
        {selected && !items.some((x) => x.id === selected.id) && <option value={selected.id}>{selected.name}</option>}
        {items.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
    </>
  );
}
