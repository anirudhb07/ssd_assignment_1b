import { useId } from 'react';

// Label + control. Pass the control as children, or use TextField / SelectField.
export function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
      {hint && <span className="muted">{hint}</span>}
    </label>
  );
}

export function TextField({ label, hint, id, ...inputProps }) {
  const autoId = useId();
  return (
    <Field label={label} hint={hint}>
      <input id={id ?? autoId} className="input" {...inputProps} />
    </Field>
  );
}

// options: [{ value, label }]
export function SelectField({ label, hint, id, options, placeholder, ...selectProps }) {
  const autoId = useId();
  return (
    <Field label={label} hint={hint}>
      <select id={id ?? autoId} className="select" {...selectProps}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </Field>
  );
}
