import { Component } from 'react';

// ErrorBoundary (FM-11): a crash in one screen shows a message instead of a blank page
export default class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="container">
          <div className="alert alert-error" role="alert">
            Something went wrong on this page. <a href="/">Go to the home page</a>.
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
