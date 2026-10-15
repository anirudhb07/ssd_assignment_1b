import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { getRestaurant } from '../api/endpoints.js';
import { LocationMap } from '../components/LocationMap.jsx';
import { Card, DetailList, PageHeader, QueryState, Stat } from '../components/ui/index.js';
import { formatMoney } from '../lib/format.js';

// /browse/restaurants/:id. Totals come from the materialized view
// restaurant_order_summary, so they are as fresh as its last refresh.
export function RestaurantDetail({ id }) {
  const query = useQuery({ queryKey: ['restaurant', id], queryFn: () => getRestaurant(id) });

  return (
    <>
      <Link to="/browse?tab=restaurants" className="small">← Back to restaurants</Link>
      <QueryState query={query} loadingLabel="Loading restaurant…">
        {(restaurant) => <Restaurant restaurant={restaurant} />}
      </QueryState>
    </>
  );
}

function Restaurant({ restaurant }) {
  const { id, name, latitude, longitude, summary } = restaurant;

  return (
    <>
      <PageHeader title={name} description={<code>{id}</code>} />
      <div className="grid-cards">
        <Card><Stat label="Completed orders" value={summary.completedOrderCount.toLocaleString('en-IN')} /></Card>
        <Card><Stat label="Completed revenue" value={formatMoney(summary.completedRevenue)} /></Card>
      </div>
      <Card title="Location">
        <LocationMap latitude={latitude} longitude={longitude} label={name} />
      </Card>
      <Card title="Details">
        <DetailList
          items={[
            ['Totals', 'Delivered orders only, as of the last summary refresh'],
            ['Updated', 'When someone presses Refresh on the Analytics screen'],
          ]}
        />
      </Card>
      {/* The Orders tab, Reviews and Analytics read restaurantId from the URL. */}
      <div className="row">
        <Link className="btn btn--primary" to={`/browse?tab=orders&restaurantId=${id}`}>View orders</Link>
        <Link className="btn btn--secondary" to={`/reviews?restaurantId=${id}`}>Menu &amp; reviews</Link>
        <Link className="btn btn--secondary" to={`/analytics?restaurantId=${id}`}>Analytics</Link>
      </div>
    </>
  );
}
