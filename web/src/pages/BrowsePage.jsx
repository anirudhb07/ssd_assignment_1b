import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { listOrders, listRestaurants, listUsers } from '../api/endpoints.js';
import {
  Button, DataTable, PageHeader, Pagination, QueryState, SelectField, StatusBadge, Tabs, TextField,
} from '../components/ui/index.js';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import { useListParams } from '../hooks/useListParams.js';
import { usePastTheEnd } from '../hooks/usePastTheEnd.js';
import { formatDateTime, formatMoney } from '../lib/format.js';

const TABS = [
  { value: 'restaurants', label: 'Restaurants' },
  { value: 'users', label: 'Users' },
  { value: 'orders', label: 'Orders' },
];
const PAGE_SIZE = 20;

// Last column of each table: rows already open on click (or Enter); this
// makes that visible.
const OPEN = { key: 'open', header: '', numeric: true, render: () => <span className="row-open" aria-hidden="true">View ›</span> };

export function BrowsePage() {
  const { params, update } = useListParams();
  const tab = params.get('tab') ?? 'restaurants';

  return (
    <>
      <PageHeader
        title="Browse"
        description="Look up any user, restaurant or order."
        actions={<Link className="btn btn--primary" to="/checkout">New order</Link>}
      />
      {/* Switching tab drops the other tab's page and filters. */}
      <Tabs tabs={TABS} value={tab} onChange={(value) => update({ tab: value, page: null, search: null, status: null, userId: null, restaurantId: null })} />
      {tab === 'restaurants' && <RestaurantsTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'orders' && <OrdersTab />}
    </>
  );
}

// A search box whose text is kept in the URL (?search=) and sent to the API
// once typing pauses. Used by the Restaurants and Users tabs.
function useSearch() {
  const { params, update } = useListParams();
  const [search, setSearch] = useState(params.get('search') ?? '');
  const debounced = useDebouncedValue(search);
  const onChange = (e) => {
    setSearch(e.target.value);
    update({ search: e.target.value, page: null }, { replace: true });
  };
  return { search, debounced, onChange };
}

// REFERENCE SCREEN. The pattern every list follows: search or filters in the
// URL + server-side pagination + QueryState for loading/empty/error + DataTable.
function RestaurantsTab() {
  const { page, update } = useListParams();
  const navigate = useNavigate();
  const { search, debounced, onChange } = useSearch();

  const query = useQuery({
    queryKey: ['restaurants', { page, pageSize: PAGE_SIZE, search: debounced }],
    queryFn: () => listRestaurants({ page, pageSize: PAGE_SIZE, search: debounced }),
    placeholderData: keepPreviousData, // keep the old page visible while the next one loads
  });
  const pastTheEnd = usePastTheEnd(query.data, page, update);

  return (
    <div className="stack">
      <TextField id="restaurants-search" label="Search restaurants" placeholder="e.g. Kaveri" value={search} onChange={onChange} />
      <QueryState
        query={query}
        isEmpty={(d) => d.items.length === 0 && !pastTheEnd}
        emptyTitle="No restaurants found"
        emptyMessage={debounced ? `Nothing matches “${debounced}”.` : undefined}
      >
        {(data) => (
          <>
            <DataTable
              columns={[
                { key: 'name', header: 'Name' },
                { key: 'completedOrderCount', header: 'Delivered orders', numeric: true, render: (r) => r.completedOrderCount.toLocaleString('en-IN') },
                { key: 'completedRevenue', header: 'Revenue', numeric: true, render: (r) => formatMoney(r.completedRevenue) },
                OPEN,
              ]}
              rows={data.items}
              onRowClick={(r) => navigate(`/browse/restaurants/${r.id}`)}
            />
            <p className="muted small">Totals count delivered orders, as of the last summary refresh (Analytics → Refresh).</p>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={(p) => update({ page: p })} />
          </>
        )}
      </QueryState>
    </div>
  );
}

