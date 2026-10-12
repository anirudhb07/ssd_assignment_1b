// Example component tests. Copy this setup for the checkout form tests.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Pagination } from './Pagination.jsx';
import { QueryState } from './QueryState.jsx';

const renderChild = (data) => <p>Got {data.items.length} rows</p>;

describe('QueryState', () => {
  it('shows a loading state while pending', () => {
    render(<QueryState query={{ isPending: true }}>{renderChild}</QueryState>);
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
  });

  it('shows the error message and retries on click', async () => {
    const refetch = vi.fn();
    const query = { isPending: false, isError: true, error: new Error('Cannot reach the API.'), refetch };
    render(<QueryState query={query}>{renderChild}</QueryState>);

    expect(screen.getByRole('alert')).toHaveTextContent('Cannot reach the API.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('shows the empty state when there is no data', () => {
    const query = { isPending: false, isError: false, data: { items: [] } };
    render(
      <QueryState query={query} isEmpty={(d) => d.items.length === 0} emptyTitle="No orders yet">
        {renderChild}
      </QueryState>,
    );
    expect(screen.getByText('No orders yet')).toBeInTheDocument();
  });

  it('renders the children with data', () => {
    const query = { isPending: false, isError: false, data: { items: [1, 2] } };
    render(<QueryState query={query}>{renderChild}</QueryState>);
    expect(screen.getByText('Got 2 rows')).toBeInTheDocument();
  });
});

describe('Pagination', () => {
  it('disables Previous on the first page and moves forward on Next', async () => {
    const onPageChange = vi.fn();
    render(<Pagination page={1} pageSize={20} total={120000} onPageChange={onPageChange} />);

    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});
