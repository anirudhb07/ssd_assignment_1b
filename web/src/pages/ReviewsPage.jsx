import { PageHeader, ScreenPlaceholder } from '../components/ui/index.js';

// Workflow 4 + Menus catalog. Owner: Member C.
export function ReviewsPage() {
  return (
    <>
      <PageHeader title="Reviews" description="What customers say, and what’s on the menu." />
      <ScreenPlaceholder
        owner="Member C"
        todo={[
          'Bar chart: rating distribution (1–5 stars). getReviewStats already returns real data.',
          'Bar chart: top sentiment tags.',
          'Big number: average rating and total reviews.',
          'Filter by restaurant (all restaurants when none is chosen).',
          'Menu document shown readably: categories → items (price, available) → add-ons.',
        ]}
        endpoints={['getReviewStats', 'getMenu']}
      />
    </>
  );
}
