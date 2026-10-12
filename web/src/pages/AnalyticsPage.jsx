import { PageHeader, ScreenPlaceholder } from '../components/ui/index.js';

// Workflow 2 + materialized view. Owner: Member D.
export function AnalyticsPage() {
  return (
    <>
      <PageHeader title="Analytics" description="How each restaurant’s revenue is trending." />
      <ScreenPlaceholder
        owner="Member D"
        todo={[
          'Line chart (recharts): daily revenue and 7-day moving average for one restaurant.',
          'Ranked table from DENSE_RANK(): rank, restaurant, total revenue. Paginated.',
          'Summary cards from the materialized view, the "last refreshed" time, and a Refresh button.',
          'After Refresh, invalidate the summary query so the new numbers show.',
        ]}
        endpoints={['getRevenue', 'getRanking', 'getSummary', 'refreshSummary']}
      />
    </>
  );
}
