import { useEffect, useState } from 'react';
import { profileApi, sellerApi } from '../../api/endpoints.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useFetch } from '../../components/useFetch.js';
import { Async, ErrorMessage } from '../../components/states.jsx';
import { TextArea, TextField } from '../../components/Field.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { useToast } from '../../components/Toast.jsx';
import { AddressForm, validateAddress } from '../checkout/CheckoutPages.jsx';

const BLANK = { label: '', fullName: '', line1: '', line2: '', city: '', state: '', postalCode: '', country: 'India', phone: '' };

// AddressBook (FM-08): up to 5 saved addresses (FR-18)
function AddressBook({ addresses, reload }) {
  const [editing, setEditing] = useState(null); // null, 'new' or an address
  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [removing, setRemoving] = useState(null);
  const toast = useToast();

  function startEdit(a) {
    setEditing(a);
    setForm(a === 'new' ? BLANK : { ...BLANK, ...a });
    setErrors({});
    setError(null);
  }

  async function save(e) {
    e.preventDefault();
    const found = validateAddress(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    const body = { label: form.label, fullName: form.fullName.trim(), line1: form.line1.trim(), line2: (form.line2 || '').trim(), city: form.city.trim(), state: form.state.trim(), postalCode: form.postalCode.trim(), country: form.country.trim(), phone: form.phone.trim() };
    try {
      if (editing === 'new') await profileApi.addAddress(body);
      else await profileApi.updateAddress(editing.id, body);
      setEditing(null);
      toast.show('Address saved.', 'success');
      reload();
    } catch (err) {
      setError(err);
      setErrors(err.fieldErrors ? err.fieldErrors() : {});
    }
  }

  async function makeDefault(a) {
    try {
      await profileApi.updateAddress(a.id, { isDefault: true });
      reload();
    } catch (err) {
      setError(err);
    }
  }

  async function remove() {
    try {
      await profileApi.removeAddress(removing.id);
      setRemoving(null);
      reload();
    } catch (err) {
      setError(err);
      setRemoving(null);
    }
  }

  return (
    <div>
      <h2>Saved addresses ({addresses.length} of 5)</h2>
      <ErrorMessage error={editing ? null : error} />
      {addresses.length === 0 && <p className="muted">You have no saved addresses.</p>}
      <ul className="address-cards">
        {addresses.map((a) => (
          <li key={a.id}>
            <strong>{a.fullName}</strong> {a.label && <span className="muted">({a.label})</span>} {a.isDefault && <span className="badge badge-delivered">Default</span>}
            <br />{a.line1}{a.line2 ? `, ${a.line2}` : ''}, {a.city}, {a.state} {a.postalCode}, {a.country}<br />{a.phone}
            <div className="row">
              <button type="button" className="btn btn-small" onClick={() => startEdit(a)}>Edit</button>
              {!a.isDefault && <button type="button" className="btn btn-small" onClick={() => makeDefault(a)}>Make default</button>}
              <button type="button" className="btn btn-small btn-danger" onClick={() => setRemoving(a)}>Delete</button>
            </div>
          </li>
        ))}
      </ul>
      {!editing && addresses.length < 5 && <button type="button" className="btn" onClick={() => startEdit('new')}>Add an address</button>}
      {!editing && addresses.length >= 5 && <p className="muted">You have reached the limit of 5 addresses. Delete one to add another.</p>}
      {editing && (
        <form onSubmit={save} noValidate className="panel">
          <h3>{editing === 'new' ? 'New address' : 'Edit address'}</h3>
          <ErrorMessage error={error} />
          <TextField label="Label (optional, e.g. Home)" value={form.label || ''} onChange={(e) => setForm({ ...form, label: e.target.value })} maxLength={30} />
          <AddressForm value={form} onChange={setForm} errors={errors} />
          <div className="row">
            <button type="submit" className="btn btn-primary">Save address</button>
            <button type="button" className="btn" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </form>
      )}
      {removing && (
        <ConfirmDialog title="Delete this address?" confirmLabel="Delete" danger onConfirm={remove} onCancel={() => setRemoving(null)}>
          <p>{removing.line1}, {removing.city}</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

// S-16 Profile and addresses (UC-13, FR-18)
export function ProfilePage() {
  const profile = useFetch(() => profileApi.get(), []);
  const { refresh } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ name: '', phone: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    if (profile.data) setForm({ name: profile.data.name, phone: profile.data.phone || '' });
  }, [profile.data]);

  async function save(e) {
    e.preventDefault();
    const found = {};
    if (!form.name.trim()) found.name = 'Enter your name.';
    if (form.phone && !/^\d{7,15}$/.test(form.phone)) found.phone = 'Use 7 to 15 digits.';
    setErrors(found);
    setError(null);
    if (Object.keys(found).length) return;
    try {
      const body = { name: form.name.trim() };
      if (form.phone) body.phone = form.phone;
      await profileApi.update(body);
      await refresh();
      toast.show('Profile saved.', 'success');
      profile.reload();
    } catch (err) {
      setError(err);
      setErrors(err.fieldErrors ? err.fieldErrors() : {});
    }
  }

  return (
    <section>
      <h1>Your profile</h1>
      <Async state={profile}>
        {(p) => (
          <>
            <form onSubmit={save} noValidate className="narrow">
              <ErrorMessage error={error} />
              <TextField label="Email (cannot be changed)" value={p.email} readOnly />
              <TextField label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={errors.name} maxLength={100} />
              <TextField label="Phone (digits only)" inputMode="numeric" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} error={errors.phone} />
              <button type="submit" className="btn btn-primary">Save profile</button>
            </form>
            <AddressBook addresses={p.addresses} reload={profile.reload} />
          </>
        )}
      </Async>
    </section>
  );
}

// S-17 Become a seller (UC-15, FR-19)
export function SellerApplicationPage() {
  const { user } = useAuth();
  const application = useFetch(async () => {
    try {
      return await sellerApi.myApplication();
    } catch (err) {
      if (err.status === 404) return { status: 'none' };
      throw err;
    }
  }, []);
  const [form, setForm] = useState({ storeName: '', description: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    const found = {};
    if (form.storeName.trim().length < 2) found.storeName = 'Enter a store name of at least 2 characters.';
    setErrors(found);
    setError(null);
    if (Object.keys(found).length) return;
    try {
      await sellerApi.apply({ storeName: form.storeName.trim(), description: form.description.trim() });
      application.reload();
    } catch (err) {
      setError(err);
      setErrors(err.fieldErrors ? err.fieldErrors() : {});
    }
  }

  if (user && user.roles.includes('seller')) {
    return <section><h1>Become a seller</h1><p className="alert alert-success" role="status">You are an approved seller. Open the seller dashboard from the menu.</p></section>;
  }
  return (
    <section className="narrow">
      <h1>Become a seller</h1>
      <Async state={application}>
        {(a) => (
          <>
            {a.status === 'pending' && <p className="alert alert-info" role="status">Your application for <strong>{a.storeName}</strong> is waiting for an administrator.</p>}
            {a.status === 'rejected' && <p className="alert alert-error" role="alert">Your last application was rejected: {a.rejectionReason}. You can apply again.</p>}
            {a.status !== 'pending' && (
              <form onSubmit={submit} noValidate>
                <ErrorMessage error={error} />
                <p>An administrator reviews every application. After approval you can list books and still buy as a customer.</p>
                <TextField label="Store name" value={form.storeName} onChange={(e) => setForm({ ...form, storeName: e.target.value })} error={errors.storeName} maxLength={100} required />
                <TextArea label="About your store (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={1000} rows={4} />
                <button type="submit" className="btn btn-primary">Send application</button>
              </form>
            )}
          </>
        )}
      </Async>
    </section>
  );
}
