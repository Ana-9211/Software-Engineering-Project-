// Read-only star display; the text label keeps it accessible
export default function StarRating({ value = 0, count }) {
  const full = Math.max(0, Math.min(5, Math.round(value)));
  const label = `Rated ${Number(value).toFixed(1)} out of 5${count !== undefined ? ` from ${count} reviews` : ''}`;
  return (
    <span className="stars" role="img" aria-label={label}>
      <span aria-hidden="true">
        {'★'.repeat(full)}
        {'☆'.repeat(5 - full)}
      </span>
      {count !== undefined && <small aria-hidden="true"> ({count})</small>}
    </span>
  );
}
