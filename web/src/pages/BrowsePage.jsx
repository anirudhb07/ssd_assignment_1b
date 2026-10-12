import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { listRestaurants } from '../api/endpoints.js';
import { DataTable, PageHeader, Pagination, QueryState, ScreenPlaceholder, Tabs, TextField } from '../components/ui/index.js';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';

const TABS = [
  { value: 'restaurants', label: 'Restaurants' },
  { value: 'users', label: 'Users' },
  { value: 'orders', label: 'Orders' },
];

export function BrowsePage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'restaurants';

  return (
    <>
      <PageHeader title="Browse" description="Look up any user, restaurant or order." />
      <Tabs tabs={TABS} value={tab} onChange={(value) => setParams({ tab: value })} />
      {tab === 'restaurants' && <RestaurantsTab />}
      {tab === 'users' && (
        <ScreenPlaceholder
          owner="Member B"
          todo={[
            'Same pattern as the Restaurants tab: search by name, paginated table.',
            'Columns: name, wallet balance, active order (if any).',
            'Clicking a row opens /browse/users/:id.',
          ]}
          endpoints={['listUsers', 'getUser']}
        />
      )}
      {tab === 'orders' && (
        <ScreenPlaceholder
          owner="Member B"
          todo={[
            'Paginated table, newest first. Never load all 120k orders.',
            'Filters: status (StatusBadge), customer, restaurant.',
            'Clicking a row opens /browse/orders/:id, which has the "Advance status" button.',
          ]}
          endpoints={['listOrders', 'getOrder', 'advanceOrder']}
        />
      )}
    </>
  );
}

// REFERENCE SCREEN. Copy this pattern for other lists:
// search box (debounced) + server-side pagination + QueryState for
// loading/empty/error + DataTable. Page and search live in the URL so
// the back button and shared links work.
function RestaurantsTab() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const page = Number(params.get('page') ?? 1);
  const [search, setSearch] = useState(params.get('search') ?? '');
  const debouncedSearch = useDebouncedValue(search);
  const pageSize = 20;

  const query = useQuery({
    queryKey: ['restaurants', { page, pageSize, search: debouncedSearch }],
    queryFn: () => listRestaurants({ page, pageSize, search: debouncedSearch }),
    placeholderData: keepPreviousData, // keep the old page visible while the next one loads
  });

  const updateParams = (changes) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v === '' || v == null) next.delete(k);
      else next.set(k, v);
    }
    setParams(next);
  };

  return (
    <div className="stack">
      <TextField
        label="Search restaurants"
        placeholder="e.g. Restaurant-12"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          updateParams({ search: e.target.value, page: null });
        }}
      />
      <QueryState
        query={query}
        isEmpty={(d) => d.items.length === 0}
        emptyTitle="No restaurants found"
        emptyMessage={debouncedSearch ? `Nothing matches “${debouncedSearch}”.` : undefined}
      >
        {(data) => (
          <>
            <DataTable
              columns={[
                { key: 'name', header: 'Name' },
                { key: 'latitude', header: 'Latitude', numeric: true, render: (r) => r.latitude.toFixed(4) },
                { key: 'longitude', header: 'Longitude', numeric: true, render: (r) => r.longitude.toFixed(4) },
              ]}
              rows={data.items}
              onRowClick={(r) => navigate(`/browse/restaurants/${r.id}`)}
            />
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={(p) => updateParams({ page: p })} />
          </>
        )}
      </QueryState>
    </div>
  );
}
