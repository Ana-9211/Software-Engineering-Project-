import { useState } from 'react';
import { Link } from 'react-router-dom';
import { wishlistApi, cartApi } from '../../api/endpoints.js';
import { useFetch } from '../../components/useFetch.js';
import { Async, ErrorMessage } from '../../components/states.jsx';
import BookCard from '../../components/BookCard.jsx';
import { useToast } from '../../components/Toast.jsx';
import { notifyCartChanged } from '../../components/NavBar.jsx';

// S-09 Wishlist (UC-07, FR-10): MoveToCartButton adds one copy to the cart and removes the book from the wishlist
export default function WishlistPage() {
  const wishlist = useFetch(() => wishlistApi.get(), []);
  const [error, setError] = useState(null);
  const toast = useToast();

  async function remove(book) {
    setError(null);
    try {
      await wishlistApi.remove(book.id);
      wishlist.reload();
    } catch (err) {
      setError(err);
    }
  }

  async function moveToCart(book) {
    setError(null);
    try {
      await cartApi.add(book.id, 1);
      await wishlistApi.remove(book.id);
      notifyCartChanged();
      toast.show('Moved to your cart.', 'success');
      wishlist.reload();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <section>
      <h1>Your wishlist</h1>
      <ErrorMessage error={error} />
      <Async state={wishlist} empty={{ test: (d) => d.items.length === 0, title: 'Your wishlist is empty.', children: <Link to="/books" className="btn btn-primary">Browse books</Link> }}>
        {(d) => (
          <div className="book-grid">
            {d.items.map((b) => (
              <div key={b.id}>
                <BookCard book={b} />
                <div className="row">
                  <button type="button" className="btn btn-small btn-primary" onClick={() => moveToCart(b)} disabled={b.stockStatus !== 'In stock'}>Move to cart</button>
                  <button type="button" className="btn btn-small" onClick={() => remove(b)}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Async>
    </section>
  );
}
