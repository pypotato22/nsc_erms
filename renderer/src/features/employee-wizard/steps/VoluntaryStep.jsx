import { AddRowButton, EmptyRows, RemoveRowButton, TextField } from './Fields.jsx';

export function emptyVoluntaryRow() {
  return {
    orgName: '',
    orgAddress: '',
    from: '',
    to: '',
    hours: '',
    positionNature: '',
  };
}

export function VoluntaryStep({ rows, setRows }) {
  const patchRow = (index, patch) =>
    setRows(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  return (
    <>
      <div className="pds-block-head">
        <p className="pds-hint">
          Voluntary work or involvement in civic / NGO / people organizations.
        </p>
        <AddRowButton onClick={() => setRows([...rows, emptyVoluntaryRow()])} />
      </div>
      <div className="pds-rows">
        {rows.length === 0 ? (
          <EmptyRows>No voluntary work entries.</EmptyRows>
        ) : (
          rows.map((r, i) => (
            <div className="pds-card-row" key={i}>
              <div className="form-grid pds-grid-3">
                <TextField
                  label="Name & address of organization"
                  full
                  value={r.orgName}
                  onChange={(value) => patchRow(i, { orgName: value })}
                />
                <TextField
                  label="Address"
                  full
                  value={r.orgAddress}
                  onChange={(value) => patchRow(i, { orgAddress: value })}
                />
                <TextField
                  label="From"
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
                  label="Number of Hours"
                  value={r.hours}
                  onChange={(value) => patchRow(i, { hours: value })}
                />
                <TextField
                  label="Position / Nature of Work"
                  value={r.positionNature}
                  onChange={(value) => patchRow(i, { positionNature: value })}
                />
              </div>
              <RemoveRowButton onClick={() => setRows(rows.filter((_, idx) => idx !== i))} />
            </div>
          ))
        )}
      </div>
    </>
  );
}
