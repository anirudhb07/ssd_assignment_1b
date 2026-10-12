import { Link, useParams } from 'react-router';
import { PageHeader, ScreenPlaceholder } from '../components/ui/index.js';

const DETAILS = {
  restaurants: {
    title: 'Restaurant',
    owner: 'Member B',
    todo: ['Name and location.', 'Completed orders and revenue (from the materialized view).', 'Link to its menu, reviews and analytics.'],
    endpoints: ['getRestaurant', 'getMenu'],
  },
  users: {
    title: 'Customer',
    owner: 'Member B',
    todo: ['Name and wallet balance.', 'Active order with an "Advance status" button.', 'Link to their wallet history.'],
    endpoints: ['getUser', 'advanceOrder'],
  },
  orders: {
    title: 'Order',
    owner: 'Member A',
    todo: ['Customer, restaurant, amount, created time, StatusBadge.', '"Advance status" button: PREPARING → DELIVERING → DELIVERED.', 'Show the friendly error if it is already delivered.'],
    endpoints: ['getOrder', 'advanceOrder'],
  },
};

// One detail page for /browse/:entity/:id. Split into separate components
// per entity when you build them (B: restaurant and user, A: order).
export function DetailPage() {
  const { entity, id } = useParams();
  const detail = DETAILS[entity];
  if (!detail) return <PageHeader title="Not found" description="That kind of record doesn’t exist." />;

  return (
    <>
      <Link to={`/browse?tab=${entity}`} className="small">← Back to {entity}</Link>
      <PageHeader title={detail.title} description={<code>{id}</code>} />
      <ScreenPlaceholder owner={detail.owner} todo={detail.todo} endpoints={detail.endpoints} />
    </>
  );
}
