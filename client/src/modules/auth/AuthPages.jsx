import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth, } from '../../auth/AuthContext.jsx';
import { homeFor } from '../../auth/guards.jsx';
import { authApi } from '../../api/endpoints.js';
import { TextField } from '../../components/Field.jsx';
import { ErrorMessage, Loading } from '../../components/states.jsx';
import { useToast } from '../../components/Toast.jsx';

// ---- validation: the same rules as the API (FR-01), for quick feedback only; the server decides ----
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validatePassword(password) {
  if (password.length < 8) return 'Use at least 8 characters.';
  if (new TextEncoder().encode(password).length > 72) return 'Use at most 72 characters.';
  return '';
}

// S-03 Register (UC-04, FR-01)
export function RegisterPage() {
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function onSubmit(e) {
    e.preventDefault();
    const found = {};
    if (!form.name.trim()) found.name = 'Enter your name.';
    if (!EMAIL_PATTERN.test(form.email)) found.email = 'Enter a valid email address.';
    const pw = validatePassword(form.password);
    if (pw) found.password = pw;
    setErrors(found);
    setError(null);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      await authApi.register({ name: form.name.trim(), email: form.email.trim(), password: form.password });
      setDone(true);
    } catch (err) {
      setError(err);
      setErrors(err.fieldErrors ? err.fieldErrors() : {});
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <section className="narrow">
        <h1>Check your email</h1>
        <p>We have sent a verification link to <strong>{form.email}</strong>. Open it to activate your account, then log in.</p>
        <Link to="/login" className="btn btn-primary">Go to log in</Link>
      </section>
    );
  }
  return (
    <section className="narrow">
      <h1>Create an account</h1>
      <form onSubmit={onSubmit} noValidate>
        <ErrorMessage error={error} />
        <TextField label="Name" value={form.name} onChange={set('name')} error={errors.name} autoComplete="name" maxLength={100} required />
        <TextField label="Email" type="email" value={form.email} onChange={set('email')} error={errors.email} autoComplete="email" required />
        <TextField label="Password" type="password" value={form.password} onChange={set('password')} error={errors.password} hint="At least 8 characters." autoComplete="new-password" required />
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Creating account...' : 'Register'}</button>
      </form>
      <p>Already registered? <Link to="/login">Log in</Link></p>
    </section>
  );
}

// S-04 Verify email (UC-04): the link in the email opens /verify-email?token=...
export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [state, setState] = useState({ status: token ? 'working' : 'missing', error: null });
  const [email, setEmail] = useState('');
  const [resent, setResent] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true; // the token can be used once, so the request is sent once
    authApi
      .verifyEmail(token)
      .then(() => setState({ status: 'ok', error: null }))
      .catch((error) => setState({ status: 'failed', error }));
  }, [token]);

  async function resend(e) {
    e.preventDefault();
    if (!EMAIL_PATTERN.test(email)) return;
    await authApi.resendVerification(email).catch(() => {});
    setResent(true);
  }

  return (
    <section className="narrow">
      <h1>Verify your email</h1>
      {state.status === 'working' && <Loading label="Verifying" />}
      {state.status === 'ok' && (
        <>
          <p className="alert alert-success" role="status">Your email is verified.</p>
          <Link to="/login" className="btn btn-primary">Log in</Link>
        </>
      )}
      {(state.status === 'failed' || state.status === 'missing') && (
        <>
          {state.status === 'failed' && <ErrorMessage error={state.error} />}
          <p>The link may have expired. Enter your email and we will send a new one.</p>
          {resent ? (
            <p className="alert alert-success" role="status">If the address is registered and not verified, a new link is on its way.</p>
          ) : (
            <form onSubmit={resend} noValidate>
              <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
              <button type="submit" className="btn btn-primary">Send a new link</button>
            </form>
          )}
        </>
      )}
    </section>
  );
}

// S-05 Login (UC-05, FR-02)
export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!EMAIL_PATTERN.test(form.email) || !form.password) {
      setError({ message: 'Enter your email address and password.' });
      return;
    }
    setBusy(true);
    try {
      const user = await login(form.email.trim(), form.password);
      toast.show(`Welcome, ${user.name}.`, 'success');
      const from = location.state && location.state.from;
      navigate(from && !user.roles.includes('admin') ? from : homeFor(user), { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    await authApi.resendVerification(form.email.trim()).catch(() => {});
    setResent(true);
  }

  return (
    <section className="narrow">
      <h1>Log in</h1>
      <form onSubmit={onSubmit} noValidate>
        <ErrorMessage error={error} />
        {error && error.code === 'EMAIL_NOT_VERIFIED' && (
          resent ? <p role="status">A new verification link has been sent.</p> : <button type="button" className="btn btn-small" onClick={resend}>Send the verification link again</button>
        )}
        <TextField label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="username" required />
        <TextField label="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="current-password" required />
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Logging in...' : 'Log in'}</button>
      </form>
      <p><Link to="/forgot-password">Forgot your password?</Link></p>
      <p>New here? <Link to="/register">Create an account</Link></p>
    </section>
  );
}

// S-06 Forgot password (UC-14)
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!EMAIL_PATTERN.test(email)) {
      setError({ message: 'Enter a valid email address.' });
      return;
    }
    try {
      await authApi.forgotPassword(email.trim());
      setDone(true);
    } catch (err) {
      setError(err);
    }
  }

  return (
    <section className="narrow">
      <h1>Forgot your password?</h1>
      {done ? (
        <p className="alert alert-success" role="status">If this email is registered, a password reset link has been sent. It is valid for 30 minutes.</p>
      ) : (
        <form onSubmit={onSubmit} noValidate>
          <ErrorMessage error={error} />
          <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          <button type="submit" className="btn btn-primary">Send reset link</button>
        </form>
      )}
      <p><Link to="/login">Back to log in</Link></p>
    </section>
  );
}

// S-07 Reset password (UC-14, FR-03)
export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    const found = {};
    const pw = validatePassword(password);
    if (pw) found.password = pw;
    if (password !== confirm) found.confirm = 'The passwords do not match.';
    setErrors(found);
    if (Object.keys(found).length) return;
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err);
    }
  }

  if (!token) {
    return (
      <section className="narrow">
        <h1>Reset password</h1>
        <p className="alert alert-error" role="alert">This page needs the link from the reset email.</p>
        <Link to="/forgot-password">Ask for a new link</Link>
      </section>
    );
  }
  return (
    <section className="narrow">
      <h1>Choose a new password</h1>
      {done ? (
        <>
          <p className="alert alert-success" role="status">Your password has been changed. All other sessions were ended.</p>
          <Link to="/login" className="btn btn-primary">Log in</Link>
        </>
      ) : (
        <form onSubmit={onSubmit} noValidate>
          <ErrorMessage error={error} />
          {error && error.code === 'TOKEN_INVALID_OR_EXPIRED' && <p><Link to="/forgot-password">Ask for a new link</Link></p>}
          <TextField label="New password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} hint="At least 8 characters." autoComplete="new-password" required />
          <TextField label="Repeat the new password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} autoComplete="new-password" required />
          <button type="submit" className="btn btn-primary">Change password</button>
        </form>
      )}
    </section>
  );
}
