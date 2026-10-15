import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { advanceOrder, getOrder } from '../api/endpoints.js';
import { ApiError } from '../api/client.js';
import { formatDateTime } from '../lib/format.js';
import { DetailPage } from './DetailPage.jsx';

vi.mock('../api/endpoints.js', () => ({
  getOrder: vi.fn(), advanceOrder: vi.fn(), getRestaurant: vi.fn(), getUser: vi.fn(), listOrders: vi.fn(),
}));
const order = { id: 'o1', userId: 'u1', userName: 'Customer One', restaurantId: 'r1', restaurantName: 'Cafe One', totalAmount: 1080.5, status: 'PREPARING', createdAt: '2026-10-15T10:00:00Z' };
const delivering = { ...order, status: 'DELIVERING' };
const delivered = { ...order, status: 'DELIVERED' };
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30000 }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/browse/orders/o1']}>
    <Link to="/browse/orders/o2">Other order</Link>
    <Routes><Route path="/browse/:entity/:id" element={<DetailPage />} /></Routes>
  </MemoryRouter></QueryClientProvider>);
  return client;
}
beforeEach(() => { vi.resetAllMocks(); getOrder.mockResolvedValue(order); });

describe('Order detail', () => {
  it('loads details through the shared route and links to related records', async () => {
    setup();
    expect(await screen.findByText('Preparing')).toBeInTheDocument();
    expect(getOrder).toHaveBeenCalledWith('o1');
    expect(screen.getByRole('heading', { level: 1, name: 'Order' })).toBeInTheDocument();
    expect(screen.getByText('o1')).toBeInTheDocument();
    expect(screen.getByText('₹1,080.50')).toBeInTheDocument();
    expect(screen.getByText(formatDateTime(order.createdAt))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Customer One' })).toHaveAttribute('href', '/browse/users/u1');
    expect(screen.getByRole('link', { name: 'Cafe One' })).toHaveAttribute('href', '/browse/restaurants/r1');
    expect(screen.getByRole('link', { name: '← Back to orders' })).toHaveAttribute('href', '/browse?tab=orders');
  });

  it('shows loading and then the order', async () => {
    const pending = deferred(); getOrder.mockReturnValue(pending.promise);
    setup();
    expect(screen.getByRole('status')).toHaveTextContent('Loading order');
    expect(screen.queryByRole('button', { name: 'Advance status' })).not.toBeInTheDocument();
    await act(async () => pending.resolve(order));
    expect(await screen.findByText('Preparing')).toBeInTheDocument();
  });

  it.each([[404, 'NOT_FOUND'], [0, 'NETWORK'], [500, 'INTERNAL']])('shows a %s load error and supports retry', async (status, code) => {
    getOrder.mockRejectedValueOnce(new ApiError(status, code, 'Order could not be loaded.')).mockResolvedValue(order);
    setup();
    expect(await screen.findByRole('alert')).toHaveTextContent('Order could not be loaded.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Preparing')).toBeInTheDocument();
  });

  it('advances both steps, refreshes related caches and stops at delivery', async () => {
    getOrder.mockResolvedValueOnce(order).mockResolvedValueOnce(delivering).mockResolvedValue(delivered);
    advanceOrder.mockResolvedValueOnce(delivering).mockResolvedValueOnce(delivered);
    const client = setup();
    const keys = [['orders', { status: 'PREPARING' }], ['user', 'u1']];
    keys.forEach((key) => client.setQueryData(key, {}));
    client.setQueryData(['user', 'u2'], {});
    await userEvent.click(await screen.findByRole('button', { name: 'Advance status' }));
    expect(await screen.findByText('Delivering')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Advance status' })).toBeEnabled());
    expect(screen.getByRole('status')).toHaveTextContent('Order moved to Delivering.');
    keys.forEach((key) => expect(client.getQueryState(key).isInvalidated).toBe(true));
    expect(client.getQueryState(['user', 'u2']).isInvalidated).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Advance status' }));
    expect(await screen.findByText('Delivered')).toBeInTheDocument();
    expect(await screen.findByText('Order delivered.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Advance status' })).not.toBeInTheDocument();
    expect(advanceOrder).toHaveBeenCalledTimes(2);
    expect(advanceOrder).toHaveBeenLastCalledWith('o1', 'DELIVERING'); // the status the page showed
    expect(getOrder).toHaveBeenCalledTimes(3);
  });

  it('blocks rapid clicks during the request and the subsequent refresh', async () => {
    const mutation = deferred(); const refresh = deferred();
    advanceOrder.mockReturnValue(mutation.promise);
    getOrder.mockResolvedValueOnce(order).mockReturnValueOnce(refresh.promise);
    setup();
    const button = await screen.findByRole('button', { name: 'Advance status' });
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    await waitFor(() => expect(advanceOrder).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('button', { name: 'Advancing…' })).toBeDisabled();
    await act(async () => mutation.resolve(delivering));
    await waitFor(() => expect(getOrder).toHaveBeenCalledTimes(2));
    await userEvent.click(screen.getByRole('button', { name: 'Advancing…' }));
    expect(advanceOrder).toHaveBeenCalledTimes(1);
    await act(async () => refresh.resolve(delivering));
    expect(await screen.findByRole('button', { name: 'Advance status' })).toBeEnabled();
  });

  it('explains already delivered orders without sending another advance', async () => {
    getOrder.mockResolvedValue(delivered); setup();
    expect(await screen.findByText(/cannot be advanced further/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Advance status' })).not.toBeInTheDocument();
    expect(advanceOrder).not.toHaveBeenCalled();
  });

  it('preserves the API conflict message and refreshes a stale order', async () => {
    getOrder.mockResolvedValueOnce(order).mockResolvedValue(delivered);
    advanceOrder.mockRejectedValue(new ApiError(409, 'INVALID_TRANSITION', 'This order has already been delivered.'));
    setup(); await userEvent.click(await screen.findByRole('button', { name: 'Advance status' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This order has already been delivered.');
    expect(await screen.findByText('Delivered')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Advance status' })).not.toBeInTheDocument();
  });

  it('allows retry after a failed advance and clears the old error', async () => {
    advanceOrder.mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValue(delivering);
    setup(); await userEvent.click(await screen.findByRole('button', { name: 'Advance status' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Network unavailable');
    getOrder.mockResolvedValue(delivering);
    await userEvent.click(screen.getByRole('button', { name: 'Advance status' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Order moved to Delivering');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('handles a failed refresh without offering an unsafe next transition', async () => {
    getOrder.mockResolvedValueOnce(order).mockRejectedValueOnce(new Error('Reload failed')).mockResolvedValue(delivering);
    advanceOrder.mockResolvedValue(delivering); setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Advance status' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Reload failed');
    expect(screen.queryByRole('button', { name: 'Advance status' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Delivering')).toBeInTheDocument();
    expect(advanceOrder).toHaveBeenCalledTimes(1);
  });

  it('isolates late mutation results when navigating to another order', async () => {
    const pending = deferred(); advanceOrder.mockReturnValue(pending.promise);
    getOrder.mockImplementation((id) => Promise.resolve(id === 'o1' ? order : { ...order, id: 'o2' }));
    setup(); await userEvent.click(await screen.findByRole('button', { name: 'Advance status' }));
    await userEvent.click(screen.getByRole('link', { name: 'Other order' }));
    expect(await screen.findByText('o2')).toBeInTheDocument();
    await act(async () => pending.resolve(delivering));
    expect(await screen.findByText('Preparing')).toBeInTheDocument();
    expect(screen.queryByText('Order moved to Delivering.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Advance status' })).toBeEnabled();
  });
});
