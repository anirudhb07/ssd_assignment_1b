// Issue #19: the restaurant and customer pages. The API functions are replaced
// with fakes, so these run without the databases and check what each page
// shows, where its links go, and what "Advance status" does.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { advanceOrder, getRestaurant, getUser, listOrders } from '../api/endpoints.js';
import { DetailPage } from './DetailPage.jsx';

vi.mock('../api/endpoints.js', () => ({
  getRestaurant: vi.fn(),
  getUser: vi.fn(),
  listOrders: vi.fn(),
  advanceOrder: vi.fn(),
}));

// jsdom can't draw a Leaflet map, so stand-ins record what the page passes in.
vi.mock('react-leaflet', () => ({
  MapContainer: ({ center, children }) => <div data-testid="map" data-center={JSON.stringify(center)}>{children}</div>,
  TileLayer: () => null,
  CircleMarker: ({ center, children }) => <div data-testid="map-marker" data-center={JSON.stringify(center)}>{children}</div>,
  Tooltip: ({ children }) => <span>{children}</span>,
}));

const restaurant = {
  id: 'r1', name: 'Restaurant-166', latitude: 12.93944, longitude: 77.69876,
  summary: { completedOrderCount: 240, completedRevenue: 354950 },
};
const order = {
  id: 'o1', userId: 'u1', userName: 'User-356958d2', restaurantId: 'r9', restaurantName: 'Restaurant-143',
  totalAmount: 1526, status: 'PREPARING', createdAt: '2026-10-12T23:37:00Z',
};
const customer = (activeOrder = order) => ({ id: 'u1', name: 'User-356958d2', walletBalance: 33683, activeOrder });

function renderAt(url) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/browse/:entity/:id" element={<DetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// The value under a Stat's label ("Order in progress" is also a card title).
const statValue = (label) =>
  screen.getAllByText(label).find((el) => el.classList.contains('stat__label')).nextElementSibling;

beforeEach(() => {
  vi.clearAllMocks();
  getRestaurant.mockResolvedValue(restaurant);
  getUser.mockResolvedValue(customer());
  listOrders.mockResolvedValue({ items: [], page: 1, pageSize: 1, total: 23 });
});

