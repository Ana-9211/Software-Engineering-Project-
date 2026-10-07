import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { catalogApi, cartApi, wishlistApi } from '../../api/endpoints.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useFetch } from '../../components/useFetch.js';
import { Async, ErrorMessage } from '../../components/states.jsx';
import StarRating from '../../components/StarRating.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { useToast } from '../../components/Toast.jsx';
import { notifyCartChanged } from '../../components/NavBar.jsx';
import { ReviewForm, ReviewList } from '../reviews/ReviewComponents.jsx';
import { formatMoney } from '../../utils/format.js';

// AddToCartButton and WishlistButton (FM-02, FM-04). Guests are sent to the login screen first.
function BuyActions({ book }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const out = book.stockStatus !== 'In stock';

  if (user && !user.roles.includes('customer')) return null; // administrators do not shop

  const needLogin = () => navigate('/login', { state: { from: location.pathname } });

  async function addToCart() {
    if (!user) return needLogin();
    setBusy(true);
    setError(null);
    try {
      await cartApi.add(book.id, Number(quantity));
      notifyCartChanged();
      toast.show('Added to your cart.', 'success');
    } catch (err) {
      setError(err); // FR-09: the stock message from the API is shown as it is
    } finally {
      setBusy(false);
    }
    return undefined;
  }

  async function addToWishlist() {
    if (!user) return needLogin();
    try {
      await wishlistApi.add(book.id);
      toast.show('Added to your wishlist.', 'success');
    } catch (err) {
      setError(err);
    }
    return undefined;
  }

  return (
    <div className="buy-actions">
      <ErrorMessage error={error} />
      <div className="row">
        <div className="field qty">
          <label htmlFor="qty">Quantity</label>
          <input id="qty" type="number" min="1" max="50" value={quantity} onChange={(e) => setQuantity(e.target.value)} disabled={out} />
        </div>
        <button type="button" className="btn btn-primary" onClick={addToCart} disabled={out || busy || !(Number(quantity) >= 1)}>
          {out ? 'Out of stock' : 'Add to cart'}
        </button>
        <button type="button" className="btn" onClick={addToWishlist}>Add to wishlist</button>
      </div>
    </div>
  );
}

// S-02 Book details (UC-03, FR-07), with reviews (S-15 as a dialog)
export default function BookDetailPage() {
  const { bookId } = useParams();
  const { user } = useAuth();
  const [reviewPage, setReviewPage] = useState(1);
  const [reviewOpen, setReviewOpen] = useState(false);
  const toast = useToast();
  const book = useFetch(() => catalogApi.book(bookId), [bookId]);
  const reviews = useFetch(() => catalogApi.reviews(bookId, reviewPage), [bookId, reviewPage]);
  const canReview = user && user.roles.includes('customer');

  return (
    <section>
      <p><Link to="/books">Back to the catalog</Link></p>
      <Async state={book}>
        {(b) => (
          <>
            <div className="detail">
              <div className="detail-images">
                {b.imageUrls.length > 0 ? (
                  b.imageUrls.map((u, i) => <img key={u} src={u} alt={i === 0 ? `Cover of ${b.title}` : `${b.title}, image ${i + 1}`} />)
                ) : (
                  <div className="cover-placeholder big" aria-hidden="true">No cover</div>
                )}
              </div>
              <div>
                <h1>{b.title}</h1>
                <p className="muted">by {b.author}</p>
                <p className="price big-price">{formatMoney(b.price)}</p>
                <StarRating value={b.avgRating} count={b.reviewCount} />
                <p className={b.stockStatus === 'In stock' ? 'in-stock' : 'out-of-stock'}>{b.stockStatus}</p>
                <BuyActions book={b} />
                <dl className="facts">
                  <dt>ISBN</dt><dd>{b.isbn}</dd>
                  <dt>Language</dt><dd>{b.language}</dd>
                </dl>
                {b.description && <p className="description">{b.description}</p>}
              </div>
            </div>

            <h2>Reviews</h2>
            {canReview && <button type="button" className="btn" onClick={() => setReviewOpen(true)}>Write a review</button>}
            <Async state={reviews}>{(d) => <ReviewList data={d} onPage={setReviewPage} />}</Async>
            {reviewOpen && (
              <ConfirmDialog title="Review this book" hideConfirm onCancel={() => setReviewOpen(false)}>
                <ReviewForm
                  bookId={bookId}
                  onDone={() => {
                    setReviewOpen(false);
                    toast.show('Thank you for your review.', 'success');
                    setReviewPage(1);
                    reviews.reload();
                    book.reload();
                  }}
                />
              </ConfirmDialog>
            )}
          </>
        )}
      </Async>
    </section>
  );
}
