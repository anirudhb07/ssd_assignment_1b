import { PageHeader, ScreenPlaceholder } from '../components/ui/index.js';

// Audit trail. Owner: Member C.
export function WalletPage() {
  return (
    <>
      <PageHeader title="Wallet" description="Every change to a customer’s wallet. Read-only." />
      <ScreenPlaceholder
        owner="Member C"
        todo={[
          'Show the wallet_audit_logs rows for the customer you are acting as (or one picked here).',
          'Date filter: from / to → passed as params.',
          'Columns: time, DEBIT/CREDIT (StatusBadge), amount, running balance (balanceAfter).',
          'Paginated, newest first. Empty state when the date range has no entries.',
        ]}
        endpoints={['getUserAudit']}
      />
    </>
  );
}
