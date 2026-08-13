import { AddRowButton, EmptyRows, RemoveRowButton, TextField } from './Fields.jsx';

export function emptyLearningRow() {
  return {
    title: '',
    from: '',
    to: '',
    hours: '',
    type: '',
    conductedBy: '',
  };
}

export function LearningStep({ rows, setRows }) {
  const patchRow = (index, patch) =>
    setRows(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  return (
    <>
      <div className="pds-block-head">
        <p className="pds-hint">Learning and development interventions / training programs.</p>
        <AddRowButton onClick={() => setRows([...rows, emptyLearningRow()])} />
      </div>
      <div className="pds-rows">
        {rows.length === 0 ? (
          <EmptyRows>No L&D entries.</EmptyRows>
        ) : (
          rows.map((r, i) => (
            <div className="pds-card-row" key={i}>
              <div className="form-grid pds-grid-3">
                <TextField
                  label="Title of Learning and Development Interventions / Training Programs"
                  full
                  value={r.title}
                  onChange={(value) => patchRow(i, { title: value })}
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
                  label="Type of L&D"
                  placeholder="Managerial / Supervisory / Technical / etc."
                  value={r.type}
                  onChange={(value) => patchRow(i, { type: value })}
                />
                <TextField
                  label="Conducted / Sponsored By"
                  full
                  value={r.conductedBy}
                  onChange={(value) => patchRow(i, { conductedBy: value })}
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
