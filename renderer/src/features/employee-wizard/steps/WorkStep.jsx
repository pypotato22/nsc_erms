import { AddRowButton, EmptyRows, RemoveRowButton, SelectField, TextField } from './Fields.jsx';

export function emptyWorkRow() {
  return {
    from: '',
    to: '',
    positionTitle: '',
    departmentAgency: '',
    monthlySalary: '',
    salaryGrade: '',
    statusOfAppointment: '',
    govService: false,
  };
}

export function WorkStep({ rows, setRows }) {
  const patchRow = (index, patch) =>
    setRows(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  return (
    <>
      <div className="pds-block-head">
        <p className="pds-hint">Include all experience. Start with the most recent.</p>
        <AddRowButton onClick={() => setRows([...rows, emptyWorkRow()])} />
      </div>
      <div className="pds-rows" id="pds-work-list">
        {rows.length === 0 ? (
          <EmptyRows>No work experience entries.</EmptyRows>
        ) : (
          rows.map((r, i) => (
            <div className="pds-card-row" key={i}>
              <div className="form-grid pds-grid-3">
                <TextField
                  label="Inclusive dates — From"
                  type="date"
                  value={r.from}
                  onChange={(value) => patchRow(i, { from: value })}
                />
                <TextField
                  label="To"
                  type="date"
                  value={r.to}
                  onChange={(value) => patchRow(i, { to: value })}
                />
                <TextField
                  label="Position Title"
                  value={r.positionTitle}
                  onChange={(value) => patchRow(i, { positionTitle: value })}
                />
                <TextField
                  label="Department / Agency / Office / Company"
                  full
                  value={r.departmentAgency}
                  onChange={(value) => patchRow(i, { departmentAgency: value })}
                />
                <TextField
                  label="Monthly Salary"
                  value={r.monthlySalary}
                  onChange={(value) => patchRow(i, { monthlySalary: value })}
                />
                <TextField
                  label="Salary / Job / Pay Grade"
                  value={r.salaryGrade}
                  onChange={(value) => patchRow(i, { salaryGrade: value })}
                />
                <TextField
                  label="Status of Appointment"
                  value={r.statusOfAppointment}
                  onChange={(value) => patchRow(i, { statusOfAppointment: value })}
                />
                <SelectField
                  label="Gov't service?"
                  value={String(Boolean(r.govService))}
                  onChange={(value) => patchRow(i, { govService: value === 'true' })}
                >
                  <option value="false">No</option>
                  <option value="true">Yes</option>
                </SelectField>
              </div>
              <RemoveRowButton onClick={() => setRows(rows.filter((_, idx) => idx !== i))} />
            </div>
          ))
        )}
      </div>
    </>
  );
}
