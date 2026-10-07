import { useId } from 'react';

// Labelled form field with an error message tied to the input (accessibility, VFR-11)
export function Field({ label, error, hint, children }) {
  const id = useId();
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children({ id, 'aria-invalid': error ? 'true' : undefined, 'aria-describedby': describedBy })}
      {hint && !error && (
        <small id={`${id}-hint`} className="hint">
          {hint}
        </small>
      )}
      {error && (
        <small id={`${id}-err`} className="field-error" role="alert">
          {error}
        </small>
      )}
    </div>
  );
}

export function TextField({ label, error, hint, ...input }) {
  return (
    <Field label={label} error={error} hint={hint}>
      {(p) => <input {...p} {...input} />}
    </Field>
  );
}

export function SelectField({ label, error, hint, children, ...input }) {
  return (
    <Field label={label} error={error} hint={hint}>
      {(p) => (
        <select {...p} {...input}>
          {children}
        </select>
      )}
    </Field>
  );
}

export function TextArea({ label, error, hint, ...input }) {
  return (
    <Field label={label} error={error} hint={hint}>
      {(p) => <textarea {...p} {...input} />}
    </Field>
  );
}