describe('Restaurant page', () => {
  it('shows the totals from the summary view', async () => {
    renderAt('/browse/restaurants/r1');
    expect(await screen.findByRole('heading', { name: 'Restaurant-166' })).toBeInTheDocument();
    expect(statValue('Completed orders')).toHaveTextContent('240');
    expect(statValue('Completed revenue')).toHaveTextContent('₹3,54,950');
    expect(getRestaurant).toHaveBeenCalledWith('r1');
  });

  // Issue #59: a small map instead of raw coordinates, which stay as a caption.
  it('shows its location on a map, with the coordinates underneath', async () => {
    renderAt('/browse/restaurants/r1');
    const card = (await screen.findByRole('heading', { name: 'Location' })).closest('.card');
    const point = JSON.stringify([12.93944, 77.69876]);
    expect(within(card).getByTestId('map')).toHaveAttribute('data-center', point);
    expect(within(card).getByTestId('map-marker')).toHaveAttribute('data-center', point);
    expect(within(card).getByTestId('map-marker')).toHaveTextContent('Restaurant-166');
    expect(within(card).getByText('12.9394, 77.6988')).toBeInTheDocument();
  });

  it('links to its orders, menu and reviews, and analytics', async () => {
    renderAt('/browse/restaurants/r1');
    await screen.findByRole('heading', { name: 'Restaurant-166' });
    expect(screen.getByRole('link', { name: 'View orders' })).toHaveAttribute('href', '/browse?tab=orders&restaurantId=r1');
    expect(screen.getByRole('link', { name: 'Menu & reviews' })).toHaveAttribute('href', '/reviews?restaurantId=r1');
    expect(screen.getByRole('link', { name: 'Analytics' })).toHaveAttribute('href', '/analytics?restaurantId=r1');
    expect(screen.getByRole('link', { name: '← Back to restaurants' })).toHaveAttribute('href', '/browse?tab=restaurants');
  });

  it("shows the API's message when the restaurant doesn't exist", async () => {
    getRestaurant.mockRejectedValue(new Error('That restaurant was not found.'));
    renderAt('/browse/restaurants/nope');
    expect(await screen.findByRole('alert')).toHaveTextContent('That restaurant was not found.');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('Customer page', () => {
  it('shows the balance, order count and the order in progress', async () => {
    renderAt('/browse/users/u1');
    expect(await screen.findByRole('heading', { name: 'User-356958d2' })).toBeInTheDocument();
    expect(statValue('Wallet balance')).toHaveTextContent('₹33,683');
    await waitFor(() => expect(statValue('Orders')).toHaveTextContent('23'));
    expect(listOrders).toHaveBeenCalledWith({ userId: 'u1', pageSize: 5 });
    expect(statValue('Order in progress')).toHaveTextContent('Preparing');
    const card = within(screen.getByRole('heading', { name: 'Order in progress' }).closest('section'));
    expect(card.getByRole('link', { name: 'Restaurant-143' })).toHaveAttribute('href', '/browse/restaurants/r9');
    expect(card.getByText('₹1,526')).toBeInTheDocument();
  });

  it('links to the wallet history and orders for this customer', async () => {
    renderAt('/browse/users/u1');
    await screen.findByRole('heading', { name: 'User-356958d2' });
    expect(screen.getByRole('link', { name: 'Wallet history' })).toHaveAttribute('href', '/wallet?userId=u1');
    expect(screen.getByRole('link', { name: 'View orders' })).toHaveAttribute('href', '/browse?tab=orders&userId=u1');
  });

  it('advances the order and shows the new status', async () => {
    advanceOrder.mockResolvedValue({ ...order, status: 'DELIVERING' });
    getUser.mockResolvedValueOnce(customer()).mockResolvedValue(customer({ ...order, status: 'DELIVERING' }));
    renderAt('/browse/users/u1');
    expect(await screen.findByText('Advance status moves it to Delivering.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Advance status' }));
    expect(advanceOrder).toHaveBeenCalledWith('o1', 'PREPARING');
    expect(await screen.findByRole('status')).toHaveTextContent('Order moved to Delivering.');
    await waitFor(() => expect(statValue('Order in progress')).toHaveTextContent('Delivering'));
    expect(screen.getByText('Advance status moves it to Delivered.')).toBeInTheDocument();
  });

  it('keeps Advance status disabled until the new status has loaded', async () => {
    let finishReload;
    advanceOrder.mockResolvedValue({ ...order, status: 'DELIVERING' });
    getUser.mockResolvedValueOnce(customer())
      .mockReturnValueOnce(new Promise((resolve) => { finishReload = () => resolve(customer({ ...order, status: 'DELIVERING' })); }));
    renderAt('/browse/users/u1');
    await userEvent.click(await screen.findByRole('button', { name: 'Advance status' }));

    // The order has moved, but the page still shows the old status: no second click yet.
    await screen.findByRole('status');
    expect(screen.getByRole('button', { name: 'Advancing…' })).toBeDisabled();
    expect(advanceOrder).toHaveBeenCalledTimes(1);

    finishReload();
    expect(await screen.findByRole('button', { name: 'Advance status' })).toBeEnabled();
    expect(statValue('Order in progress')).toHaveTextContent('Delivering');
  });

  it('says when delivery frees the customer to order again', async () => {
    advanceOrder.mockResolvedValue({ ...order, status: 'DELIVERED' });
    getUser.mockResolvedValueOnce(customer({ ...order, status: 'DELIVERING' })).mockResolvedValue(customer(null));
    renderAt('/browse/users/u1');
    await userEvent.click(await screen.findByRole('button', { name: 'Advance status' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Order delivered. This customer can place a new order now.');
    await waitFor(() => expect(statValue('Order in progress')).toHaveTextContent('None'));
    expect(screen.queryByRole('button', { name: 'Advance status' })).not.toBeInTheDocument();
  });

  it("shows the API's message above the buttons when advancing fails", async () => {
    advanceOrder.mockRejectedValue(new Error('This order has already been delivered and cannot be advanced further.'));
    renderAt('/browse/users/u1');
    await userEvent.click(await screen.findByRole('button', { name: 'Advance status' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This order has already been delivered');
    expect(screen.getByRole('button', { name: 'Advance status' })).toBeEnabled();
  });

  it('reloads the customer after a failed advance, since the page may be out of date', async () => {
    advanceOrder.mockRejectedValue(new Error('This order has already been delivered and cannot be advanced further.'));
    getUser.mockResolvedValueOnce(customer({ ...order, status: 'DELIVERING' })).mockResolvedValue(customer(null));
    renderAt('/browse/users/u1');
    await userEvent.click(await screen.findByRole('button', { name: 'Advance status' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already been delivered');
    await waitFor(() => expect(statValue('Order in progress')).toHaveTextContent('None'));
    expect(getUser).toHaveBeenCalledTimes(2);
  });

  it('hides the order card and Advance status when nothing is in progress', async () => {
    getUser.mockResolvedValue(customer(null));
    renderAt('/browse/users/u1');
    await screen.findByRole('heading', { name: 'User-356958d2' });
    expect(statValue('Order in progress')).toHaveTextContent('None');
    expect(screen.queryByRole('heading', { name: 'Order in progress' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Advance status' })).not.toBeInTheDocument();
  });

  it("shows the API's message for an unknown customer", async () => {
    getUser.mockRejectedValue(new Error('That customer was not found.'));
    renderAt('/browse/users/nope');
    expect(await screen.findByRole('alert')).toHaveTextContent('That customer was not found.');
  });
});

it('says so for an unknown kind of record', () => {
  renderAt('/browse/planets/p1');
  expect(screen.getByRole('heading', { name: 'Not found' })).toBeInTheDocument();
});
