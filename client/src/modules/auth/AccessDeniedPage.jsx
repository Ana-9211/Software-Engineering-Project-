import { Link } from 'react-router-dom';

// S-30 (access denied): shown when a logged-in user opens a screen for another role
export default function AccessDenied() {
  return (
    <section>
      <h1>Access denied</h1>
      <p>Your account does not have permission to open this page.</p>
      <Link to="/books" className="btn btn-primary">
        Back to the catalog
      </Link>
    </section>
  );
}
