import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { getUser, getUserAudit, listUsers } from '../api/endpoints.js';
import { SearchPicker } from '../components/SearchPicker.jsx';
import {
  Button, Card, DataTable, EmptyState, Loading, PageHeader, Pagination, QueryState, Stat, StatusBadge, TextField,
} from '../components/ui/index.js';
import { useActor } from '../context/ActorContext.jsx';
import { useListParams } from '../hooks/useListParams.js';
import { formatDateTime, formatMoney } from '../lib/format.js';

const PAGE_SIZE = 20;
// Same wording as the API's 400, so both paths read the same.
const REVERSED_DATES = 'The start date must be on or before the end date.';
// "2026-10-01" -> "1 Oct". Dates are calendar days, so format them in UTC
// to avoid shifting a day in time zones behind UTC.
const dayFormat = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const day = (value) => dayFormat.format(new Date(value));

// The dates come from the URL, so they can be anything. Accept only a real
// YYYY-MM-DD day (same rule as the API): new Date() would otherwise roll
// 2026-02-30 into March, and an Invalid Date makes formatting throw.
const isCalendarDay = (value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
};
const badDateMessage = (which) => `The ${which} date in the link isn’t a real date. Choose it again, or clear the dates.`;

// Wallet audit trail (issue #21): every change to one customer's wallet,
// read-only, written by the audit trigger. Shows the customer in the link
// (/wallet?userId=…, from "Wallet history" on a customer page), otherwise
// the one you're acting as. Dates are Indian calendar days, both included.
export function WalletPage() {
  const { actor } = useActor();
  const { params, page, update } = useListParams();
  const userId = params.get('userId') || actor.user?.id || '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';

  const user = useQuery({ queryKey: ['user', userId], queryFn: () => getUser(userId), enabled: Boolean(userId) });

  return (
    <>
      <PageHeader title="Wallet" description="Every change to a customer’s wallet. Read-only." />
      <div className="row" style={{ alignItems: 'end' }}>
        <div className="field">
          <span className="field__label">Customer</span>
          <div className="row" style={{ gap: 'var(--space-2)' }}>
            <SearchPicker
              noun="customer"
              searchLabel="Find a customer"
              selectLabel="Customer"
              fetchList={listUsers}
              selected={user.data ? { id: user.data.id, name: user.data.name } : null}
              onSelect={(choice) => update({ userId: choice?.id, page: null })}
            />
          </div>
        </div>
        <TextField id="wallet-from" label="From" type="date" value={isCalendarDay(from) ? from : ''}
          max={isCalendarDay(to) ? to : undefined} onChange={(e) => update({ from: e.target.value, page: null })} />
        <TextField id="wallet-to" label="To" type="date" value={isCalendarDay(to) ? to : ''}
          min={isCalendarDay(from) ? from : undefined} onChange={(e) => update({ to: e.target.value, page: null })} />
        <Button variant="secondary" disabled={!from && !to} onClick={() => update({ from: null, to: null, page: null })}>
          Clear dates
        </Button>
      </div>

      {userId ? (
        user.isError && user.error?.status === 404 ? (
          <div className="alert alert--error" role="alert">That customer no longer exists. Choose another customer above or in Acting as.</div>
        ) : <QueryState query={user} loadingLabel="Loading customer…">
          {(customer) => <CustomerWallet customer={customer} from={from} to={to} page={page} update={update} />}
        </QueryState>
      ) : (
        <EmptyState
          title="Choose a customer"
          message="Pick one above, or choose who you’re acting as at the top of the page."
        />
      )}
    </>
  );
}

