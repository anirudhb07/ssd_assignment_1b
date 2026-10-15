import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as endpoints from '../api/endpoints.js';
import { formatMoney } from '../lib/format.js';
import { ReviewsPage } from './ReviewsPage.jsx';

// The API is mocked, so these tests need no running backend.
vi.mock('../api/endpoints.js', () => ({
  getReviewStats: vi.fn(),
  getMenu: vi.fn(),
  listRestaurants: vi.fn(),
}));

// jsdom has no layout, so Recharts cannot measure itself. The charts are
// Recharts' job; here we only check that the page asks for and shows the right data.
vi.mock('recharts', async (importOriginal) => ({
  ...(await importOriginal()),
  ResponsiveContainer: () => <div data-testid="chart" />,
}));

// Shows the picker's current choice as text, without its own network calls.
vi.mock('../components/SearchPicker.jsx', () => ({
  SearchPicker: ({ selected }) => <div data-testid="picker">{selected?.name ?? 'Choose a restaurant'}</div>,
}));

const stats = {
  restaurantId: null,
  averageRating: 4.2,
  totalReviews: 20,
  ratingDistribution: [
    { rating: 1, count: 2 },
    { rating: 2, count: 1 },
    { rating: 3, count: 4 },
    { rating: 4, count: 9 },
    { rating: 5, count: 14 },
  ],
  topTags: [
    { tag: 'fast_delivery', count: 11 },
    { tag: 'tasty', count: 14 },
  ],
};

const menu = {
  restaurantId: 'r-1',
  restaurantName: 'Restaurant-1',
  updatedAt: '2026-10-01T00:00:00.000Z',
  categories: [
    {
      name: 'Starters',
      items: [
        { name: 'Paneer Tikka', price: 240, available: true, customizationAddOns: [{ name: 'Extra cheese', price: 30 }] },
        { name: 'Veg Spring Roll', price: 180, available: false, customizationAddOns: [] },
      ],
    },
    {
      name: 'Mains',
      items: [{ name: 'Butter Chicken', price: 420, available: true, customizationAddOns: [] }],
    },
  ],
};

function renderPage(url = '/reviews') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <ReviewsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  endpoints.getReviewStats.mockResolvedValue(stats);
  endpoints.getMenu.mockResolvedValue(menu);
});

afterEach(cleanup);

describe('ReviewsPage', () => {
  it('shows all restaurants when none is chosen, and does not ask for a menu', async () => {
    renderPage('/reviews');

    await waitFor(() => expect(endpoints.getReviewStats).toHaveBeenCalledWith(undefined));
    expect(await screen.findByText('4.2 ★')).toBeTruthy();
    expect(screen.getByText('20')).toBeTruthy();
    expect(screen.getAllByTestId('chart').length).toBe(2);

    expect(screen.getByText('Choose a restaurant', { selector: 'strong' })).toBeTruthy();
    expect(endpoints.getMenu).not.toHaveBeenCalled();
  });

  it('sends the restaurantId from the link to both the stats and the menu', async () => {
    renderPage('/reviews?restaurantId=r-1');

    await waitFor(() => expect(endpoints.getReviewStats).toHaveBeenCalledWith('r-1'));
    await waitFor(() => expect(endpoints.getMenu).toHaveBeenCalledWith('r-1'));
  });

  it('shows the menu as categories, items, prices and add-ons, and marks unavailable items', async () => {
    renderPage('/reviews?restaurantId=r-1');

    expect(await screen.findByRole('heading', { name: 'Starters' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Mains' })).toBeTruthy();
    expect(screen.getByText('Paneer Tikka')).toBeTruthy();
    expect(screen.getByText(formatMoney(240))).toBeTruthy();
    expect(screen.getByText(`Extra cheese +${formatMoney(30)}`)).toBeTruthy();
    expect(screen.getByText(/3 items in 2 categories/)).toBeTruthy();

    // Only Veg Spring Roll is unavailable.
    expect(screen.getAllByText('Unavailable').length).toBe(1);
  });

  it('filters the menu by category and availability, and links to an order', async () => {
    renderPage('/reviews?restaurantId=r-1');
    await screen.findByRole('heading', { name: 'Starters' });
    expect(screen.getByText(/Menu updated/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Place an order' }).getAttribute('href')).toBe('/checkout?restaurantId=r-1');

    await userEvent.click(screen.getByRole('button', { name: 'Mains' }));
    expect(screen.queryByRole('heading', { name: 'Starters' })).toBeNull();
    expect(screen.getByText('Butter Chicken')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'All items' }));
    await userEvent.click(screen.getByLabelText('Available only'));
    expect(screen.getByText('Paneer Tikka')).toBeTruthy();
    expect(screen.queryByText('Veg Spring Roll')).toBeNull();
  });

  it('names the most mentioned tag', async () => {
    renderPage('/reviews');
    expect(await screen.findByText('tasty')).toBeTruthy(); // 14 beats fast_delivery's 11
    expect(screen.getByText('14 reviews mention it')).toBeTruthy();
  });

  it('shows an empty state when there are no reviews', async () => {
    endpoints.getReviewStats.mockResolvedValue({ ...stats, averageRating: null, totalReviews: 0, topTags: [] });
    renderPage('/reviews?restaurantId=r-1');

    expect(await screen.findByText('No reviews yet')).toBeTruthy();
    expect(screen.queryByText('Rating distribution')).toBeNull();
  });

  it('treats a missing menu (404) as "No menu yet", not an error, and keeps the review stats', async () => {
    endpoints.getMenu.mockRejectedValue(Object.assign(new Error('The menu for that restaurant was not found.'), { status: 404 }));
    renderPage('/reviews?restaurantId=r-1');

    expect(await screen.findByText('No menu yet')).toBeTruthy();
    expect(screen.queryByText(/load this/)).toBeNull();
    expect(screen.getByText('4.2 ★')).toBeTruthy();
  });

  it('shows the error for a bad id and does not leave the picker on "Selected restaurant"', async () => {
    const message = 'Restaurant ID must be a valid UUID.';
    endpoints.getReviewStats.mockRejectedValue(new Error(message));
    endpoints.getMenu.mockRejectedValue(Object.assign(new Error(message), { status: 400 }));
    renderPage('/reviews?restaurantId=not-an-id');

    expect((await screen.findAllByText(message)).length).toBeGreaterThan(0);
    expect(screen.getByTestId('picker').textContent).toBe('Choose a restaurant');
  });

  it('shows the error message with "Try again" when the stats fail', async () => {
    endpoints.getReviewStats.mockRejectedValue(new Error('Cannot reach the API. Check that it is running.'));
    renderPage('/reviews');

    expect(await screen.findByText('Cannot reach the API. Check that it is running.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});