import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { advanceOrder, getUser, listOrders } from '../api/endpoints.js';
import { Button, Card, DataTable, DetailList, PageHeader, QueryState, Stat, StatusBadge } from '../components/ui/index.js';
import { formatDateTime, formatMoney } from '../lib/format.js';

const NEXT_STATUS = { PREPARING: 'Delivering', DELIVERING: 'Delivered' };

// /browse/users/:id. The customer, their order in progress (at most one, by
// the partial unique index) and "Advance status" for demoing that rule.
export function CustomerDetail({ id }) {
  const query = useQuery({ queryKey: ['user', id], queryFn: () => getUser(id) });

  return (
    <>
      <Link to="/browse?tab=users" className="small">← Back to users</Link>
      <QueryState query={query} loadingLabel="Loading customer…">
        {(user) => <Customer user={user} />}
      </QueryState>
    </>
  );
}

function Customer({ user }) {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState(null);
  const active = user.activeOrder;

  // GET /users/:id has no order count; a one-row page of their orders does.
  const orders = useQuery({
    queryKey: ['orders', { userId: user.id, pageSize: 5 }],
    queryFn: () => listOrders({ userId: user.id, pageSize: 5 }),
  });

  // Returning the refetch keeps the mutation pending (button disabled) until
  // the new status is on screen, so a quick second click can't skip a step.
  // On failure the page may be stale (e.g. advanced in another tab), so
  // reload it too.
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['user', user.id] }),
    queryClient.invalidateQueries({ queryKey: ['orders'] }),
  ]);
  const advance = useMutation({
    mutationFn: (orderId) => advanceOrder(orderId),
    onMutate: () => setNotice(null),
    onSuccess: (order) => {
      setNotice(order.status === 'DELIVERED'
        ? 'Order delivered. This customer can place a new order now.'
        : 'Order moved to Delivering.');
      return refresh();
    },
    onError: () => refresh(),
  });

  const orderCount = orders.isPending ? '…' : orders.isError ? '—' : orders.data.total.toLocaleString('en-IN');

  return (
    <>
      <PageHeader title={user.name} description={<code>{user.id}</code>} />
      <div className="grid-cards">
        <Card><Stat label="Wallet balance" value={formatMoney(user.walletBalance)} /></Card>
        <Card><Stat label="Orders" value={orderCount} /></Card>
        <Card><Stat label="Order in progress" value={active ? <StatusBadge status={active.status} /> : 'None'} /></Card>
      </div>

      {active && (
        <Card title="Order in progress">
          <DetailList
            items={[
              ['Restaurant', <Link to={`/browse/restaurants/${active.restaurantId}`}>{active.restaurantName}</Link>],
              ['Amount', formatMoney(active.totalAmount)],
              ['Placed', formatDateTime(active.createdAt)],
            ]}
          />
        </Card>
      )}

      {/* The newest orders; "View orders" below lists them all. */}
      <Card title="Recent orders">
        <QueryState query={orders} isEmpty={(d) => d.items.length === 0} emptyTitle="No orders yet" loadingLabel="Loading orders…">
          {(data) => (
            <DataTable
              columns={[
                { key: 'createdAt', header: 'Placed', render: (o) => formatDateTime(o.createdAt) },
                { key: 'restaurantName', header: 'Restaurant', render: (o) => <Link to={`/browse/restaurants/${o.restaurantId}`}>{o.restaurantName}</Link> },
                { key: 'totalAmount', header: 'Amount', numeric: true, render: (o) => formatMoney(o.totalAmount) },
                { key: 'status', header: 'Status', render: (o) => <Link to={`/browse/orders/${o.id}`}><StatusBadge status={o.status} /></Link> },
              ]}
              rows={data.items}
            />
          )}
        </QueryState>
      </Card>

      {/* API errors appear above the buttons, worded for the user already. */}
      {advance.isError && <div className="alert alert--error" role="alert">{advance.error.message}</div>}
      {notice && <div className="alert alert--success" role="status">{notice}</div>}

      <div className="row">
        {active && (
          <Button onClick={() => advance.mutate(active.id)} disabled={advance.isPending}>
            {advance.isPending ? 'Advancing…' : 'Advance status'}
          </Button>
        )}
        <Link className="btn btn--secondary" to={`/wallet?userId=${user.id}`}>Wallet history</Link>
        <Link className="btn btn--secondary" to={`/browse?tab=orders&userId=${user.id}`}>View orders</Link>
        {active && <span className="muted small">Advance status moves it to {NEXT_STATUS[active.status]}.</span>}
      </div>
    </>
  );
}
