import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { Link } from 'react-router';
import { advanceOrder, getOrder } from '../api/endpoints.js';
import { Button, Card, DetailList, PageHeader, QueryState, StatusBadge } from '../components/ui/index.js';
import { formatDateTime, formatMoney } from '../lib/format.js';

const NEXT_STATUS = { PREPARING: 'Delivering', DELIVERING: 'Delivered' };

export function OrderDetail({ id }) {
  const client = useQueryClient();
  const submitting = useRef(false);
  const query = useQuery({ queryKey: ['order', id], queryFn: () => getOrder(id) });
  const advance = useMutation({
    mutationFn: () => advanceOrder(id, query.data?.status),
    onSuccess: (order) => client.setQueryData(['order', id], order),
    // Also refresh after errors: another screen may have advanced this order.
    // Await every refresh before enabling the next transition.
    onSettled: (order) => Promise.all([
      ['order', id], ['orders'], ['user', order?.userId ?? query.data.userId],
    ].map((queryKey) => client.invalidateQueries({ queryKey }))),
  });

  async function advanceStatus() {
    if (submitting.current || advance.isPending || !NEXT_STATUS[query.data?.status]) return;
    submitting.current = true;
    try { await advance.mutateAsync(); }
    catch { /* The API's message is rendered below. */ }
    finally { submitting.current = false; }
  }

  return <>
    <Link to="/browse?tab=orders" className="small">← Back to orders</Link>
    <PageHeader title="Order" description={<code>{id}</code>} />
    <QueryState query={query} loadingLabel="Loading order…">
      {(order) => <>
        <Card title="Details">
          <DetailList items={[
            ['Customer', <Link to={`/browse/users/${order.userId}`}>{order.userName}</Link>],
            ['Restaurant', <Link to={`/browse/restaurants/${order.restaurantId}`}>{order.restaurantName}</Link>],
            ['Amount', formatMoney(order.totalAmount)],
            ['Placed', formatDateTime(order.createdAt)],
            ['Status', <StatusBadge status={order.status} />],
          ]} />
        </Card>
        {order.status === 'DELIVERED'
          ? <p className="alert alert--info">This order has been delivered and cannot be advanced further. This customer can place a new order now.</p>
          : <div className="row">
            <Button onClick={advanceStatus} disabled={advance.isPending || query.isFetching || !NEXT_STATUS[order.status]}>
              {advance.isPending ? 'Advancing…' : 'Advance status'}
            </Button>
            <span className="muted small">Advance status moves it to {NEXT_STATUS[order.status]}.</span>
          </div>}
      </>}
    </QueryState>
    {advance.isError && <div className="alert alert--error" role="alert">{advance.error.message}</div>}
    {advance.isSuccess && <div className="alert alert--success" role="status">
      {advance.data.status === 'DELIVERED' ? 'Order delivered.' : 'Order moved to Delivering.'}
    </div>}
  </>;
}
