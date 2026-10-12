import { Link } from 'react-router';
import { EmptyState } from '../components/ui/index.js';

export function NotFoundPage() {
  return (
    <>
      <EmptyState title="Page not found" message="That address doesn’t match any screen." />
      <Link to="/">Go to the home page</Link>
    </>
  );
}
