import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { checkout, getMenu, getRestaurant, getUser, listRestaurants, topUpWallet } from '../api/endpoints.js';
import { Button, Card, EmptyState, PageHeader, Pagination, QueryState, Stat, StatusBadge, TextField } from '../components/ui/index.js';
import { useActor } from '../context/ActorContext.jsx';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import { cartLines, MAX_PAISE, menuItems, topupPaise } from '../lib/checkout.js';
import { formatDateTime, formatMoney } from '../lib/format.js';
import '../styles/checkout.css';

export function CheckoutPage() {
  const { actor } = useActor();
  const customer = actor.role === 'customer' ? actor.user : null;
  // A different actor gets a new cart and mutation state. In-flight responses
  // remain associated with the customer captured by their original request.
  return <CheckoutSession key={customer?.id ?? 'no-customer'} customer={customer} />;
}

// A numbered step heading. The number is hidden from screen readers, so the
// heading's name stays "Your cart" etc.
function Step({ n, children }) {
  return <span className="step"><span className="step__n" aria-hidden="true">{n}</span>{children}</span>;
}

function CheckoutSession({ customer }) {
  // /checkout?restaurantId=… (from a restaurant page or Reviews) opens that
  // restaurant's menu straight away.
  const [params, setParams] = useSearchParams();
  const linkedId = params.get('restaurantId') ?? '';
  const [chosen, setChosen] = useState(null);
  const linked = useQuery({ queryKey: ['restaurant', linkedId], queryFn: () => getRestaurant(linkedId), enabled: Boolean(linkedId) && !chosen });
  const restaurant = chosen ?? (linkedId ? linked.data ?? null : null);
  const setRestaurant = (entry) => {
    setChosen(entry);
    if (!entry && linkedId) setParams({}, { replace: true });
  };
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebouncedValue(search);
  const restaurants = useQuery({
    queryKey: ['restaurants', { page, pageSize: 20, search: debounced }],
    queryFn: () => listRestaurants({ page, pageSize: 20, search: debounced }),
    enabled: !restaurant,
  });
  return <div className="checkout-page stack">
    <PageHeader title="Checkout" description="Choose a restaurant, build your cart and pay from your wallet." />
    {!customer && <p className="alert alert--info">Choose a customer in the Acting as switcher to place an order.</p>}
    {restaurant ? <RestaurantCheckout key={restaurant.id} restaurant={restaurant} customer={customer} onChangeRestaurant={() => setRestaurant(null)} />
      : linkedId ? <>
        <QueryState query={linked} loadingLabel="Loading restaurant…">{() => null}</QueryState>
        <Button variant="secondary" onClick={() => setRestaurant(null)}>Choose another restaurant</Button>
      </>
      : <div className="with-aside">
        <Card title={<Step n={1}>Choose a restaurant</Step>}>
          <TextField label="Search restaurants" type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
          <QueryState query={restaurants} isEmpty={(data) => !data.items.length} emptyTitle="No restaurants found">
            {(data) => <>
              <div className="choice-grid">
                {data.items.map((entry) => <div className="choice-tile" key={entry.id}>
                  <div>
                    <strong>{entry.name}</strong>
                    {entry.completedOrderCount != null && <p className="muted small">{entry.completedOrderCount.toLocaleString('en-IN')} orders delivered</p>}
                  </div>
                  <Button variant="secondary" onClick={() => setRestaurant(entry)} aria-label={`Choose ${entry.name}`}>View menu</Button>
                </div>)}
              </div>
              <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} />
            </>}
          </QueryState>
        </Card>
        <WalletPanel customer={customer} />
      </div>}
  </div>;
}

// Beside the restaurant list: what the customer has to spend.
function WalletPanel({ customer }) {
  const user = useQuery({ queryKey: ['user', customer?.id], queryFn: () => getUser(customer.id), enabled: !!customer });
  return <Card title="Your wallet">
    {!customer ? <p className="muted small">No customer chosen.</p>
      : <QueryState query={user} loadingLabel="Loading wallet…">{(data) => <>
        <Stat label="Available balance" value={formatMoney(data.walletBalance)} hint={data.name} />
        {data.activeOrder && <p className="alert alert--info">This customer already has an order in progress, so a new order will be refused until it is delivered.</p>}
        <p className="muted small">You can top up if an order needs more than this.</p>
        <Link to={`/wallet?userId=${data.id}`} className="small">Wallet history</Link>
      </>}</QueryState>}
  </Card>;
}

