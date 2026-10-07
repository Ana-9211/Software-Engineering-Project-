import { Link } from 'react-router-dom';

// S-30 (page not found)
export default function NotFound() {
  return (
    <section>
      <h1>Page not found</h1>
      <p>The page you are looking for does not exist.</p>
      <Link to="/books" className="btn btn-primary">
        Back to the catalog
      </Link>
    </section>
  );
}