function UsersTab() {
  const { page, update } = useListParams();
  const navigate = useNavigate();
  const { search, debounced, onChange } = useSearch();

  const query = useQuery({
    queryKey: ['users', { page, pageSize: PAGE_SIZE, search: debounced }],
    queryFn: () => listUsers({ page, pageSize: PAGE_SIZE, search: debounced }),
    placeholderData: keepPreviousData,
  });
  const pastTheEnd = usePastTheEnd(query.data, page, update);

  return (
    <div className="stack">
      <TextField id="users-search" label="Search customers" placeholder="e.g. User-1a2b" value={search} onChange={onChange} />
      <QueryState
        query={query}
        isEmpty={(d) => d.items.length === 0 && !pastTheEnd}
        emptyTitle="No customers found"
        emptyMessage={debounced ? `Nothing matches “${debounced}”.` : undefined}
      >
        {(data) => (
          <>
            <DataTable
              columns={[
                { key: 'name', header: 'Name' },
                { key: 'walletBalance', header: 'Wallet balance', numeric: true, render: (u) => formatMoney(u.walletBalance) },
                OPEN,
              ]}
              rows={data.items}
              onRowClick={(u) => navigate(`/browse/users/${u.id}`)}
            />
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={(p) => update({ page: p })} />
          </>
        )}
      </QueryState>
    </div>
  );
}

const STATUS_OPTIONS = [
  { value: 'PREPARING', label: 'Preparing' },
  { value: 'DELIVERING', label: 'Delivering' },
  { value: 'DELIVERED', label: 'Delivered' },
];

// Newest first. Filters: status (dropdown), and customer or restaurant when
// arriving from a detail page link such as /browse?tab=orders&userId=<id>.
function OrdersTab() {
  const { params, page, update } = useListParams();
  const navigate = useNavigate();
  const status = params.get('status') ?? '';
  const userId = params.get('userId') ?? '';
  const restaurantId = params.get('restaurantId') ?? '';
  const filters = { status, userId, restaurantId };

  const query = useQuery({
    queryKey: ['orders', { page, pageSize: PAGE_SIZE, ...filters }],
    queryFn: () => listOrders({ page, pageSize: PAGE_SIZE, ...filters }),
    placeholderData: keepPreviousData,
  });
  const pastTheEnd = usePastTheEnd(query.data, page, update);

  // Name the customer or restaurant being filtered on, from the rows themselves.
  const first = query.data?.items[0];
  const scope = [
    userId && `customer ${first?.userName ?? ''}`.trim(),
    restaurantId && `restaurant ${first?.restaurantName ?? ''}`.trim(),
  ].filter(Boolean).join(' at ');

  return (
    <div className="stack">
      <div className="row" style={{ alignItems: 'end' }}>
        <SelectField
          id="orders-status"
          label="Status"
          placeholder="All statuses"
          options={STATUS_OPTIONS}
          value={status}
          onChange={(e) => update({ status: e.target.value, page: null })}
        />
      </div>
      {scope && (
        <div className="alert alert--info row" style={{ justifyContent: 'space-between' }}>
          <span>Showing orders for {scope}.</span>
          <Button variant="secondary" onClick={() => update({ userId: null, restaurantId: null, page: null })}>
            Show all orders
          </Button>
        </div>
      )}
      <QueryState
        query={query}
        isEmpty={(d) => d.items.length === 0 && !pastTheEnd}
        emptyTitle="No orders found"
        emptyMessage={status || scope ? 'No orders match these filters.' : undefined}
      >
        {(data) => (
          <>
            <DataTable
              columns={[
                { key: 'createdAt', header: 'Placed', render: (o) => formatDateTime(o.createdAt) },
                { key: 'userName', header: 'Customer' },
                { key: 'restaurantName', header: 'Restaurant' },
                { key: 'totalAmount', header: 'Amount', numeric: true, render: (o) => formatMoney(o.totalAmount) },
                { key: 'status', header: 'Status', render: (o) => <StatusBadge status={o.status} /> },
                OPEN,
              ]}
              rows={data.items}
              onRowClick={(o) => navigate(`/browse/orders/${o.id}`)}
            />
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={(p) => update({ page: p })} />
          </>
        )}
      </QueryState>
    </div>
  );
}
