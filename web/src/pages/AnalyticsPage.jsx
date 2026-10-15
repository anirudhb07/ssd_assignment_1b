import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { getRanking, getRevenue, getSummary, listRestaurants, refreshSummary } from '../api/endpoints.js';
import { SearchPicker } from '../components/SearchPicker.jsx';
import {
  Button, Card, DataTable, ErrorState, PageHeader, Pagination, QueryState, Stat,
} from '../components/ui/index.js';
import { useListParams } from '../hooks/useListParams.js';
import { formatDateTime, formatMoney } from '../lib/format.js';

// Workflow 2 + materialized view. Owner: Member C.
//
// Data sources (see docs/api_endpoints.md):
//   getRevenue  -> live window function, one restaurant (daily revenue + 7-day average)
//   getRanking  -> DENSE_RANK over the materialized view, paginated
//   getSummary  -> totals + "last refreshed" from the refresh log
//   refreshSummary -> REFRESH MATERIALIZED VIEW, then we re-read summary and ranking

const RANKING_PAGE_SIZE = 10;

const grid = (min) => ({
  display: 'grid',
  gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}px), 1fr))`,
  gap: 'var(--space-4)',
});

// ₹14.45 Cr for big totals, so the number fits in a card.
function formatCompactMoney(value) {
  if (value == null) return '—';
  if (value >= 1e7) return `₹${(value / 1e7).toFixed(2)} Cr`;
  if (value >= 1e5) return `₹${(value / 1e5).toFixed(2)} L`;
  return formatMoney(value);
}

const axisMoney = (value) => (value >= 1000 ? `₹${Number((value / 1000).toFixed(1))}k` : `₹${value}`);

// The API sends "YYYY-MM-DD". Parse as a local date so no time zone shifts the day.
const dayFormat = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });
const formatDay = (isoDate) => dayFormat.format(new Date(`${isoDate}T00:00:00`));

// Chart ranges: the last 14 days, or everything the API returned.
const RANGES = [{ value: 14, label: 'Last 14 days' }, { value: 0, label: 'All days' }];

export function AnalyticsPage() {
  const queryClient = useQueryClient();
  const { params, page, update } = useListParams();
  const restaurantId = params.get('restaurantId') ?? '';

  const summary = useQuery({ queryKey: ['analytics', 'summary'], queryFn: getSummary });

  // Without an id the API picks the top-ranked restaurant.
  const revenue = useQuery({
    queryKey: ['analytics', 'revenue', restaurantId || 'top'],
    queryFn: () => getRevenue(restaurantId || undefined),
    placeholderData: keepPreviousData,
  });

  const ranking = useQuery({
    queryKey: ['analytics', 'ranking', { page, pageSize: RANKING_PAGE_SIZE }],
    queryFn: () => getRanking({ page, pageSize: RANKING_PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  const refresh = useMutation({
    mutationFn: refreshSummary,
    onSuccess: (data) => {
      queryClient.setQueryData(['analytics', 'summary'], data);
      // The ranking is read from the same materialized view, so it changes too.
      queryClient.invalidateQueries({ queryKey: ['analytics', 'ranking'] });
    },
  });

  // What the picker shows: the restaurant the chart is actually for. After an
  // error (for example a bad id in the link) there is nothing to show, so the
  // picker goes back to "Choose a restaurant" instead of sticking on "Loading…".
  const selected = revenue.isError ? null
    : revenue.data ? { id: revenue.data.restaurantId, name: revenue.data.restaurantName }
    : restaurantId ? { id: restaurantId, name: 'Loading…' } : null;

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Revenue trend, ranking and totals for one restaurant."
        actions={(
          <Button variant="secondary" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
            {refresh.isPending ? 'Refreshing…' : 'Refresh'}
          </Button>
        )}
      />

      <div className="stack">
        <div className="row" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <SearchPicker
            noun="restaurant"
            fetchList={listRestaurants}
            selected={selected}
            onSelect={(r) => update({ restaurantId: r?.id ?? null })}
          />
          <span className="muted small">Revenue counts delivered orders only. Refresh updates the totals and ranking.</span>
        </div>

        {refresh.isError && <ErrorState error={refresh.error} onRetry={() => refresh.mutate()} />}
        {refresh.isSuccess && (
          <div className="alert alert--info" role="status">
            Summary refreshed. Last refreshed {formatDateTime(refresh.data.lastRefreshedAt)}.
          </div>
        )}

        {/* Summary cards: from the materialized view, so only as fresh as the last refresh. */}
        <QueryState query={summary} loadingLabel="Loading totals…">
          {(data) => (
            <div style={grid(220)}>
              <Card>
                <Stat label="Completed orders (all restaurants)" value={data.totals.completedOrders.toLocaleString('en-IN')} />
              </Card>
              <Card>
                <Stat
                  label="Completed revenue (all restaurants)"
                  value={formatCompactMoney(data.totals.completedRevenue)}
                  hint={formatMoney(data.totals.completedRevenue)}
                />
              </Card>
              <Card>
                <Stat
                  label="Average order value"
                  value={data.totals.completedOrders ? formatMoney(Math.round((data.totals.completedRevenue / data.totals.completedOrders) * 100) / 100) : '—'}
                  hint="Completed revenue ÷ completed orders"
                />
              </Card>
              <Card>
                <Stat
                  label="Summary last refreshed"
                  value={data.lastRefreshedAt ? formatDateTime(data.lastRefreshedAt) : 'Never'}
                  hint={data.lastRefreshedAt ? undefined : 'Press Refresh to build the summary.'}
                />
              </Card>
            </div>
          )}
        </QueryState>

        <div style={{ ...grid(380), alignItems: 'start' }}>
          <Card title={revenue.data ? `Revenue: ${revenue.data.restaurantName}` : 'Revenue'}>
            <QueryState
              query={revenue}
              isEmpty={(d) => d.points.length === 0}
              emptyTitle="No data yet"
              emptyMessage="This restaurant has no delivered orders."
              loadingLabel="Loading revenue…"
            >
              {(data) => <RevenueChart points={data.points} />}
            </QueryState>
          </Card>

          <Card title="Ranking by revenue">
            <QueryState
              query={ranking}
              isEmpty={(d) => d.items.length === 0}
              emptyTitle="No ranking yet"
              emptyMessage="Press Refresh to build the summary."
              loadingLabel="Loading ranking…"
            >
              {(data) => (
                <>
                  <DataTable
                    columns={[
                      { key: 'rank', header: '#', numeric: true },
                      { key: 'restaurantName', header: 'Restaurant' },
                      { key: 'totalRevenue', header: 'Revenue', numeric: true, render: (r) => formatMoney(r.totalRevenue) },
                      {
                        key: 'open', header: '', numeric: true,
                        render: (r) => (r.restaurantId === revenue.data?.restaurantId
                          ? <span className="muted small">Showing</span>
                          : <span className="row-open" aria-hidden="true">View trend ›</span>),
                      },
                    ]}
                    rows={data.items}
                    rowKey="restaurantId"
                    onRowClick={(r) => update({ restaurantId: r.restaurantId })}
                  />
                  <p className="muted small">Click a restaurant to see its trend. Tied revenue shares a rank.</p>
                  <Pagination
                    page={data.page}
                    pageSize={data.pageSize}
                    total={data.total}
                    onPageChange={(p) => update({ page: p })}
                  />
                </>
              )}
            </QueryState>
          </Card>
        </div>
      </div>
    </>
  );
}

// Daily revenue and the 7-day average, with the latest day's figures above
// the chart and a choice of range.
function RevenueChart({ points }) {
  const [range, setRange] = useState(14);
  const shown = range ? points.slice(-range) : points;
  const latest = points[points.length - 1];

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div className="readout">
          <span>{formatDay(latest.date)}</span>
          <span><strong>{formatMoney(latest.dailyRevenue)}</strong> daily revenue</span>
          <span className="readout__avg"><strong>{formatMoney(latest.movingAvg7d)}</strong> 7-day average</span>
        </div>
        <div className="chips" role="group" aria-label="Chart range">
          {RANGES.map((r) => (
            <button key={r.value} type="button" aria-pressed={range === r.value} onClick={() => setRange(r.value)}>{r.label}</button>
          ))}
        </div>
      </div>
      <div style={{ width: '100%', height: 320 }}>
        <ResponsiveContainer>
          <LineChart data={shown} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
            <XAxis dataKey="date" tickFormatter={formatDay} tick={{ fontSize: 12 }} minTickGap={24} />
            <YAxis tickFormatter={axisMoney} tick={{ fontSize: 12 }} width={56} />
            <Tooltip
              labelFormatter={formatDay}
              formatter={(value) => formatMoney(Number(value))}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="dailyRevenue"
              name="Daily revenue"
              stroke="var(--color-primary)"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="movingAvg7d"
              name="7-day average"
              stroke="var(--color-accent)"
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="muted small">
        The average covers the previous 7 calendar days. Days without delivered orders are left out, not counted as ₹0.
      </p>
    </>
  );
}
