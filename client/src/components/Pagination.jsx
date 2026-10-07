// Pagination: the server fixes the page size; the response carries page and totalPages
export default function Pagination({ page, totalPages, onChange }) {
  if (!totalPages || totalPages <= 1) return null;
  return (
    <nav className="pagination" aria-label="Pages">
      <button type="button" className="btn" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Previous
      </button>
      <span aria-current="page">
        Page {page} of {totalPages}
      </span>
      <button type="button" className="btn" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Next
      </button>
    </nav>
  );
}
