import { listRestaurants, listUsers } from '../api/endpoints.js';
import { useActor } from '../context/ActorContext.jsx';
import { SearchPicker } from './SearchPicker.jsx';

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
        <SearchPicker noun="customer" fetchList={listUsers} selected={actor.user} onSelect={setUser} />
      )}
      {actor.role === 'manager' && (
        <SearchPicker noun="restaurant" fetchList={listRestaurants} selected={actor.restaurant} onSelect={setRestaurant} />
      )}
    </div>
  );
}
