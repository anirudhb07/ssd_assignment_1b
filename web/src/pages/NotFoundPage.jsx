import { Link } from 'react-router';
import { PageHeader } from '../components/ui/index.js';

export function NotFoundPage() {
  return (
    <>
      <PageHeader title="Page not found" description="That address doesn’t match any screen." />
      <Link to="/">Go to the home page</Link>
    </>
  );
}
