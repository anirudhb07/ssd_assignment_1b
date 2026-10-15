import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Outlet, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PageHeader } from './ui/index.js';
import { ErrorBoundary } from './ErrorBoundary.jsx';

function Broken() {
  throw new Error('Cannot read properties of undefined');
}

function Shell() {
  return (
    <>
      <nav><Link to="/fine">Fine page</Link></nav>
      <ErrorBoundary><Outlet /></ErrorBoundary>
    </>
  );
}

function renderAt(url) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/broken" element={<Broken />} />
          <Route path="/fine" element={<PageHeader title="Wallet" />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe('ErrorBoundary', () => {
  it('shows a message instead of a blank page when a screen crashes, and keeps the nav', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {}); // React logs the caught error
    renderAt('/broken');
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong on this screen');
    expect(screen.getByRole('alert')).toHaveTextContent('Cannot read properties of undefined');
    expect(screen.getByRole('button', { name: 'Reload the page' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('link', { name: 'Fine page' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Wallet' })).toBeInTheDocument();
  });
});

describe('page titles', () => {
  it('names the browser tab after the page', () => {
    renderAt('/fine');
    expect(document.title).toBe('Wallet · BiteStream');
  });
});
