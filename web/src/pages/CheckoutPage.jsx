import { PageHeader, ScreenPlaceholder } from '../components/ui/index.js';

// Workflow 1. Owner: Member A.
export function CheckoutPage() {
  return (
    <>
      <PageHeader title="Checkout" description="Place an order for the customer you are acting as." />
      <ScreenPlaceholder
        owner="Member A"
        todo={[
          'Pick a restaurant, then build a cart from its menu (getMenu). Total = sum of items + add-ons.',
          'Submit calls checkout({ userId, restaurantId, amount }).',
          'On success: show balance before → after (Stat) and the new wallet_audit_logs row, so it is clear the trigger fired.',
          'On 402 INSUFFICIENT_BALANCE: show error.message and a "Top up" button (topUpWallet).',
          'On 409 ACTIVE_ORDER_EXISTS: show error.message and a link to the active order.',
          'While mocked: amount > 5000 returns 402; pass { simulate: "active-order" } as params for 409.',
          'Tests: success and both failure cases (see src/components/ui/QueryState.test.jsx for the setup).',
        ]}
        endpoints={['getMenu', 'checkout', 'topUpWallet', 'getUser']}
      />
    </>
  );
}
