import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
// Mirrors the existing mock menu contract; the web container only mounts web/.
const mockMenu = { restaurantId: 'r1', restaurantName: 'Restaurant-166', categories: [
  { name: 'Starters', items: [
    { name: 'Paneer Tikka', description: 'Char-grilled cottage cheese', price: 240, available: true, customizationAddOns: [{ name: 'Extra Cheese', price: 40 }] },
    { name: 'Veg Spring Roll', price: 180, available: false, customizationAddOns: [] },
  ] },
  { name: 'Main Course', items: [{ name: 'Butter Chicken', price: 400, available: true, customizationAddOns: [{ name: 'Extra Spicy', price: 10 }, { name: 'Extra Naan', price: 50 }] }] },
] };
import { ApiError } from '../api/client.js';
import { checkout, getMenu, getOrder, getRestaurant, getUser, listRestaurants, topUpWallet } from '../api/endpoints.js';
import { ActorProvider, useActor } from '../context/ActorContext.jsx';
import { CheckoutPage } from './CheckoutPage.jsx';
import { DetailPage } from './DetailPage.jsx';

vi.mock('../api/endpoints.js', () => ({ checkout: vi.fn(), getMenu: vi.fn(), getUser: vi.fn(), listRestaurants: vi.fn(), topUpWallet: vi.fn(), getOrder: vi.fn(), advanceOrder: vi.fn(), getRestaurant: vi.fn(), listOrders: vi.fn() }));
const restaurants = [{ id: 'r1', name: 'Cafe One', latitude: 13.048384606524099, longitude: 77.71833724119547 }, { id: 'r2', name: 'Cafe Two', latitude: 13, longitude: 78 }];
const menu = { restaurantId: 'r1', categories: [{ name: 'Snacks', items: [
  { name: 'Tea', price: 0.1, available: true, customizationAddOns: [{ name: 'Milk', price: 0.2 }] },
  { name: 'Toast', price: 0.2, available: true },
  { name: 'Soup', price: 10, available: false },
] }] };
const debit = { id: 'audit-debit', actionType: 'DEBIT', amountChanged: 0.3, balanceAfter: 99.7, changedAt: '2026-10-14T10:00:00Z' };
const success = { order: { id: 'order-real', status: 'PREPARING' }, balanceBefore: 100, balanceAfter: 99.7, auditEntry: debit };
const credit = { walletBalance: 200, auditEntry: { ...debit, id: 'audit-credit', actionType: 'CREDIT', amountChanged: 100, balanceAfter: 200 } };
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
function SwitchCustomer() {
  const { setUser } = useActor();
  return <button onClick={() => setUser({ id: 'u2', name: 'Second customer' })}>Switch customer</button>;
}
function setup(customer = true, url = '/checkout') {
  localStorage.setItem('bitestream.actor', JSON.stringify({ role: 'customer', user: customer ? { id: 'u1', name: 'Customer One' } : null }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[url]}><ActorProvider><SwitchCustomer /><Routes>
    <Route path="/checkout" element={<CheckoutPage />} />
    <Route path="/browse/:entity/:id" element={<DetailPage />} />
  </Routes></ActorProvider></MemoryRouter></QueryClientProvider>);
  return { invalidate, client };
}
async function choose() { await userEvent.click(await screen.findByRole('button', { name: 'Choose Cafe One' })); }
async function add(name = 'Tea') { await userEvent.click(await screen.findByRole('button', { name: `Add ${name}` })); }
async function submit() { await userEvent.click(screen.getByRole('button', { name: 'Place order' })); }
const cart = () => within(screen.getByRole('heading', { name: 'Your cart' }).closest('section'));
beforeEach(() => {
  vi.resetAllMocks();
  listRestaurants.mockResolvedValue({ items: restaurants, page: 1, pageSize: 20, total: 2 });
  getMenu.mockResolvedValue(menu);
  getUser.mockResolvedValue({ id: 'u1', name: 'Customer One', walletBalance: 100, activeOrder: null });
  checkout.mockResolvedValue(success);
  getOrder.mockImplementation((id) => Promise.resolve({ id, userId: 'u1', userName: 'Customer One', restaurantId: 'r1', restaurantName: 'Cafe One', totalAmount: 0.3, status: 'PREPARING', createdAt: debit.changedAt }));
  topUpWallet.mockResolvedValue(credit);
});