function CustomerWallet({ customer, from, to, page, update }) {
  const dateProblem = from && !isCalendarDay(from) ? badDateMessage('start')
    : to && !isCalendarDay(to) ? badDateMessage('end')
    : from && to && from > to ? REVERSED_DATES
    : null;
  const audit = useQuery({
    queryKey: ['audit', customer.id, { from, to, page }],
    queryFn: () => getUserAudit(customer.id, { from, to, page, pageSize: PAGE_SIZE }),
    enabled: !dateProblem,
    // Keep this customer's previous page visible while the next one loads
    // (only if it had rows; an empty or past-the-end page shows "Loading").
    placeholderData: (previous, previousQuery) =>
      (previousQuery?.queryKey[1] === customer.id && previous?.items.length ? previous : undefined),
  });
  // The newest entry overall, whatever the dates.
  const latest = useQuery({
    queryKey: ['audit', customer.id, 'latest'],
    queryFn: () => getUserAudit(customer.id, { pageSize: 1 }),
  });

  // A page past the end (an old link, or fewer entries after changing dates)
  // comes back empty although the customer has entries: go to the last page
  // instead of saying the wallet is empty.
  const lastPage = audit.data ? Math.max(1, Math.ceil(audit.data.total / PAGE_SIZE)) : 1;
  const pastTheEnd = Boolean(audit.data && !audit.isPlaceholderData && page > lastPage);
  useEffect(() => {
    if (pastTheEnd) update({ page: lastPage === 1 ? null : lastPage }, { replace: true });
  }, [pastTheEnd, lastPage, update]);

  const filtered = Boolean(from || to);
  const entries = dateProblem || audit.isError ? '—' : audit.data ? audit.data.total.toLocaleString('en-IN') : '…';
  const lastChange = latest.data ? formatDateTime(latest.data.items[0]?.changedAt) : latest.isError ? '—' : '…';
  // Only built once the dates are known to be valid (see dateProblem).
  const emptyMessage = dateProblem ? '' : from && to ? `Nothing between ${day(from)} and ${day(to)}.`
    : from ? `Nothing on or after ${day(from)}.`
    : to ? `Nothing on or before ${day(to)}.`
    : 'This customer’s wallet has no entries yet.';

  return (
    <>
      <div className="grid-cards">
        <Card><Stat label="Current balance" value={formatMoney(customer.walletBalance)} hint={customer.name} /></Card>
        <Card>
          <Stat label={filtered ? 'Entries in these dates' : 'Entries'} value={entries}
            hint={audit.data && !dateProblem
              ? `+${formatMoney(audit.data.totalCredits)} credited · −${formatMoney(audit.data.totalDebits)} debited`
              : filtered ? 'Across the chosen dates' : 'Since the wallet was opened'} />
        </Card>
        <Card><Stat label="Last change" value={lastChange} hint="All times are India Standard Time" /></Card>
      </div>

      {dateProblem ? (
        <div className="alert alert--error" role="alert">{dateProblem}</div>
      ) : pastTheEnd ? (
        <Loading label="Loading wallet history…" />
      ) : (
        <QueryState query={audit} loadingLabel="Loading wallet history…" isEmpty={(d) => d.total === 0}
          emptyTitle="No wallet activity" emptyMessage={emptyMessage}>
          {(data) => (
            <>
              <DataTable
                columns={[
                  { key: 'changedAt', header: 'Time', render: (a) => formatDateTime(a.changedAt) },
                  { key: 'actionType', header: 'Type', render: (a) => <StatusBadge status={a.actionType} /> },
                  { key: 'amountChanged', header: 'Amount', numeric: true, render: (a) => <SignedAmount entry={a} /> },
                  { key: 'balanceAfter', header: 'Balance after', numeric: true, render: (a) => formatMoney(a.balanceAfter) },
                ]}
                rows={data.items}
              />
              <p className="muted small">Balance after is the wallet balance straight after that change. Newest first.</p>
              <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={(p) => update({ page: p })} />
            </>
          )}
        </QueryState>
      )}
    </>
  );
}

// +₹1,000 (credit, green) or −₹743.11 (debit, red), so the direction of each
// change reads at a glance without looking at the Type column.
function SignedAmount({ entry }) {
  const credit = entry.actionType === 'CREDIT';
  return (
    <span className={credit ? 'amount--credit' : 'amount--debit'}>
      {credit ? '+' : '−'}{formatMoney(entry.amountChanged)}
    </span>
  );
}
