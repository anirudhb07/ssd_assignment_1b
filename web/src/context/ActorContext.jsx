import { createContext, useContext, useEffect, useState } from 'react';

// "Who am I acting as?" for the demo (no real login). Screens read it with
// useActor(), e.g. Checkout uses actor.user, Analytics uses actor.restaurant.
//
// role:       'customer' | 'manager' | 'dispatcher'
// user:       { id, name } | null       — the customer being acted as
// restaurant: { id, name } | null       — the restaurant being managed

const STORAGE_KEY = 'bitestream.actor';
const DEFAULT_ACTOR = { role: 'customer', user: null, restaurant: null };

const ActorContext = createContext(null);

function loadActor() {
  try {
    return { ...DEFAULT_ACTOR, ...JSON.parse(localStorage.getItem(STORAGE_KEY)) };
  } catch {
    return DEFAULT_ACTOR;
  }
}

export function ActorProvider({ children }) {
  const [actor, setActor] = useState(loadActor);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(actor));
    } catch {
      // Storage can be unavailable (private mode); the switcher still works for this session.
    }
  }, [actor]);

  const value = {
    actor,
    setRole: (role) => setActor((a) => ({ ...a, role })),
    setUser: (user) => setActor((a) => ({ ...a, user })),
    setRestaurant: (restaurant) => setActor((a) => ({ ...a, restaurant })),
  };
  return <ActorContext.Provider value={value}>{children}</ActorContext.Provider>;
}

export function useActor() {
  const ctx = useContext(ActorContext);
  if (!ctx) throw new Error('useActor must be used inside <ActorProvider>');
  return ctx;
}
