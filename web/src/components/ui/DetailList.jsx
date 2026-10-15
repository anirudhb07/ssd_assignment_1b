// Label/value rows, e.g. inside a "Details" card on a detail page.
//   <DetailList items={[['Restaurant', 'Kaveri Dosa Corner'], ['Amount', '₹640']]} />
export function DetailList({ items }) {
  return (
    <dl className="details">
      {items.map(([label, value]) => (
        <div key={label} className="details__row">
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
