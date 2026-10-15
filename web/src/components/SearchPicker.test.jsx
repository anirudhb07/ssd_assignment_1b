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
