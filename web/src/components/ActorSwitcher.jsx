import { useQuery } from '@tanstack/react-query';
import { listRestaurants, listUsers } from '../api/endpoints.js';
import { useActor } from '../context/ActorContext.jsx';

const ROLES = [
  { value: 'customer', label: 'Customer' },
  { value: 'manager', label: 'Restaurant manager' },
  { value: 'dispatcher', label: 'Dispatcher' },
];

// Header control for switching who you are acting as during the demo.
// TODO (Member B): the lists show the first 20 records only. Add a search
// box (useDebouncedValue + the `search` param) so any user can be picked.
export function ActorSwitcher() {
  const { actor, setRole, setUser, setRestaurant } = useActor();

  const users = useQuery({
    queryKey: ['actor-users'],
    queryFn: () => listUsers({ pageSize: 20 }),
    enabled: actor.role === 'customer',
  });
  const restaurants = useQuery({
    queryKey: ['actor-restaurants'],
    queryFn: () => listRestaurants({ pageSize: 20 }),
    enabled: actor.role === 'manager',
  });

  const pick = (list, id) => {
    const found = list?.items.find((x) => x.id === id);
    return found ? { id: found.id, name: found.name } : null;
  };

  return (
    <div className="row small">
      <label className="row" style={{ gap: 'var(--space-2)' }}>
        <span className="muted">Acting as</span>
        <select className="select" value={actor.role} onChange={(e) => setRole(e.target.value)}>
          {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </label>

      {actor.role === 'customer' && (
        <select
          className="select"
          aria-label="Customer"
          value={actor.user?.id ?? ''}
          onChange={(e) => setUser(pick(users.data, e.target.value))}
        >
          <option value="">{users.isPending ? 'Loading…' : 'Choose a customer'}</option>
          {actor.user && !users.data?.items.some((u) => u.id === actor.user.id) && (
            <option value={actor.user.id}>{actor.user.name}</option>
          )}
          {users.data?.items.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      )}

      {actor.role === 'manager' && (
        <select
          className="select"
          aria-label="Restaurant"
          value={actor.restaurant?.id ?? ''}
          onChange={(e) => setRestaurant(pick(restaurants.data, e.target.value))}
        >
          <option value="">{restaurants.isPending ? 'Loading…' : 'Choose a restaurant'}</option>
          {actor.restaurant && !restaurants.data?.items.some((r) => r.id === actor.restaurant.id) && (
            <option value={actor.restaurant.id}>{actor.restaurant.name}</option>
          )}
          {restaurants.data?.items.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      )}
    </div>
  );
}