function RestaurantCheckout({ restaurant, customer, onChangeRestaurant }) {
  const menu = useQuery({ queryKey: ['menu', restaurant.id], queryFn: () => getMenu(restaurant.id) });
  return <>
    <header className="page-header">
      <div className="page-header__text">
        <h2>{restaurant.name}</h2>
        <p className="muted small">Add items to your cart, then place the order. It is paid from the wallet.</p>
      </div>
    </header>
    <QueryState query={menu} isEmpty={(data) => !menuItems(data).length} emptyTitle="No menu items yet" emptyMessage="There is nothing to order from this restaurant yet.">
      {(data) => <MenuAndCart menu={data} restaurant={restaurant} customer={customer} onChangeRestaurant={onChangeRestaurant} />}
    </QueryState>
    {(menu.isPending || menu.isError || (menu.data && !menuItems(menu.data).length)) && <Button variant="secondary" onClick={onChangeRestaurant}>Change restaurant</Button>}
  </>;
}

function AuditEntry({ entry }) {
  return <dl>
    <dt>Type</dt><dd><StatusBadge status={entry.actionType} /></dd>
    <dt>Amount</dt><dd>{formatMoney(entry.amountChanged)}</dd>
    <dt>Audit ID</dt><dd><code>{entry.id}</code></dd>
    <dt>Recorded</dt><dd>{formatDateTime(entry.changedAt)}</dd>
    <dt>Balance after</dt><dd>{formatMoney(entry.balanceAfter)}</dd>
  </dl>;
}

