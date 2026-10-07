import { Link } from 'react-router-dom';
import { formatMoney } from '../utils/format.js';
import StarRating from './StarRating.jsx';

// BookCard (FM-02): cover, title, author, price, rating and stock status
export default function BookCard({ book }) {
  const cover = book.imageUrls && book.imageUrls[0];
  return (
    <article className="book-card">
      {/* the title below is the real link; this cover link repeats it for mouse and touch users only */}
      <Link to={`/books/${book.id}`} className="cover-link" tabIndex={-1} aria-hidden="true">
        {cover ? <img src={cover} alt={`Cover of ${book.title}`} loading="lazy" /> : <div className="cover-placeholder" aria-hidden="true">No cover</div>}
      </Link>
      <h3>
        <Link to={`/books/${book.id}`}>{book.title}</Link>
      </h3>
      <p className="muted">{book.author}</p>
      <p className="price">{formatMoney(book.price)}</p>
      <StarRating value={book.avgRating} count={book.reviewCount} />
      <p className={book.stockStatus === 'In stock' ? 'in-stock' : 'out-of-stock'}>{book.stockStatus}</p>
    </article>
  );
}
