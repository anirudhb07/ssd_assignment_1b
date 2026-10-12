import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { listRestaurants, listUsers } from '../api/endpoints.js';
import { useActor } from '../context/ActorContext.jsx';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';

const ROLES = [
  { value: 'customer', label: 'Customer' },
  { value: 'manager', label: 'Restaurant manager' },
  { value: 'dispatcher', label: 'Dispatcher' },
];

// Header control for switching who you are acting as during the demo.
export function ActorSwitcher() {
  const { actor, setRole, setUser, setRestaurant } = useActor();

  return (
    <div className="row small">
      <label className="row" style={{ gap: 'var(--space-2)' }}>
        <span className="muted">Acting as</span>
        <select className="select" value={actor.role} onChange={(e) => setRole(e.target.value)}>
          {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </label>

      {actor.role === 'customer' && (
        <Picker noun="customer" placeholder="Search customers" fetchList={listUsers} selected={actor.user} onSelect={setUser} />
      )}
      {actor.role === 'manager' && (
        <Picker noun="restaurant" placeholder="Search restaurants" fetchList={listRestaurants} selected={actor.restaurant} onSelect={setRestaurant} />
      )}
    </div>
  );
}

// A search box that narrows a dropdown of up to 20 matches, so any of the
// 10,000 customers or 500 restaurants can be picked. The current choice
// stays listed even when it isn't among the matches.
function Picker({ noun, placeholder, fetchList, selected, onSelect }) {
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
        aria-label={placeholder}
        placeholder={placeholder}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ width: '10rem' }}
      />
      <select
        className="select"
        aria-label={`Choose a ${noun}`}
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