function MenuAndCart({ menu, restaurant, customer, onChangeRestaurant }) {
  const client = useQueryClient();
  const [cart, setCart] = useState({});
  const [topup, setTopup] = useState('');
  const [showTopup, setShowTopup] = useState(false);
  const submitting = useRef(false);
  // When a payment problem or the top-up form appears, bring it into view
  // (it sits under Place order, which may be near the bottom of the screen).
  const feedback = useRef(null);
  const user = useQuery({ queryKey: ['user', customer?.id], queryFn: () => getUser(customer.id), enabled: !!customer });
  const items = menuItems(menu);
  const lines = cartLines(items, cart);
  const total = lines.reduce((sum, line) => sum + line.subtotal, 0);
  const validTotal = lines.length > 0 && lines.every((line) => line.valid)
    && Number.isSafeInteger(total) && total > 0 && total <= MAX_PAISE;
  const refreshWallet = () => Promise.all([
    ['user', customer.id],
    ['audit', customer.id],
    ['users'], ['orders'], ['order'], ['wallet'], ['actor-picker'],
  ].map((queryKey) => client.invalidateQueries({ queryKey })));
  const payment = useMutation({
    mutationFn: (body) => checkout(body),
    onSuccess: () => { setCart({}); return refreshWallet(); },
    onError: (error) => { if (error.code === 'ACTIVE_ORDER_EXISTS' || error.code === 'INSUFFICIENT_BALANCE') return user.refetch(); },
  });
  const credit = useMutation({
    mutationFn: (amount) => topUpWallet(customer.id, amount),
    onSuccess: () => { payment.reset(); setTopup(''); return refreshWallet(); },
  });
  const busy = payment.isPending || credit.isPending;
  // The 409 link appears once the customer is reloaded, so scroll again then.
  useEffect(() => {
    feedback.current?.scrollIntoView?.({ block: 'nearest' });
  }, [payment.error, showTopup, credit.status, user.dataUpdatedAt]);
  const placeOrder = async () => {
    if (submitting.current || busy || !customer || !validTotal || payment.isSuccess) return;
    submitting.current = true;
    try { await payment.mutateAsync({ userId: customer.id, restaurantId: restaurant.id, amount: total / 100 }); }
    catch { /* Mutation error is rendered below. */ }
    finally { submitting.current = false; }
  };
  const addCredit = async (event) => {
    event.preventDefault();
    const amount = topupPaise(topup);
    if (submitting.current || busy || !customer || amount === null) return;
    submitting.current = true;
    try { await credit.mutateAsync(amount / 100); }
    catch { /* Mutation error is rendered below. */ }
    finally { submitting.current = false; }
  };
  function quantity(key, delta) {
    setCart((old) => {
      const next = { ...old };
      const previous = old[key] ?? { quantity: 0, addOns: [] };
      const count = previous.quantity + delta;
      if (count <= 0) delete next[key];
      else next[key] = { ...previous, quantity: Math.min(count, 99) };
      return next;
    });
  }
  function toggleAddon(key, index) {
    setCart((old) => ({ ...old, [key]: { ...old[key], addOns: old[key].addOns.includes(index)
      ? old[key].addOns.filter((value) => value !== index) : [...old[key].addOns, index] } }));
  }
  if (payment.isSuccess) {
    const result = payment.data;
    return <div className="stack">
      <div className="alert alert--success" role="status">Order confirmed. Your order has been placed successfully.</div>
      <p>Order ID: <code>{result.order.id}</code></p>
      <StatusBadge status={result.order.status} />
      <div className="checkout-stats">
        <Card><Stat label="Balance before" value={formatMoney(result.balanceBefore)} /></Card>
        <Card><Stat label="Balance after" value={formatMoney(result.balanceAfter)} /></Card>
        <Card><Stat label="Debited" value={formatMoney(result.auditEntry.amountChanged)} /></Card>
      </div>
      <Card title="Wallet activity"><AuditEntry entry={result.auditEntry} /></Card>
      <Link to={`/browse/orders/${result.order.id}`} className="btn btn--primary">View order</Link>
      <Button variant="secondary" onClick={onChangeRestaurant}>Choose another restaurant</Button>
    </div>;
  }
  return <>
    <Button variant="secondary" disabled={busy} onClick={onChangeRestaurant}>Change restaurant</Button>
    <p className="muted small">Changing restaurant clears your cart. Add-ons apply to every unit of that item.</p>
    {customer && <QueryState query={user}>{(data) => <div className="checkout-stats">
      <Card><Stat label={`Wallet balance · ${data.name}`} value={formatMoney(data.walletBalance)} /></Card>
      <Card><Stat label="Order total" value={formatMoney(total / 100)} /></Card>
      <Card><Stat label="Estimated balance after" value={formatMoney((Math.round(data.walletBalance * 100) - total) / 100)} hint="The server confirms your balance when you place the order." /></Card>
    </div>}</QueryState>}
    <div className="checkout-layout">
      <Card title={<Step n={2}>Menu</Step>}>
        <fieldset disabled={busy} className="stack">
          {(menu.categories ?? []).map((category, ci) => <section className="stack" key={ci} aria-label={category.name}>
            <h3>{category.name}</h3>
            {items.filter((item) => item.categoryIndex === ci).map((item) => <article className="checkout-line" key={item.key}>
              <div className="row"><strong>{item.name}</strong><span>{item.paise === null ? 'Price unavailable' : formatMoney(item.paise / 100)}</span></div>
              {item.description && <p className="muted small">{item.description}</p>}
              {item.available === false && <p>Unavailable</p>}
              <Button variant="secondary" aria-label={`Add ${item.name}`} disabled={item.available === false || item.paise === null || cart[item.key]?.quantity >= 99} onClick={() => quantity(item.key, 1)}>Add</Button>
            </article>)}
          </section>)}
        </fieldset>
      </Card>
      <Card title={<Step n={3}>Your cart</Step>}>
        {!lines.length && <EmptyState title="Your cart is empty" message="Add an available item from the menu." />}
        <fieldset disabled={busy}>
          {lines.map((line) => <article className="checkout-line" key={line.key} aria-label={`Cart ${line.item?.name ?? 'Unavailable item'}`}>
            <strong>{line.item?.name ?? 'Unavailable item'}</strong>
            <p>Item price: {formatMoney((line.item?.paise ?? 0) / 100)}</p>
            <div className="row">
              <Button variant="secondary" aria-label={`Decrease ${line.item?.name}`} onClick={() => quantity(line.key, -1)}>−</Button>
              <span aria-label={`Quantity of ${line.item?.name}`}>Quantity: {line.quantity}</span>
              <Button variant="secondary" aria-label={`Increase ${line.item?.name}`} disabled={line.quantity >= 99} onClick={() => quantity(line.key, 1)}>+</Button>
              <Button variant="secondary" aria-label={`Remove ${line.item?.name}`} onClick={() => setCart((old) => Object.fromEntries(Object.entries(old).filter(([key]) => key !== line.key)))}>Remove</Button>
            </div>
            {!!line.item?.addOns.length && <div className="checkout-addons">
              <span>Add-ons per item</span>
              {line.item.addOns.map((addon) => <label key={addon.index}>
                <input type="checkbox" checked={line.addOns.includes(addon.index)} disabled={!line.addOns.includes(addon.index) && (addon.available === false || addon.paise === null)} onChange={() => toggleAddon(line.key, addon.index)} />
                {addon.name} ({addon.paise === null ? 'Price unavailable' : `+${formatMoney(addon.paise / 100)}`}){addon.available === false ? ' — Unavailable' : ''}
              </label>)}
            </div>}
            {!line.valid && <p role="alert">This item or an add-on is unavailable. Remove it before ordering.</p>}
            <p>Subtotal: {formatMoney(line.subtotal / 100)}</p>
          </article>)}
        </fieldset>
        <Stat label="Total" value={formatMoney(total / 100)} />
        {!!lines.length && !validTotal && <p role="alert">Choose available items with a total between ₹0.01 and ₹9,99,99,999.99.</p>}
        <Button disabled={!customer || !validTotal || busy || !user.isSuccess} onClick={placeOrder}>{payment.isPending ? 'Placing order…' : 'Place order'}</Button>
        {/* Payment problems and their next step sit right under Place order, so
            they're seen without scrolling past the menu. */}
        {(payment.error || showTopup) && <div className="stack checkout-feedback" ref={feedback}>
          {payment.error && <>
            <p className="alert alert--error" role="alert">{payment.error.message}</p>
            {payment.error.status === 402 && payment.error.code === 'INSUFFICIENT_BALANCE' && !showTopup && <Button variant="secondary" disabled={busy} onClick={() => setShowTopup(true)}>Top up</Button>}
            {payment.error.status === 409 && payment.error.code === 'ACTIVE_ORDER_EXISTS' && <QueryState query={user}>{(data) => data.activeOrder
              ? <Link to={`/browse/orders/${data.activeOrder.id}`} className="btn btn--secondary">View active order</Link>
              : <p>No active order was found. You can try placing your order again.</p>}</QueryState>}
          </>}
          {showTopup && <section className="stack" aria-label="Top up wallet">
            <h3>Top up wallet</h3>
            <form onSubmit={addCredit} className="stack">
              <TextField label="Top-up amount (₹)" aria-label="Top-up amount (₹)" type="text" inputMode="decimal" value={topup} disabled={busy} onChange={(event) => setTopup(event.target.value)} hint="Enter a positive amount with up to two decimal places." />
              <Button type="submit" disabled={busy || topupPaise(topup) === null}>{credit.isPending ? 'Topping up…' : 'Confirm top up'}</Button>
            </form>
            {credit.error && <p role="alert" className="alert alert--error">{credit.error.message}</p>}
            {credit.isSuccess && <div className="stack"><p role="status" className="alert alert--success">Top-up successful. Wallet balance: {formatMoney(credit.data.walletBalance)}. Press Place order when you are ready to retry.</p><AuditEntry entry={credit.data.auditEntry} /></div>}
          </section>}
        </div>}
      </Card>
    </div>
  </>;
}
