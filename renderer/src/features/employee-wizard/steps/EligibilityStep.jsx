import { AddRowButton, EmptyRows, RemoveRowButton, TextField } from './Fields.jsx';

export function emptyEligibilityRow() {
  return {
    careerService: '',
    rating: '',
    examDate: '',
    examPlace: '',
    licenseNumber: '',
    licenseValidity: '',
  };
}

export function EligibilityStep({ rows, setRows }) {
  const patchRow = (index, patch) =>
    setRows(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  return (
    <>
      <div className="pds-block-head">
        <p className="pds-hint">Civil service eligibility, board exams, licenses.</p>
        <AddRowButton onClick={() => setRows([...rows, emptyEligibilityRow()])} />
      </div>
      <div className="pds-rows" id="pds-elig-list">
        {rows.length === 0 ? (
          <EmptyRows>No eligibility entries.</EmptyRows>
        ) : (
          rows.map((r, i) => (
            <div className="pds-card-row" key={i}>
              <div className="form-grid pds-grid-3">
                <TextField
                  label="Career Service / RA / Board"
                  value={r.careerService}
                  onChange={(value) => patchRow(i, { careerService: value })}
                />
                <TextField
                  label="Rating"
                  value={r.rating}
                  onChange={(value) => patchRow(i, { rating: value })}
                />
                <TextField
                  label="Date of Examination"
                  type="date"
                  value={r.examDate}
                  onChange={(value) => patchRow(i, { examDate: value })}
                />
                <TextField
                  label="Place of Examination"
                  value={r.examPlace}
                  onChange={(value) => patchRow(i, { examPlace: value })}
                />
                <TextField
                  label="License Number"
                  value={r.licenseNumber}
                  onChange={(value) => patchRow(i, { licenseNumber: value })}
                />
                <TextField
                  label="Date of Validity"
                  type="date"
                  value={r.licenseValidity}
                  onChange={(value) => patchRow(i, { licenseValidity: value })}
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
