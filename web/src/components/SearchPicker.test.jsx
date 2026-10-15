import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { SearchPicker } from './SearchPicker.jsx';

it('keeps the shared picker manual by default, including a unique Wallet search', async () => {
  const selected = { id: 'u1', name: 'Original' };
  const match = { id: 'u2', name: 'Matching customer' };
  const onSelect = vi.fn();
  const fetchList = vi.fn().mockResolvedValue({ items: [match], total: 1 });
  render(<QueryClientProvider client={new QueryClient()}><SearchPicker noun="customer" selected={selected} onSelect={onSelect} fetchList={fetchList} /></QueryClientProvider>);
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Matching' } });
  await waitFor(() => expect(fetchList).toHaveBeenCalledWith({ search: 'Matching', pageSize: 20 }));
  await waitFor(() => expect(screen.getByRole('combobox')).toBeEnabled());
  expect(onSelect).not.toHaveBeenCalled();
  expect(screen.getByRole('combobox')).toHaveValue('u1');
  await userEvent.selectOptions(screen.getByRole('combobox'), 'u2');
  expect(onSelect).toHaveBeenCalledWith(match);
});

it.each(['customer', 'restaurant'])('keeps %s feedback in the dropdown without auto-selecting by default', async (noun) => {
  let resolve;
  const pending = new Promise((done) => { resolve = done; });
  const fetchList = vi.fn().mockImplementation(({ search }) => {
    if (search === 'offline') return Promise.reject(new Error('Offline'));
    if (search === 'none') return Promise.resolve({ items: [], total: 0 });
    return pending;
  });
  const onSelect = vi.fn();
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <SearchPicker noun={noun} selected={null} onSelect={onSelect} fetchList={fetchList} />
  </QueryClientProvider>);
  expect(screen.getByRole('option', { name: 'Loading…' })).toHaveValue('');
  expect(screen.getByRole('combobox')).toBeDisabled();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  resolve({ items: [{ id: 'match', name: 'Only match' }], total: 1 });
  await screen.findByRole('option', { name: `Choose a ${noun}` });
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'none' } });
  await screen.findByRole('option', { name: 'No matches' });
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'offline' } });
  await screen.findByRole('option', { name: `Couldn't load ${noun}s` });
  expect(screen.getByRole('combobox')).toBeDisabled();
  expect(onSelect).not.toHaveBeenCalled();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
