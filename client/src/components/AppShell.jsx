import { Outlet } from 'react-router-dom';
import NavBar from './NavBar.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';

// AppShell (FM-11): header, main content and footer on every screen
export default function AppShell() {
  return (
    <>
      <a href="#content" className="skip-link">
        Skip to content
      </a>
      <NavBar />
      <main id="content" className="container" tabIndex={-1}>
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
      <footer className="site-footer">
        <div className="container">Online Bookstore - Software Engineering course project</div>
      </footer>
    </>
  );
}
