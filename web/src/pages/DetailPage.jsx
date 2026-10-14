import { useParams } from 'react-router';
import { PageHeader } from '../components/ui/index.js';
import { CustomerDetail } from './CustomerDetail.jsx';
import { OrderDetail } from './OrderDetail.jsx';
import { RestaurantDetail } from './RestaurantDetail.jsx';

// /browse/:entity/:id. One component per record type. `key` resets a page's
// state (e.g. an "Advance status" message) when moving to another record.
export function DetailPage() {
  const { entity, id } = useParams();
  if (entity === 'restaurants') return <RestaurantDetail key={id} id={id} />;
  if (entity === 'users') return <CustomerDetail key={id} id={id} />;
  if (entity === 'orders') return <OrderDetail key={id} id={id} />;
  return <PageHeader title="Not found" description="That kind of record doesn’t exist." />;
}
