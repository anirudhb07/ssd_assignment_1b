import { Link, useParams } from 'react-router';
import { PageHeader, ScreenPlaceholder } from '../components/ui/index.js';
import { CustomerDetail } from './CustomerDetail.jsx';
import { RestaurantDetail } from './RestaurantDetail.jsx';

// /browse/:entity/:id. One component per record type. `key` resets a page's
// state (e.g. an "Advance status" message) when moving to another record.
export function DetailPage() {
  const { entity, id } = useParams();
  if (entity === 'restaurants') return <RestaurantDetail key={id} id={id} />;
  if (entity === 'users') return <CustomerDetail key={id} id={id} />;
  if (entity === 'orders') return <OrderDetail id={id} />;
  return <PageHeader title="Not found" description="That kind of record doesn’t exist." />;
}

// Owner: Member A. Replace with the real order page (wireframe: checkout.png).
function OrderDetail({ id }) {
  return (
    <>
      <Link to="/browse?tab=orders" className="small">← Back to orders</Link>
      <PageHeader title="Order" description={<code>{id}</code>} />
      <ScreenPlaceholder
        owner="Member A"
        todo={['Customer, restaurant, amount, created time, StatusBadge.', '"Advance status" button: PREPARING → DELIVERING → DELIVERED.', 'Show the friendly error if it is already delivered.']}
        endpoints={['getOrder', 'advanceOrder']}
      />
    </>
  );
}
