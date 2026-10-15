import { Component } from 'react';
import { useLocation } from 'react-router';
import { Button } from './ui/index.js';

// If a screen throws while rendering (or its code fails to download), show a
// message in place of that screen instead of a blank page. The header and nav
// stay usable, and moving to another page starts fresh.
class Boundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Screen crashed:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="state state--error" role="alert">
        <strong>Something went wrong on this screen</strong>
        <span>{this.state.error.message || 'An unexpected error happened.'}</span>
        <Button variant="secondary" onClick={() => window.location.reload()}>Reload the page</Button>
      </div>
    );
  }
}

export function ErrorBoundary({ children }) {
  const { pathname } = useLocation();
  return <Boundary key={pathname}>{children}</Boundary>;
}
