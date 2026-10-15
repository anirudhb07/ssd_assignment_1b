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
    <div className="actor-switcher small">
      <label className="actor-switcher__role">
        <span className="muted">Acting as</span>
        <select className="select" value={actor.role} onChange={(e) => setRole(e.target.value)}>
          {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </label>

      {actor.role === 'customer' && (
        <SearchPicker key="customer" noun="customer" fetchList={listUsers} selected={actor.user} onSelect={setUser} autoSelectMatch />
      )}
      {actor.role === 'manager' && (
        <SearchPicker key="restaurant" noun="restaurant" fetchList={listRestaurants} selected={actor.restaurant} onSelect={setRestaurant} autoSelectMatch />
      )}
    </div>
  );
}
