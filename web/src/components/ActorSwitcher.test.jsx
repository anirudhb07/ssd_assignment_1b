import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import { listRestaurants, listUsers } from '../api/endpoints.js';
import { ActorProvider } from '../context/ActorContext.jsx';
import { Layout } from './Layout.jsx';

vi.mock('../api/endpoints.js', () => ({ listUsers: vi.fn(), listRestaurants: vi.fn() }));
const alice = { id: 'u1', name: 'Alice-22' };
const bob = { id: 'u2', name: 'Bob-22' };
const restaurant = { id: 'r1', name: 'Restaurant-122' };
const page = (items, total = items.length) => ({ items, total, page: 1, pageSize: 20 });
const actor = () => JSON.parse(localStorage.getItem('bitestream.actor'));
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30000 } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/checkout']}><ActorProvider><Layout /></ActorProvider></MemoryRouter></QueryClientProvider>);
  return client;
}
const search = (value, noun = 'customer') => fireEvent.change(screen.getByRole('searchbox', { name: `Search ${noun}s` }), { target: { value } });
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.setItem('bitestream.actor', JSON.stringify({ role: 'customer', user: alice, restaurant: null }));
  listUsers.mockResolvedValue(page([alice, bob]));
  listRestaurants.mockResolvedValue(page([restaurant]));
});

