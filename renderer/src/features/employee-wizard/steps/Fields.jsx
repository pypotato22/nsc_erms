import { emptyAddress, emptyPersonName } from '../../../js/utils/pds.js';

export function Field({ label, full = false, children }) {
  return (
    <div className={full ? 'fg full' : 'fg'}>
      <label>{label}</label>
      {children}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  full = false,
  disabled = false,
}) {
  return (
    <Field label={label} full={full}>
      <input
        type={type}
        value={value ?? ''}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

export function SelectField({ label, value, onChange, children, full = false, disabled = false }) {
  return (
    <Field label={label} full={full}>
      <select value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </Field>
  );
}

export function TextAreaField({ label, value, onChange, rows = 2, full = true }) {
  return (
    <Field label={label} full={full}>
      <textarea rows={rows} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

export function YesNoOptions() {
  return (
    <>
      <option value="">—</option>
      <option value="Yes">Yes</option>
      <option value="No">No</option>
    </>
  );
}

export function AddRowButton({ onClick, children = 'Add row' }) {
  return (
    <button type="button" className="btn btn-sm needs-write" onClick={onClick}>
      {children}
    </button>
  );
}

export function RemoveRowButton({ onClick, children = 'Remove', title }) {
  return (
    <button type="button" className="btn btn-sm btn-danger-ghost" title={title} onClick={onClick}>
      {children}
    </button>
  );
}

export function EmptyRows({ children }) {
  return <p className="pds-empty">{children}</p>;
}

export function AddressBlock({ title, address, onChange, disabled = false }) {
  const a = address || emptyAddress();
  const field = (key) => (value) => onChange({ [key]: value });
  return (
    <div className="pds-block">
      <h5>{title}</h5>
      <div className="form-grid pds-grid-3">
        <TextField
          label="House/Block/Lot No."
          value={a.houseBlockLot}
          onChange={field('houseBlockLot')}
          disabled={disabled}
        />
        <TextField label="Street" value={a.street} onChange={field('street')} disabled={disabled} />
        <TextField
          label="Subdivision/Village"
          value={a.subdivision}
          onChange={field('subdivision')}
          disabled={disabled}
        />
        <TextField
          label="Barangay"
          value={a.barangay}
          onChange={field('barangay')}
          disabled={disabled}
        />
        <TextField
          label="City/Municipality"
          value={a.cityMunicipality}
          onChange={field('cityMunicipality')}
          disabled={disabled}
        />
        <TextField
          label="Province"
          value={a.province}
          onChange={field('province')}
          disabled={disabled}
        />
        <TextField
          label="ZIP Code"
          value={a.zipCode}
          onChange={field('zipCode')}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

export function PersonNameFields({ person, onChange }) {
  const p = person || emptyPersonName();
  const field = (key) => (value) => onChange({ [key]: value });
  return (
    <div className="form-grid pds-grid-3">
      <TextField label="Surname" value={p.surname} onChange={field('surname')} />
      <TextField label="First Name" value={p.firstName} onChange={field('firstName')} />
      <TextField label="Name Extension" value={p.nameExtension} onChange={field('nameExtension')} />
      <TextField label="Middle Name" value={p.middleName} onChange={field('middleName')} />
    </div>
  );
}
