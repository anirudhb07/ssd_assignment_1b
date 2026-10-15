import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as endpoints from '../api/endpoints.js';
import { formatDateTime } from '../lib/format.js';
import { AnalyticsPage } from './AnalyticsPage.jsx';

// The API is mocked, so these tests need no running backend.
vi.mock('../api/endpoints.js', () => ({
  getRevenue: vi.fn(),
  getRanking: vi.fn(),
  getSummary: vi.fn(),
  refreshSummary: vi.fn(),
  listRestaurants: vi.fn(),
}));

// jsdom has no layout, so Recharts cannot measure itself. The chart itself is
// Recharts' job; here we only check that the page asks for the right data.
vi.mock('recharts', async (importOriginal) => ({
  ...(await importOriginal()),
  ResponsiveContainer: () => <div data-testid="chart" />,
}));

// Shows the picker's current choice as text, without its own network calls.
vi.mock('../components/SearchPicker.jsx', () => ({
  SearchPicker: ({ selected }) => <div data-testid="picker">{selected?.name ?? 'Choose a restaurant'}</div>,
}));

const REFRESHED_AT = '2026-10-12T10:42:00.000Z';

const summary = (lastRefreshedAt) => ({
  lastRefreshedAt,
  totals: { restaurants: 2, completedOrders: 110965, completedRevenue: 144500000 },
  topRestaurants: [],
});

const ranking = {
  items: [
    { rank: 1, restaurantId: 'r-1', restaurantName: 'Restaurant-1', totalRevenue: 354950 },
    { rank: 2, restaurantId: 'r-2', restaurantName: 'Restaurant-2', totalRevenue: 353474 },
  ],
  page: 1,
  pageSize: 10,
  total: 2,
};

const revenue = {
  restaurantId: 'r-1',
  restaurantName: 'Restaurant-1',
  points: [{ date: '2026-10-01', dailyRevenue: 100, movingAvg7d: 100 }],
};

function renderPage(url = '/analytics') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <AnalyticsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  endpoints.getSummary.mockResolvedValue(summary(null));
  endpoints.getRanking.mockResolvedValue(ranking);
  endpoints.getRevenue.mockResolvedValue(revenue);
});

afterEach(cleanup);

describe('AnalyticsPage', () => {
  it('sends the restaurantId from the link to getRevenue', async () => {
    renderPage('/analytics?restaurantId=r-1');

    await waitFor(() => expect(endpoints.getRevenue).toHaveBeenCalledWith('r-1'));
    expect(await screen.findByText('Revenue: Restaurant-1')).toBeTruthy();
  });

  it('asks for the top-ranked restaurant when the link has no restaurantId', async () => {
    renderPage('/analytics');

    await waitFor(() => expect(endpoints.getRevenue).toHaveBeenCalledWith(undefined));
  });

  it('shows "Never" until the first refresh, then the new time, and reloads the ranking', async () => {
    endpoints.refreshSummary.mockResolvedValue(summary(REFRESHED_AT));
    renderPage();

    expect(await screen.findByText('Never')).toBeTruthy();
    const rankingCallsBefore = endpoints.getRanking.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(await screen.findByText(/Summary refreshed/)).toBeTruthy();
    expect(screen.getAllByText(formatDateTime(REFRESHED_AT), { exact: false }).length).toBeGreaterThan(0);
    expect(screen.queryByText('Never')).toBeNull();
    await waitFor(() => expect(endpoints.getRanking.mock.calls.length).toBeGreaterThan(rankingCallsBefore));
  });

  it('shows the error for a bad id and does not leave the picker on "Loading…"', async () => {
    endpoints.getRevenue.mockRejectedValue(new Error('Restaurant ID must be a valid UUID.'));
    renderPage('/analytics?restaurantId=not-an-id');

    expect(await screen.findByText('Restaurant ID must be a valid UUID.')).toBeTruthy();
    expect(screen.getByTestId('picker').textContent).toBe('Choose a restaurant');
  });
});