export function Card({ title, actions, children, className = '' }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="row" style={{ justifyContent: 'space-between' }}>
          {title && <h2 className="card__title">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

// A labelled big number, e.g. "Balance before ₹4,250".
export function Stat({ label, value, hint }) {
  return (
    <div className="stat">
      <div className="stat__label">{label}</div>
      <div className="stat__value">{value}</div>
      {hint && <div className="muted small">{hint}</div>}
    </div>
  );
}
