# Design

Wireframes, users and the visual style for BiteStream. Each person draws the wireframes for the screens they build, starting from the shared kit so every screen looks like part of the same app. See [How to make a wireframe](#how-to-make-a-wireframe).

## Users

| User | What they want to do | Screens |
| --- | --- | --- |
| **Customer** | Find a restaurant, look at its menu, place an order, see what was charged to their wallet. | Browse, Checkout, Wallet, Reviews |
| **Restaurant manager** | See how revenue is trending, where the restaurant ranks, and what customers say. | Analytics, Reviews |
| **Dispatcher** | Find the nearest available drivers to a restaurant and move orders through Preparing → Delivering → Delivered. | Map, Browse (orders) |

The header's "Acting as" switcher stands in for login, so one person can demo all three roles.

## Screens

| Screen | Owner | Issue | Page shape | Wireframe |
| --- | --- | --- | --- | --- |
| Checkout (Workflow 1) | Member A | #2 | Dashboard (menu and cart instead of charts) | `checkout.png` (to add) |
| Order detail with "Advance status" | Member A | #2 | Detail | `checkout.png` (to add) |
| Browse: users, restaurants, orders | Member B | #1 | List | `browse.png` (to add) |
| Restaurant and customer detail | Member B | #1 | Detail | `browse.png` (to add) |
| Wallet | Member B | #1 | List | `wallet.png` (to add) |
| Analytics (Workflow 2) | Member C | #3 | Dashboard | [analytics.png](analytics.png) |
| Reviews + menu (Workflow 4) | Member C | #3 | Dashboard | [reviews.png](reviews.png) |
| Map (Workflow 3) | Member D | #4 | Dashboard (map instead of the chart) | `map.png` (to add) |

## How to make a wireframe

Everyone starts from the same kit: [`wireframe-kit.excalidraw`](wireframe-kit.excalidraw) ([preview image](wireframe-kit.png)). It has every shared piece (buttons, fields, tabs, badges, cards, table, page arrows, loading/empty/error states, banners, chart and map placeholders) and three page shapes, each at laptop and phone width:

- **List**: title, search and filters, table, page arrows.
- **Detail**: back link, title, number cards, details, buttons.
- **Dashboard**: title, number cards, chart or map areas.

The names under each piece match the React components below, so a wireframe can be built directly from what the code already has.

### Steps

1. Go to [excalidraw.com](https://excalidraw.com), open the menu (☰) → **Open**, and pick `docs/design/wireframe-kit.excalidraw`.
2. Duplicate the page shape your screen uses (see the table above), at laptop and phone width.
3. Fill it in by copying pieces from the **Pieces** frame (Ctrl+C, Ctrl+V). Don't draw your own buttons, tables or cards.
4. Need something the kit doesn't have? Ask the design reviewer to add it to the kit first, so everyone gets the same version.
5. Keep it grey. Colours are decided in `web/src/styles/tokens.css`, not in wireframes.
6. Use real sample text: Restaurant-166, User-1a2b3c4d, ₹4,250, 12 Oct, 10:42.
7. Show the loading, empty and error states where the screen has them.
8. Delete the kit parts you didn't use, then save as `docs/design/<screen>.excalidraw` (☰ → **Save to…**) and export `docs/design/<screen>.png` (☰ → **Export image**).
9. On a branch named after the issue (e.g. `des-2-checkout`), open a pull request with `Closes #2` and ask the design reviewer to look.

### Reviewer checklist

The design reviewer checks every wireframe pull request before it's merged, within a few hours so nobody is blocked. Someone else reviews the reviewer's own wireframes.

- [ ] Uses the page shape from the table above.
- [ ] Uses only pieces from the kit, at the same sizes and spacing.
- [ ] The top bar is identical to the kit.
- [ ] Wording matches the other screens: same button names ("Place order", "Advance status"), ₹ for money, dates like "12 Oct, 10:42".
- [ ] Has a phone version.
- [ ] Shows loading, empty and error states where they apply.
- [ ] Grey only.
- [ ] Both files are there: `<screen>.excalidraw` and `<screen>.png`.

Approve, or comment with what to change. If the reviewer adds a new piece to the kit, they update both `wireframe-kit.excalidraw` and `wireframe-kit.png` and tell the team.

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
