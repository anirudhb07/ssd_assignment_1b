import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { getMenu, getReviewStats, listRestaurants } from '../api/endpoints.js';
import { SearchPicker } from '../components/SearchPicker.jsx';
import { Card, EmptyState, PageHeader, QueryState, Stat } from '../components/ui/index.js';
import { useListParams } from '../hooks/useListParams.js';
import { formatMoney } from '../lib/format.js';

// Workflow 4 + Menus catalog. Owner: Member C.
//
// Data sources (see docs/api_endpoints.md):
//   getReviewStats -> MongoDB $facet: average, rating distribution, top tags
//                     (all restaurants when no restaurant is chosen)
//   getMenu        -> the restaurant's Menus document: categories -> items -> add-ons
//                     (needs a restaurant; 404 when it has no menu)

const grid = (min) => ({
  display: 'grid',
  gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}px), 1fr))`,
  gap: 'var(--space-4)',
});

const prettyTag = (tag) => String(tag).replace(/_/g, ' ');

// A missing menu is a normal state, not a failure, so don't retry it.
const retryUnlessNotFound = (count, error) => error?.status !== 404 && count < 2;

export function ReviewsPage() {
  const { params, update } = useListParams();
  const restaurantId = params.get('restaurantId') ?? '';
  const [pickedName, setPickedName] = useState('');

  const stats = useQuery({
    queryKey: ['reviews', 'stats', restaurantId || 'all'],
    queryFn: () => getReviewStats(restaurantId || undefined),
    placeholderData: keepPreviousData,
  });

  const menu = useQuery({
    queryKey: ['reviews', 'menu', restaurantId],
    queryFn: () => getMenu(restaurantId),
    enabled: Boolean(restaurantId),
    retry: retryUnlessNotFound,
  });

  // If the id was rejected (for example a bad id in the link), there is no
  // restaurant to show, so the picker goes back to "Choose a restaurant".
  // A menu 404 is not a rejection: the restaurant exists, it just has no menu.
  const idRejected = stats.isError || (menu.isError && menu.error?.status !== 404);
  const selected = restaurantId && !idRejected
    ? { id: restaurantId, name: pickedName || menu.data?.restaurantName || 'Selected restaurant' }
    : null;

  return (
    <>
      <PageHeader title="Reviews" description="What customers say, and what’s on the menu." />

      <div className="stack">
        <div className="row" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <SearchPicker
            noun="restaurant"
            fetchList={listRestaurants}
            selected={selected}
            onSelect={(r) => {
              setPickedName(r?.name ?? '');
              update({ restaurantId: r?.id ?? null });
            }}
          />
          <span className="muted small">
            {restaurantId ? 'Showing one restaurant.' : 'Showing all restaurants. Choose one to see its menu.'}
          </span>
        </div>

        <QueryState
          query={stats}
          isEmpty={(d) => d.totalReviews === 0}
          emptyTitle="No reviews yet"
          emptyMessage={restaurantId ? 'This restaurant has no reviews.' : 'There are no reviews.'}
          loadingLabel="Loading reviews…"
        >
          {(data) => <StatsSection data={data} />}
        </QueryState>

        <MenuSection restaurantId={restaurantId} menu={menu} />
      </div>
    </>
  );
}

function StatsSection({ data }) {
  const distribution = data.ratingDistribution.map((d) => ({ label: `${d.rating}★`, count: d.count }));
  const tags = data.topTags.map((t) => ({ tag: prettyTag(t.tag), count: t.count }));

  return (
    <>
      <div style={grid(220)}>
        <Card>
          <Stat
            label="Average rating"
            value={data.averageRating == null ? '—' : `${Number(data.averageRating).toFixed(1)} ★`}
            hint="Out of 5"
          />
        </Card>
        <Card>
          <Stat label="Reviews" value={data.totalReviews.toLocaleString('en-IN')} />
        </Card>
      </div>

      <div style={{ ...grid(360), alignItems: 'start' }}>
        <Card title="Rating distribution">
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={distribution} margin={{ top: 20, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={40} />
                <Tooltip formatter={(value) => [`${value} reviews`, 'Count']} cursor={{ fill: 'var(--color-primary-soft)' }} />
                <Bar dataKey="count" name="Reviews" fill="var(--color-primary)" radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="count" position="top" style={{ fontSize: 12 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Top tags">
          {tags.length === 0 ? (
            <EmptyState title="No tags yet" message="No review has a tag." />
          ) : (
            <div style={{ width: '100%', height: Math.max(180, tags.length * 40 + 24) }}>
              <ResponsiveContainer>
                <BarChart data={tags} layout="vertical" margin={{ top: 4, right: 36, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="tag" width={120} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value) => [`${value} reviews`, 'Count']} cursor={{ fill: 'var(--color-primary-soft)' }} />
                  <Bar dataKey="count" name="Reviews" fill="var(--color-accent)" radius={[0, 4, 4, 0]}>
                    <LabelList dataKey="count" position="right" style={{ fontSize: 12 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

function MenuSection({ restaurantId, menu }) {
  if (!restaurantId) {
    return (
      <Card title="Menu">
        <EmptyState title="Choose a restaurant" message="Pick a restaurant above to see its menu." />
      </Card>
    );
  }

  // A restaurant without a menu answers 404. That is an empty state, not an error.
  if (menu.isError && menu.error?.status === 404) {
    return (
      <Card title="Menu">
        <EmptyState title="No menu yet" message="This restaurant has no menu." />
      </Card>
    );
  }

  return (
    <Card title="Menu">
      <QueryState
        query={menu}
        isEmpty={(d) => !d.categories?.length}
        emptyTitle="No menu yet"
        emptyMessage="This restaurant has no menu."
        loadingLabel="Loading menu…"
      >
        {(data) => {
          const itemCount = data.categories.reduce((sum, c) => sum + c.items.length, 0);
          return (
            <div className="stack">
              <p className="muted small">
                {data.restaurantName}: {itemCount} {itemCount === 1 ? 'item' : 'items'} in {data.categories.length}{' '}
                {data.categories.length === 1 ? 'category' : 'categories'}.
              </p>
              <div style={{ ...grid(300), alignItems: 'start' }}>
                {data.categories.map((category) => (
                  <Card key={category.name} title={category.name}>
                    <div className="stack">
                      {category.items.map((item) => <MenuItem key={item.name} item={item} />)}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          );
        }}
      </QueryState>
    </Card>
  );
}

function MenuItem({ item }) {
  return (
    <div
      style={{
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-3)',
        background: 'var(--color-bg)',
        opacity: item.available ? 1 : 0.7,
      }}
    >
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <strong>{item.name}</strong>
        <span>{formatMoney(item.price)}</span>
      </div>

      {item.description && <p className="muted small">{item.description}</p>}

      {!item.available && (
        <span
          style={{
            display: 'inline-block',
            marginTop: 'var(--space-2)',
            padding: '2px var(--space-2)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-warning-soft)',
            color: 'var(--color-warning)',
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
          }}
        >
          Unavailable
        </span>
      )}

      {item.customizationAddOns?.length > 0 && (
        <div className="row" style={{ flexWrap: 'wrap', marginTop: 'var(--space-2)', gap: 'var(--space-2)' }}>
          {item.customizationAddOns.map((addOn) => (
            <span
              key={addOn.name}
              style={{
                padding: '2px var(--space-2)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--color-primary-soft)',
                fontSize: 'var(--text-sm)',
              }}
            >
              {addOn.name} +{formatMoney(addOn.price)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}