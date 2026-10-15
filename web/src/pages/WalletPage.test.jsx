// Issue #21: the Wallet screen. The API functions are replaced with fakes, so
// these run without the databases and check whose wallet is shown, which
// filters are sent, and the empty and error states.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getUser, getUserAudit, listUsers } from '../api/endpoints.js';
import { ActorProvider } from '../context/ActorContext.jsx';
import { WalletPage } from './WalletPage.jsx';

vi.mock('../api/endpoints.js', () => ({
  getUser: vi.fn(),
  getUserAudit: vi.fn(),
  listUsers: vi.fn(),
}));

const users = {
  u1: { id: 'u1', name: 'User-356958d2', walletBalance: 33683, activeOrder: null },
  u2: { id: 'u2', name: 'User-7adb5d92', walletBalance: 24948, activeOrder: null },
};
const entries = [
  { id: 'a2', changedAt: '2026-10-12T23:37:00Z', actionType: 'DEBIT', amountChanged: 1526, balanceAfter: 33683 },
  { id: 'a1', changedAt: '2026-09-13T15:30:00Z', actionType: 'CREDIT', amountChanged: 60278, balanceAfter: 60278 },
];
const page = (items, total = items.length, p = 1) => ({ items, page: p, pageSize: 20, total });

function renderAt(url, actingAs = null) {
  localStorage.setItem('bitestream.actor', JSON.stringify({ role: 'customer', user: actingAs, restaurant: null }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <ActorProvider>
          <Routes><Route path="/wallet" element={<WalletPage />} /></Routes>
        </ActorProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const statValue = (label) =>
  screen.getAllByText(label).find((el) => el.classList.contains('stat__label')).nextElementSibling;
// The call that loaded the table (not the one-row "last change" lookup).
const lastTableCall = () => getUserAudit.mock.calls.filter(([, p]) => p.pageSize === 20).at(-1);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  getUser.mockImplementation(async (id) => {
    if (!users[id]) throw new Error('That customer was not found.');
    return users[id];
  });
  getUserAudit.mockImplementation(async (id, params) => (params.pageSize === 1 ? page(entries.slice(0, 1), 24) : page(entries, 24)));
  listUsers.mockResolvedValue(page(Object.values(users)));
});

describe('whose wallet', () => {
  it('asks for a customer when there is none in the link or in Acting as', async () => {
    renderAt('/wallet');
    expect(await screen.findByText('Choose a customer')).toBeInTheDocument();
    expect(getUserAudit).not.toHaveBeenCalled();
  });

  it('opens on the customer in the link (from "Wallet history")', async () => {
    renderAt('/wallet?userId=u1', { id: 'u2', name: 'User-7adb5d92' });
    expect(await screen.findByText('₹33,683', { selector: '.stat__value' })).toBeInTheDocument();
    expect(getUser).toHaveBeenCalledWith('u1');
    expect(lastTableCall()).toEqual(['u1', { from: '', to: '', page: 1, pageSize: 20 }]);
  });

  it('otherwise uses the customer you are acting as', async () => {
    renderAt('/wallet', { id: 'u2', name: 'User-7adb5d92' });
    expect(await screen.findByText('₹24,948', { selector: '.stat__value' })).toBeInTheDocument();
    expect(getUser).toHaveBeenCalledWith('u2');
  });

  it('switches customer with the picker', async () => {
    renderAt('/wallet?userId=u1');
    await screen.findByText('₹33,683', { selector: '.stat__value' });
    await userEvent.selectOptions(await screen.findByLabelText('Customer'), 'u2');
    expect(await screen.findByText('₹24,948', { selector: '.stat__value' })).toBeInTheDocument();
    expect(lastTableCall()[0]).toBe('u2');
  });

  it("shows the API's message for an unknown customer", async () => {
    renderAt('/wallet?userId=nope');
    expect(await screen.findByRole('alert')).toHaveTextContent('That customer was not found.');
  });
});

describe('history', () => {
  it('lists each change with its type, amount and running balance', async () => {
    renderAt('/wallet?userId=u1');
    const table = within(await screen.findByRole('table'));
    expect(table.getByText('Debit')).toBeInTheDocument();
    expect(table.getByText('Credit')).toBeInTheDocument();
    expect(table.getByText('₹1,526')).toBeInTheDocument();
    expect(table.getAllByText('₹60,278')).toHaveLength(2); // the opening credit: amount and balance after
    expect(statValue('Entries')).toHaveTextContent('24');
    expect(screen.getByRole('navigation', { name: 'Pagination' })).toHaveTextContent('1–20 of 24');
  });

  it('sends the dates and can clear them', async () => {
    renderAt('/wallet?userId=u1');
    await screen.findByRole('table');
    await userEvent.type(screen.getByLabelText('From'), '2026-10-01');
    await waitFor(() => expect(lastTableCall()[1]).toMatchObject({ from: '2026-10-01', page: 1 }));
    expect(statValue('Entries in these dates')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Clear dates' }));
    await waitFor(() => expect(lastTableCall()[1]).toMatchObject({ from: '', to: '' }));
    expect(screen.getByRole('button', { name: 'Clear dates' })).toBeDisabled();
  });

  it('goes to the next page', async () => {
    getUserAudit.mockImplementation(async (id, params) => page(entries, 30, params.page ?? 1));
    renderAt('/wallet?userId=u1');
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(lastTableCall()[1]).toMatchObject({ page: 2 }));
  });

  it('goes to the last page instead of saying "empty" when the page is past the end', async () => {
    getUserAudit.mockImplementation(async (id, params) => (params.pageSize === 1
      ? page(entries.slice(0, 1), 24)
      : page(params.page > 2 ? [] : entries, 24, params.page)));
    renderAt('/wallet?userId=u1&page=5');
    const table = await screen.findByRole('table');
    // The first table shown is already page 2: no "empty" message, no "Page 5 of 2".
    expect(screen.getByRole('navigation', { name: 'Pagination' })).toHaveTextContent('21–24 of 24');
    expect(screen.getByRole('navigation', { name: 'Pagination' })).toHaveTextContent('Page 2 of 2');
    expect(within(table).getByText('Debit')).toBeInTheDocument();
    expect(lastTableCall()[1]).toMatchObject({ page: 2 });
    expect(screen.queryByText('No wallet activity')).not.toBeInTheDocument();
  });

  it('says so when the dates have no entries', async () => {
    getUserAudit.mockImplementation(async (id, params) => (params.pageSize === 1 ? page(entries.slice(0, 1), 24) : page([])));
    renderAt('/wallet?userId=u1&from=2026-10-01&to=2026-10-05');
    expect(await screen.findByText('No wallet activity')).toBeInTheDocument();
    expect(screen.getByText('Nothing between 1 Oct and 5 Oct.')).toBeInTheDocument();
  });

  it('explains reversed dates without asking the API', async () => {
    renderAt('/wallet?userId=u1&from=2026-10-05&to=2026-10-01');
    expect(await screen.findByRole('alert')).toHaveTextContent('The start date must be on or before the end date.');
    expect(lastTableCall()).toBeUndefined();
  });

  // Regression (review on #40): a bad date in the URL used to crash the page
  // with "RangeError: Invalid time value" while building the empty message.
  it.each([
    ['from=invalid-date', 'start'],
    ['from=2026-13-45', 'start'],
    ['to=2026-02-30', 'end'],
  ])('explains a bad date in the link (%s) instead of crashing', async (query, which) => {
    renderAt(`/wallet?userId=u1&${query}`);
    expect(await screen.findByRole('alert')).toHaveTextContent(`The ${which} date in the link isn’t a real date.`);
    expect(lastTableCall()).toBeUndefined();
    expect(statValue('Current balance')).toHaveTextContent('₹33,683');

    await userEvent.click(screen.getByRole('button', { name: 'Clear dates' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(lastTableCall()[1]).toMatchObject({ from: '', to: '' });
  });

  it("shows the API's message, with a retry, when the history can't load", async () => {
    getUserAudit.mockImplementation(async (id, params) => {
      if (params.pageSize === 1) return page(entries.slice(0, 1), 24);
      throw new Error('Cannot reach the API. Check that it is running.');
    });
    renderAt('/wallet?userId=u1');
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the API.');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
