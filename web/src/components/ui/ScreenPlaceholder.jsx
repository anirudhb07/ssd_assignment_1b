import { Card } from './Card.jsx';

// Temporary content for screens nobody has built yet. Delete it from a page
// once the real screen is in place.
export function ScreenPlaceholder({ owner, todo, endpoints }) {
  return (
    <Card title={`To build (owner: ${owner})`} className="placeholder">
      <ul>
        {todo.map((item) => <li key={item}>{item}</li>)}
      </ul>
      <p className="muted small">
        API functions to use (from <code>src/api/endpoints.js</code>): {endpoints.map((e, i) => (
          <span key={e}>{i > 0 && ', '}<code>{e}</code></span>
        ))}
      </p>
    </Card>
  );
}
