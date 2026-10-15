// Issue #18: the Users and Orders tabs. The API functions are replaced with
// fakes, so these run without the databases and check what the screen does
// with the data: what it shows, which filters it sends, where rows lead.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useParams } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listOrders, listRestaurants, listUsers } from '../api/endpoints.js';
import { BrowsePage } from './BrowsePage.jsx';

vi.mock('../api/endpoints.js', () => ({
  listRestaurants: vi.fn(),
  listUsers: vi.fn(),
  listOrders: vi.fn(),
}));

const page = (items, total = items.length) => ({ items, page: 1, pageSize: 20, total });
const user = { id: 'u1', name: 'User-1a2b3c4d', walletBalance: 4250 };
const order = {
  id: 'o1', userId: 'u1', userName: 'User-1a2b3c4d', restaurantId: 'r1', restaurantName: 'Restaurant-166',
  totalAmount: 640, status: 'PREPARING', createdAt: '2026-10-12T05:12:00Z',
};

function Detail() {
  const { entity, id } = useParams();
  return <p>Detail of {entity} {id}</p>;
}

function renderAt(url) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/browse" element={<BrowsePage />} />
          <Route path="/browse/:entity/:id" element={<Detail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listUsers.mockResolvedValue(page([user], 10000));
  listOrders.mockResolvedValue(page([order], 120000));
});

describe('Restaurants tab', () => {
  it('lists restaurants with their delivered orders and revenue, and opens one', async () => {
    listRestaurants.mockResolvedValue(page([
      { id: 'r1', name: 'Restaurant-166', latitude: 12.97, longitude: 77.59, completedOrderCount: 1234, completedRevenue: 354950 },
    ], 500));
    renderAt('/browse');
    const table = within(await screen.findByRole('table'));
    expect(table.getByText('1,234')).toBeInTheDocument();
    expect(table.getByText('₹3,54,950')).toBeInTheDocument();
    expect(table.queryByText('12.9700')).not.toBeInTheDocument(); // coordinates are on the restaurant page
    expect(table.getByText('View ›')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New order' })).toHaveAttribute('href', '/checkout');
    await userEvent.click(table.getByText('Restaurant-166'));
    expect(screen.getByText('Detail of restaurants r1')).toBeInTheDocument();
  });
});

describe('a page past the end', () => {
  it('goes to the last page instead of saying nothing was found', async () => {
    listUsers.mockImplementation(async ({ page: p }) => (p > 3 ? { items: [], page: p, pageSize: 20, total: 45 } : { items: [user], page: p, pageSize: 20, total: 45 }));
    renderAt('/browse?tab=users&page=99');
    expect(await screen.findByText('User-1a2b3c4d')).toBeInTheDocument();
    expect(listUsers).toHaveBeenLastCalledWith(expect.objectContaining({ page: 3 }));
    expect(screen.queryByText('No customers found')).not.toBeInTheDocument();
  });
});

describe('Users tab', () => {
  it('lists customers with their wallet balance', async () => {
    renderAt('/browse?tab=users');
    expect(await screen.findByText('User-1a2b3c4d')).toBeInTheDocument();
    expect(screen.getByText('₹4,250')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Pagination' })).toHaveTextContent('1–20 of 10,000');
  });

  it('sends the search text to the API once typing pauses', async () => {
    renderAt('/browse?tab=users');
    await screen.findByText('User-1a2b3c4d');
    await userEvent.type(screen.getByLabelText('Search customers'), '1a2b');
    await waitFor(() => expect(listUsers).toHaveBeenLastCalledWith(expect.objectContaining({ search: '1a2b', page: 1 })));
  });

  it('opens the customer page when a row is clicked', async () => {
    renderAt('/browse?tab=users');
    await userEvent.click(await screen.findByText('User-1a2b3c4d'));
    expect(screen.getByText('Detail of users u1')).toBeInTheDocument();
  });

  it('says so when nothing matches', async () => {
    listUsers.mockResolvedValue(page([]));
    renderAt('/browse?tab=users&search=zzz');
    expect(await screen.findByText('No customers found')).toBeInTheDocument();
    expect(screen.getByText('Nothing matches “zzz”.')).toBeInTheDocument();
  });
});

describe('Orders tab', () => {
  it('shows each order with its customer, restaurant, amount and status', async () => {
    renderAt('/browse?tab=orders');
    const table = within(await screen.findByRole('table'));
    expect(table.getByText('Restaurant-166')).toBeInTheDocument();
    expect(table.getByText('₹640')).toBeInTheDocument();
    expect(table.getByText('Preparing')).toBeInTheDocument();
  });

  it('filters by status and goes back to page 1', async () => {
    renderAt('/browse?tab=orders&page=3');
    await screen.findByText('Restaurant-166');
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'DELIVERING');
    await waitFor(() => expect(listOrders).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'DELIVERING', page: 1 })));
  });

  it("names the customer when showing one customer's orders, and can show all again", async () => {
    renderAt('/browse?tab=orders&userId=u1');
    expect(await screen.findByText('Showing orders for customer User-1a2b3c4d.')).toBeInTheDocument();
    expect(listOrders).toHaveBeenLastCalledWith(expect.objectContaining({ userId: 'u1' }));

    await userEvent.click(screen.getByRole('button', { name: 'Show all orders' }));
    await waitFor(() => expect(listOrders).toHaveBeenLastCalledWith(expect.objectContaining({ userId: '' })));
    expect(screen.queryByText(/Showing orders for/)).not.toBeInTheDocument();
  });

  it('shows the API error message with a way to retry', async () => {
    listOrders.mockRejectedValue(new Error('Cannot reach the API. Check that it is running.'));
    renderAt('/browse?tab=orders');
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the API.');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
