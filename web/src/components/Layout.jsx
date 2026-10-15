import { Link, NavLink, Outlet } from 'react-router';
import { ActorSwitcher } from './ActorSwitcher.jsx';

// Customer screens first, then the staff screens (restaurant manager,
// dispatcher), with a gap between the two groups (see docs/design/README.md).
const NAV = [
  { to: '/browse', label: 'Browse' },
  { to: '/checkout', label: 'Checkout' },
  { to: '/wallet', label: 'Wallet' },
  { to: '/analytics', label: 'Analytics', groupStart: true },
  { to: '/map', label: 'Map' },
  { to: '/reviews', label: 'Reviews' },
];

export function Layout() {
  return (
    <>
      <header className="app-header">
        <div className="app-header__inner">
          <Link to="/" className="app-brand">BiteStream</Link>
          <nav className="app-nav" aria-label="Main">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} className={item.groupStart ? 'app-nav__group-start' : undefined}>{item.label}</NavLink>
            ))}
          </nav>
          <ActorSwitcher />
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </>
  );
}
