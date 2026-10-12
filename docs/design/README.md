# Design

Put wireframes in this folder (PNG/PDF exports from Figma, Excalidraw, or photos of hand drawings). Name them by screen, for example `checkout.png`, `map.png`, `checkout-mobile.png`. Each person draws the wireframes for the screens they build.

## Users

| User | What they want to do | Screens |
| --- | --- | --- |
| **Customer** | Find a restaurant, look at its menu, place an order, see what was charged to their wallet. | Browse, Checkout, Wallet, Reviews |
| **Restaurant manager** | See how revenue is trending, where the restaurant ranks, and what customers say. | Analytics, Reviews |
| **Dispatcher** | Find the nearest available drivers to a restaurant and move orders through Preparing → Delivering → Delivered. | Map, Browse (orders) |

The header's "Acting as" switcher stands in for login, so one person can demo all three roles.

## Screens

| Screen | Owner | Wireframe |
| --- | --- | --- |
| Checkout, order detail (Workflow 1) | Member A | `checkout.png` (to add) |
| Browse (users, restaurants, orders + detail views) | Member B | `browse.png` (to add) |
| Wallet | Member B | `wallet.png` (to add) |
| Analytics (Workflow 2) | Member C | `analytics.png` (to add) |
| Reviews + menu (Workflow 4) | Member C | `reviews.png` (to add) |
| Map (Workflow 3) | Member D | `map.png` (to add) |

## Visual language

All values live in `web/src/styles/tokens.css`. Use the variables, never raw colours.

- **Primary** `#1f6f5c` (deep green): buttons, links, the active nav item.
- **Accent** `#d98a1c` (turmeric): the second chart series and highlights.
- **Status colours:** green for Delivered and Credit, amber for Preparing, blue for Delivering, red for Debit and errors.
- **Type:** the system UI font. Sizes `--text-xs` to `--text-xl`. Numbers in tables use tabular figures.
- **Spacing:** a 4/8/12/16/24/32 px scale (`--space-1` to `--space-6`).

## Shared components

From `web/src/components/ui` (import from `components/ui/index.js`):

| Component | Use it for |
| --- | --- |
| `Button` | Every button. Variants: `primary`, `secondary`, `danger`. |
| `Card`, `Stat` | Grouping content; big labelled numbers (balances, totals). |
| `PageHeader` | The title at the top of every screen. |
| `TextField`, `SelectField` | Form inputs with labels. |
| `DataTable` + `Pagination` | Any list from the API. |
| `QueryState` | Loading, empty and error states, so no screen is ever blank. |
| `StatusBadge` | Order statuses and DEBIT/CREDIT. |
| `Tabs` | Switching views within a screen. |

## Rules of thumb

- Every screen handles loading, empty and error.
- Show the API's `error.message` as-is; it is already written for the user.
- Lists are paginated on the server. Never fetch a whole table.
- Check each screen at phone width (about 400 px) as well as laptop width.
