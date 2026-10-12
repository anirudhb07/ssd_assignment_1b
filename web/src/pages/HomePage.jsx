import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { getHealth } from '../api/endpoints.js';
import { Card, PageHeader } from '../components/ui/index.js';

const SCREENS = [
  { to: '/browse', title: 'Browse', text: 'Users, restaurants and orders, page by page.' },
  { to: '/checkout', title: 'Checkout', text: 'Place an order and watch the wallet update.' },
  { to: '/wallet', title: 'Wallet', text: 'Every debit and credit, with a running balance.' },
  { to: '/analytics', title: 'Analytics', text: 'Revenue trends and restaurant rankings.' },
  { to: '/map', title: 'Map', text: 'The nearest drivers to a restaurant, live.' },
  { to: '/reviews', title: 'Reviews', text: 'Ratings, top tags and the menu.' },
];

export function HomePage() {
  const health = useQuery({ queryKey: ['health'], queryFn: getHealth, retry: false });

  return (
    <>
      <PageHeader title="BiteStream" description="Food delivery, from order to doorstep." />
      <SystemStatus health={health} />
      <div className="grid-cards">
        {SCREENS.map((s) => (
          <Card key={s.to} title={<Link to={s.to}>{s.title}</Link>}>
            <p className="muted small">{s.text}</p>
          </Card>
        ))}
      </div>
    </>
  );
}

// Quick check that the API and both databases are reachable.
function SystemStatus({ health }) {
  if (health.isPending) return <div className="alert alert--info">Checking the API…</div>;
  if (health.isError) {
    return <div className="alert alert--error">The API is not reachable. Start it with <code>docker compose up -d</code> (see README).</div>;
  }
  const { postgres, mongo } = health.data;
  return (
    <div className={`alert ${postgres && mongo ? 'alert--success' : 'alert--error'}`}>
      API is up · PostgreSQL {postgres ? 'connected' : 'unreachable'} · MongoDB {mongo ? 'connected' : 'unreachable'}
    </div>
  );
}