describe('Checkout', () => {
  it('loads real restaurant choices, search and pagination through the abstraction', async () => {
    listRestaurants.mockResolvedValue({ items: restaurants, page: 1, pageSize: 20, total: 40 });
    setup();
    expect(await screen.findByText('Cafe One')).toBeInTheDocument();
    expect(screen.queryByText(/Location:|13\.0484/)).not.toBeInTheDocument(); // no raw coordinates (#54)
    expect(await screen.findByText('₹100')).toBeInTheDocument(); // the wallet beside the list
    expect(listRestaurants).toHaveBeenCalledWith({ page: 1, pageSize: 20, search: '' });
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(listRestaurants).toHaveBeenLastCalledWith({ page: 2, pageSize: 20, search: '' }));
    await userEvent.type(screen.getByLabelText('Search restaurants'), 'Cafe');
    await waitFor(() => expect(listRestaurants).toHaveBeenLastCalledWith({ page: 1, pageSize: 20, search: 'Cafe' }));
  });

  it('opens the menu straight away from a link with a restaurant, and can go back to the list', async () => {
    getRestaurant.mockResolvedValue({ ...restaurants[1], summary: { completedOrderCount: 0, completedRevenue: 0 } });
    setup(true, '/checkout?restaurantId=r2');
    expect(await screen.findByRole('heading', { level: 2, name: 'Cafe Two' })).toBeInTheDocument();
    expect(getRestaurant).toHaveBeenCalledWith('r2');
    expect(getMenu).toHaveBeenCalledWith('r2');
    await add(); // the menu has loaded
    await userEvent.click(screen.getByRole('button', { name: 'Change restaurant' }));
    expect(await screen.findByRole('button', { name: 'Choose Cafe One' })).toBeInTheDocument();
  });

  it('loads the selected menu and supports the existing production mock shape', async () => {
    getMenu.mockResolvedValue(mockMenu);
    setup(); await choose();
    expect(await screen.findByText('Paneer Tikka')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Cafe One' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.queryByText(/Location:/)).not.toBeInTheDocument();
    expect(getMenu).toHaveBeenCalledWith('r1');
    expect(screen.getByRole('button', { name: 'Add Veg Spring Roll' })).toBeDisabled();
    await add('Paneer Tikka');
    await userEvent.click(screen.getByLabelText(/Extra Cheese/));
    expect(cart().getByText('₹280')).toBeInTheDocument();
    await submit();
    expect(checkout).toHaveBeenCalledWith({ userId: 'u1', restaurantId: 'r1', amount: 280 });
  });

  it('shows loading, then an empty menu', async () => {
    const pending = deferred(); getMenu.mockReturnValue(pending.promise);
    setup(); await choose();
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    await act(async () => pending.resolve({ categories: [] }));
    expect(await screen.findByText('No menu items yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change restaurant' })).toBeEnabled();
  });

  it('shows menu errors as-is and retries', async () => {
    getMenu.mockRejectedValueOnce(new Error('Menu unavailable')).mockResolvedValue(menu);
    setup(); await choose();
    expect(await screen.findByRole('alert')).toHaveTextContent('Menu unavailable');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Add Tea' })).toBeEnabled();
  });

  it('adds/removes items, adjusts quantities and selects/deselects add-ons', async () => {
    setup(); await choose();
    expect(await screen.findByText('Your cart is empty')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Place order' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add Soup' })).toBeDisabled();
    await add();
    await userEvent.click(screen.getByLabelText(/Milk/));
    await userEvent.click(screen.getByRole('button', { name: 'Increase Tea' }));
    expect(cart().getByText('Subtotal: ₹0.60')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/Milk/));
    expect(cart().getByText('Subtotal: ₹0.20')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Decrease Tea' }));
    expect(cart().getByText('Subtotal: ₹0.10')).toBeInTheDocument();
    await add('Toast');
    await userEvent.click(screen.getByRole('button', { name: 'Remove Toast' }));
    await userEvent.click(screen.getByRole('button', { name: 'Decrease Tea' }));
    expect(screen.getByText('Your cart is empty')).toBeInTheDocument();
  });

  it('sends 0.3 for 0.1 + 0.2 and displays only the returned order/balance/audit data', async () => {
    const { invalidate, client } = setup();
    client.setQueryData(['audit', 'u1', { page: 1 }], { items: [] });
    client.setQueryData(['audit', 'u2', { page: 1 }], { items: [] });
    await choose(); await add(); await add('Toast'); await submit();
    expect(checkout).toHaveBeenCalledWith({ userId: 'u1', restaurantId: 'r1', amount: 0.3 });
    expect(await screen.findByText(/Order confirmed/)).toBeInTheDocument();
    expect(screen.getByText('order-real')).toBeInTheDocument();
    expect(screen.getByText('audit-debit')).toBeInTheDocument();
    expect(screen.getByText('Debit')).toBeInTheDocument();
    expect(screen.getByText('Preparing')).toBeInTheDocument();
    expect(screen.getByText('₹100')).toBeInTheDocument();
    expect(screen.getAllByText('₹99.70')).toHaveLength(2);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['users'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['orders'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['user', 'u1'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['audit', 'u1'] });
    expect(client.getQueryState(['audit', 'u1', { page: 1 }]).isInvalidated).toBe(true);
    expect(client.getQueryState(['audit', 'u2', { page: 1 }]).isInvalidated).toBe(false);
    expect(screen.getByRole('link', { name: 'View order' })).toHaveAttribute('href', '/browse/orders/order-real');
    await userEvent.click(screen.getByRole('link', { name: 'View order' }));
    expect(await screen.findByRole('button', { name: 'Advance status' })).toBeEnabled();
    expect(getOrder).toHaveBeenCalledWith('order-real');
  });

  it('requires an Acting as customer', async () => {
    setup(false); await choose(); await add();
    expect(screen.getByText(/Choose a customer in the Acting as/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Place order' })).toBeDisabled();
    expect(getUser).not.toHaveBeenCalled();
  });

  it('blocks duplicate submissions and cart changes while payment is pending', async () => {
    const pending = deferred(); checkout.mockReturnValue(pending.promise);
    setup(); await choose(); await add(); await submit();
    const button = screen.getByRole('button', { name: 'Placing order…' });
    expect(button).toBeDisabled(); await userEvent.click(button);
    expect(checkout).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Change restaurant' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add Tea' })).toBeDisabled();
    await act(async () => pending.resolve(success));
    expect(await screen.findByText(/Order confirmed/)).toBeInTheDocument();
  });

  it('handles the former >5000 mock scenario with 402, top-up, and explicit retry', async () => {
    getMenu.mockResolvedValue({ categories: [{ name: 'Meals', items: [{ name: 'Meal', price: 5001, available: true }] }] });
    checkout.mockRejectedValueOnce(new ApiError(402, 'INSUFFICIENT_BALANCE', 'Not enough funds. Please top up.')).mockResolvedValue(success);
    const { invalidate, client } = setup();
    client.setQueryData(['audit', 'u1', { page: 1 }], { items: [] });
    await choose(); await add('Meal'); await submit();
    expect(checkout).toHaveBeenCalledWith({ userId: 'u1', restaurantId: 'r1', amount: 5001 });
    expect(await screen.findByRole('alert')).toHaveTextContent('Not enough funds. Please top up.');
    await userEvent.click(screen.getByRole('button', { name: 'Top up' }));
    const field = screen.getByLabelText('Top-up amount (₹)');
    await userEvent.type(field, '0.001');
    expect(screen.getByRole('button', { name: 'Confirm top up' })).toBeDisabled();
    await userEvent.clear(field); await userEvent.type(field, '100');
    const pending = deferred(); topUpWallet.mockReturnValueOnce(pending.promise);
    await userEvent.click(screen.getByRole('button', { name: 'Confirm top up' }));
    expect(screen.getByRole('button', { name: 'Topping up…' })).toBeDisabled();
    await act(async () => pending.resolve(credit));
    expect(await screen.findByText(/Top-up successful/)).toBeInTheDocument();
    expect(screen.getByText(/Top-up successful/)).toHaveTextContent('Wallet balance: ₹200');
    expect(cart().getByText('Meal')).toBeInTheDocument();
    expect(cart().getByText('Subtotal: ₹5,001')).toBeInTheDocument();
    expect(screen.queryByText('Not enough funds. Please top up.')).not.toBeInTheDocument();
    expect(screen.getByText('audit-credit')).toBeInTheDocument();
    expect(topUpWallet).toHaveBeenCalledWith('u1', 100);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['user', 'u1'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['audit', 'u1'] });
    expect(client.getQueryState(['audit', 'u1', { page: 1 }]).isInvalidated).toBe(true);
    expect(checkout).toHaveBeenCalledTimes(1);
    await submit();
    expect(await screen.findByText(/Order confirmed/)).toBeInTheDocument();
    expect(checkout).toHaveBeenCalledTimes(2);
  });

  it('handles the former active-order simulation through a mocked 409 and actual getUser order ID', async () => {
    checkout.mockRejectedValue(new ApiError(409, 'ACTIVE_ORDER_EXISTS', 'Finish your current order first.'));
    getUser.mockResolvedValue({ name: 'Customer One', walletBalance: 100, activeOrder: { id: 'active-42' } });
    setup(); await choose(); await add(); await submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Finish your current order first.');
    const link = await screen.findByRole('link', { name: 'View active order' });
    expect(link).toHaveAttribute('href', '/browse/orders/active-42');
    expect(checkout).toHaveBeenCalledWith({ userId: 'u1', restaurantId: 'r1', amount: 0.1 });
    expect(screen.queryByText(/Order confirmed/)).not.toBeInTheDocument();
    expect(screen.queryByText('audit-debit')).not.toBeInTheDocument();
    expect(screen.queryByText('Debit')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'View order' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Place order' })).toBeEnabled();
    await userEvent.click(link);
    expect(await screen.findByRole('button', { name: 'Advance status' })).toBeEnabled();
    expect(getOrder).toHaveBeenCalledWith('active-42');
  });

  it.each([[400, 'INVALID_AMOUNT'], [409, 'INVALID_TRANSITION'], [0, 'NETWORK'], [500, 'INTERNAL']])('shows %s %s without an invented active order', async (status, code) => {
    checkout.mockRejectedValue(new ApiError(status, code, 'Actual backend message'));
    setup(); await choose(); await add(); await submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Actual backend message');
    expect(screen.queryByRole('link', { name: 'View active order' })).not.toBeInTheDocument();
  });

  it('clears incompatible cart state on restaurant change', async () => {
    setup(); await choose(); await add();
    await userEvent.click(screen.getByRole('button', { name: 'Change restaurant' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Choose Cafe Two' }));
    expect(await screen.findByText('Your cart is empty')).toBeInTheDocument();
    expect(getMenu).toHaveBeenLastCalledWith('r2');
    await add(); await submit();
    expect(checkout).toHaveBeenCalledWith({ userId: 'u1', restaurantId: 'r2', amount: 0.1 });
  });

  it('does not show the previous customer’s late payment result after switching actors', async () => {
    const pending = deferred(); checkout.mockReturnValue(pending.promise);
    setup(); await choose(); await add(); await submit();
    await userEvent.click(screen.getByRole('button', { name: 'Switch customer' }));
    await act(async () => pending.resolve(success));
    expect(screen.queryByText(/Order confirmed/)).not.toBeInTheDocument();
    await choose();
    expect(await screen.findByText('Your cart is empty')).toBeInTheDocument();
  });

  it('handles top-up failure without retrying checkout', async () => {
    checkout.mockRejectedValue(new ApiError(402, 'INSUFFICIENT_BALANCE', 'Insufficient wallet'));
    topUpWallet.mockRejectedValue(new Error('Wallet service unavailable'));
    setup(); await choose(); await add(); await submit();
    await userEvent.click(await screen.findByRole('button', { name: 'Top up' }));
    await userEvent.type(screen.getByLabelText('Top-up amount (₹)'), '10');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm top up' }));
    expect(await screen.findByText('Wallet service unavailable')).toBeInTheDocument();
    expect(checkout).toHaveBeenCalledTimes(1);
  });

  it('recovers from an active-order conflict by manually retrying the preserved cart', async () => {
    checkout.mockRejectedValueOnce(new ApiError(409, 'ACTIVE_ORDER_EXISTS', 'Finish your current order first.')).mockResolvedValue(success);
    getUser.mockResolvedValue({ id: 'u1', name: 'Customer One', walletBalance: 100, activeOrder: { id: 'active-42' } });
    setup(); await choose(); await add(); await submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Finish your current order first.');
    expect(cart().getByText('Tea')).toBeInTheDocument();
    expect(checkout).toHaveBeenCalledTimes(1);
    // The order is delivered elsewhere; retry remains an explicit user action.
    getUser.mockResolvedValue({ id: 'u1', name: 'Customer One', walletBalance: 100, activeOrder: null });
    await submit();
    expect(await screen.findByText(/Order confirmed/)).toBeInTheDocument();
    expect(checkout).toHaveBeenCalledTimes(2);
    expect(checkout).toHaveBeenLastCalledWith({ userId: 'u1', restaurantId: 'r1', amount: 0.1 });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'View active order' })).not.toBeInTheDocument();
  });

  it('keeps the conflict recoverable when the refreshed customer has no active order', async () => {
    checkout.mockRejectedValue(new ApiError(409, 'ACTIVE_ORDER_EXISTS', 'Finish your current order first.'));
    setup(); await choose(); await add(); await submit();
    expect(await screen.findByText('No active order was found. You can try placing your order again.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'View active order' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Place order' })).toBeEnabled();
    expect(screen.queryByText(/Order confirmed/)).not.toBeInTheDocument();
  });

  it('shows a customer lookup error instead of inventing an active-order link', async () => {
    checkout.mockRejectedValue(new ApiError(409, 'ACTIVE_ORDER_EXISTS', 'Finish your current order first.'));
    setup(); await choose(); await add();
    getUser.mockRejectedValue(new Error('Customer lookup unavailable'));
    await submit();
    expect(await screen.findByText('Finish your current order first.')).toBeInTheDocument();
    expect(screen.getAllByText('Customer lookup unavailable').length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'View active order' })).not.toBeInTheDocument();
    expect(screen.queryByText('audit-debit')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Place order' })).toBeDisabled();
  });
  // Payment problems and their next step appear in the cart right under Place
  // order, not below the whole menu.
  it('shows payment problems and their next step right under Place order', async () => {
    const after = (a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    checkout.mockRejectedValueOnce(new ApiError(402, 'INSUFFICIENT_BALANCE', 'Not enough funds. Please top up.'));
    setup(); await choose(); await add(); await submit();
    const alert = await cart().findByRole('alert');
    expect(alert).toHaveTextContent('Not enough funds. Please top up.');
    expect(after(cart().getByRole('button', { name: 'Place order' }), alert)).toBe(true);
    await userEvent.click(cart().getByRole('button', { name: 'Top up' }));
    expect(cart().getByLabelText('Top-up amount (₹)')).toBeInTheDocument();

    checkout.mockRejectedValueOnce(new ApiError(409, 'ACTIVE_ORDER_EXISTS', 'Finish your current order first.'));
    getUser.mockResolvedValue({ id: 'u1', name: 'Customer One', walletBalance: 100, activeOrder: { id: 'active-42' } });
    await submit();
    expect(await cart().findByRole('link', { name: 'View active order' })).toHaveAttribute('href', '/browse/orders/active-42');
  });
  // A customer with an order in progress can't order again whatever their
  // balance, so don't send them to Top up first.
  it('warns about an order in progress before paying, and does not offer Top up for it', async () => {
    getUser.mockResolvedValue({ id: 'u1', name: 'Customer One', walletBalance: 0.05, activeOrder: { id: 'active-42', status: 'PREPARING' } });
    setup(); await choose(); await add();
    expect(await cart().findByText(/already has an order in progress/)).toBeInTheDocument();
    expect(cart().getByRole('link', { name: 'View active order' })).toHaveAttribute('href', '/browse/orders/active-42');
    expect(cart().getByRole('button', { name: 'Place order' })).toBeEnabled(); // the database still decides

    checkout.mockRejectedValueOnce(new ApiError(402, 'INSUFFICIENT_BALANCE', 'Not enough money in the wallet. Top up the wallet and try again.'));
    await submit();
    const alert = await cart().findByRole('alert');
    expect(alert).toHaveTextContent('Not enough money in the wallet.');
    expect(alert).not.toHaveTextContent('Top up the wallet');
    expect(cart().getByText(/Topping up won’t help yet/)).toBeInTheDocument();
    expect(cart().queryByRole('button', { name: 'Top up' })).not.toBeInTheDocument();
    expect(cart().getAllByRole('link', { name: 'View active order' })).toHaveLength(1);
  });
  it('warns before paying when the cart costs more than the wallet, with Top up right there', async () => {
    getUser.mockResolvedValue({ id: 'u1', name: 'Customer One', walletBalance: 0.15, activeOrder: null });
    setup(); await choose(); await add('Toast'); // ₹0.20 against ₹0.15
    expect(await cart().findByText(/costs ₹0.05 more than the wallet balance/)).toBeInTheDocument();
    expect(cart().getByRole('button', { name: 'Place order' })).toBeEnabled(); // the database still decides
    await userEvent.click(cart().getByRole('button', { name: 'Top up' }));
    expect(cart().getByLabelText('Top-up amount (₹)')).toBeInTheDocument();
  });

  it('says the chosen customer no longer exists instead of offering Try again', async () => {
    getUser.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'That customer was not found.'));
    setup();
    expect(await screen.findByText(/This customer no longer exists/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });
});