it('keeps all navigation routes, active highlight, role selector and navigation working', async () => {
  setup();
  const nav = within(screen.getByRole('navigation', { name: 'Main' }));
  for (const name of ['Browse', 'Checkout', 'Wallet', 'Analytics', 'Map', 'Reviews']) {
    expect(nav.getByRole('link', { name })).toHaveAttribute('href', `/${name.toLowerCase()}`);
  }
  expect(nav.getAllByRole('link')).toHaveLength(6);
  expect(nav.getByRole('link', { name: 'Checkout' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByLabelText('Acting as')).toHaveValue('customer');
  await userEvent.click(nav.getByRole('link', { name: 'Reviews' }));
  expect(nav.getByRole('link', { name: 'Reviews' })).toHaveClass('active');
});

it('selects a matching customer after searching', async () => {
  listUsers.mockImplementation(async ({ search }) => search ? page([bob], '1') : page([alice, bob]));
  setup();
  search('Bob');
  await waitFor(() => expect(actor().user).toEqual(bob));
  expect(listUsers).toHaveBeenLastCalledWith({ search: 'Bob', pageSize: 20 });
  expect(screen.getByLabelText('Choose a customer')).toHaveValue('u2');
});

it.each([2, 500, undefined])('selects the first match regardless of total count (%s)', async (total) => {
  listUsers.mockResolvedValue({ items: [bob], total });
  setup();
  search('22');
  await waitFor(() => expect(listUsers).toHaveBeenCalledWith({ search: '22', pageSize: 20 }));
  await waitFor(() => expect(screen.getByLabelText('Choose a customer')).toBeEnabled());
  await waitFor(() => expect(actor().user).toEqual(bob));
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
});

it('allows explicit selection among ambiguous matches and manual clearing', async () => {
  const client = setup();
  search('22');
  await waitFor(() => expect(screen.getByLabelText('Choose a customer')).toBeEnabled());
  expect(actor().user).toEqual(alice);
  await userEvent.selectOptions(screen.getByLabelText('Choose a customer'), 'u2');
  expect(actor().user).toEqual(bob);
  await userEvent.selectOptions(screen.getByLabelText('Choose a customer'), '');
  listUsers.mockResolvedValue(page([bob]));
  await act(() => client.invalidateQueries({ queryKey: ['actor-picker'] }));
  expect(actor().user).toBeNull();
});

it('preserves selection on empty searches, no matches and API errors, then recovers', async () => {
  listUsers.mockImplementation(async ({ search }) => {
    if (search === 'error') throw new Error('Search unavailable');
    return search === 'none' ? page([]) : page([bob]);
  });
  setup();
  await waitFor(() => expect(screen.getByLabelText('Choose a customer')).toBeEnabled());
  expect(actor().user).toEqual(alice);
  search('none');
  expect(await screen.findByText('No matches. Try another search.')).toBeInTheDocument();
  search('error');
  expect(await screen.findByText(/Search unavailable/)).toBeInTheDocument();
  expect(actor().user).toEqual(alice);
  search('');
  await waitFor(() => expect(screen.getByLabelText('Choose a customer')).toBeEnabled());
  expect(actor().user).toEqual(alice);
  search('Bob');
  await waitFor(() => expect(actor().user).toEqual(bob));
});

it('ignores stale responses and previous placeholder data during a newer search', async () => {
  const old = deferred(); const latest = deferred();
  listUsers.mockImplementation(({ search }) => search === 'old' ? old.promise : search === 'new' ? latest.promise : Promise.resolve(page([bob])));
  setup();
  await waitFor(() => expect(screen.getByLabelText('Choose a customer')).toBeEnabled());
  search('old');
  await waitFor(() => expect(listUsers).toHaveBeenCalledWith({ search: 'old', pageSize: 20 }));
  expect(screen.getByLabelText('Choose a customer')).toBeDisabled();
  expect(actor().user).toEqual(alice);
  search('new');
  await act(async () => old.resolve(page([bob])));
  expect(actor().user).toEqual(alice);
  await waitFor(() => expect(listUsers).toHaveBeenCalledWith({ search: 'new', pageSize: 20 }));
  await act(async () => latest.resolve(page([alice, bob])));
  await waitFor(() => expect(screen.getByLabelText('Choose a customer')).toBeEnabled());
  expect(actor().user).toEqual(alice);
});

it('clearing a pending search prevents its late response from selecting an actor', async () => {
  const pending = deferred();
  listUsers.mockImplementation(({ search }) => search ? pending.promise : Promise.resolve(page([alice, bob])));
  setup();
  search('Bob');
  await waitFor(() => expect(listUsers).toHaveBeenCalledWith({ search: 'Bob', pageSize: 20 }));
  search('');
  await act(async () => pending.resolve(page([bob])));
  await waitFor(() => expect(screen.getByLabelText('Choose a customer')).toBeEnabled());
  expect(actor().user).toEqual(alice);
});

it('resets search across roles, preserves their independent choices, and hides the picker for dispatchers', async () => {
  const pending = deferred();
  listUsers.mockImplementation(({ search }) => search ? pending.promise : Promise.resolve(page([alice, bob])));
  setup();
  search('Bob');
  await waitFor(() => expect(listUsers).toHaveBeenCalledWith({ search: 'Bob', pageSize: 20 }));
  await userEvent.selectOptions(screen.getByLabelText('Acting as'), 'manager');
  expect(screen.getByRole('searchbox')).toHaveValue('');
  await act(async () => pending.resolve(page([bob])));
  search('122', 'restaurant');
  await waitFor(() => expect(actor().restaurant).toEqual(restaurant));
  expect(listRestaurants).toHaveBeenLastCalledWith({ search: '122', pageSize: 20 });
  expect(actor().user).toEqual(alice);
  await userEvent.selectOptions(screen.getByLabelText('Acting as'), 'dispatcher');
  expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  await userEvent.selectOptions(screen.getByLabelText('Acting as'), 'customer');
  expect(screen.getByLabelText('Choose a customer')).toHaveValue('u1');
  expect(screen.getByRole('searchbox')).toHaveValue('');
  await userEvent.selectOptions(screen.getByLabelText('Acting as'), 'manager');
  expect(screen.getByLabelText('Choose a restaurant')).toHaveValue('r1');
});

it('supports ambiguous restaurant selection, loading and errors without losing the manager', async () => {
  const other = { id: 'r2', name: 'Restaurant-222' };
  const pending = deferred();
  listRestaurants.mockImplementation(({ search }) => search === 'slow' ? pending.promise
    : search === 'error' ? Promise.reject(new Error('Restaurant search unavailable'))
    : Promise.resolve(page([restaurant, other])));
  setup();
  await userEvent.selectOptions(screen.getByLabelText('Acting as'), 'manager');
  search('22', 'restaurant');
  await waitFor(() => expect(screen.getByLabelText('Choose a restaurant')).toBeEnabled());
  await waitFor(() => expect(actor().restaurant).toEqual(restaurant));
  await userEvent.selectOptions(screen.getByLabelText('Choose a restaurant'), 'r2');
  expect(actor().restaurant).toEqual(other);
  search('slow', 'restaurant');
  await waitFor(() => expect(listRestaurants).toHaveBeenCalledWith({ search: 'slow', pageSize: 20 }));
  expect(screen.getByLabelText('Choose a restaurant')).toBeDisabled();
  expect(actor().restaurant).toEqual(other);
  search('error', 'restaurant');
  await screen.findByText(/Restaurant search unavailable/);
  await act(async () => pending.resolve(page([restaurant])));
  expect(actor().restaurant).toEqual(other);
});

it('does not auto-select on a background refetch after a search error', async () => {
  const client = setup();
  listUsers.mockRejectedValue(new Error('Offline'));
  search('Bob');
  await screen.findByText(/Offline/);
  listUsers.mockResolvedValue(page([bob]));
  await act(() => client.invalidateQueries({ queryKey: ['actor-picker'] }));
  expect(actor().user).toEqual(alice);
});

it('selects the first customer match, then retains a manually chosen match like Map', async () => {
  const third = { id: 'u3', name: 'Charlie-22' };
  listUsers.mockResolvedValue(page([bob, third], 200));
  setup();
  search('22');
  await waitFor(() => expect(actor().user).toEqual(bob));
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
  await userEvent.selectOptions(screen.getByLabelText('Choose a customer'), 'u3');
  search('2');
  await waitFor(() => expect(listUsers).toHaveBeenCalledWith({ search: '2', pageSize: 20 }));
  await waitFor(() => expect(screen.getByLabelText('Choose a customer')).toBeEnabled());
  expect(actor().user).toEqual(third);
});
