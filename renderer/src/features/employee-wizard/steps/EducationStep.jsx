import { useEffect } from 'react';
import { EDUCATION_LEVELS } from '../../../js/utils/pds.js';
import { AddRowButton, RemoveRowButton, SelectField, TextField } from './Fields.jsx';

export function emptyEducationRow(level = '') {
  return {
    level,
    schoolName: '',
    degreeCourse: '',
    periodFrom: '',
    periodTo: '',
    highestLevel: '',
    yearGraduated: '',
    honors: '',
  };
}

export function EducationStep({ rows, setRows }) {
  useEffect(() => {
    if (!rows.length) setRows(EDUCATION_LEVELS.map((level) => emptyEducationRow(level)));
  }, [rows.length, setRows]);

  const patchRow = (index, patch) =>
    setRows(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  return (
    <>
      <div className="pds-block-head">
        <p className="pds-hint">List educational background. Empty rows are ignored on save.</p>
        <AddRowButton onClick={() => setRows([...rows, emptyEducationRow()])} />
      </div>
      <div className="pds-rows" id="pds-edu-list">
        {rows.map((r, i) => (
          <div className="pds-card-row" key={i}>
            <div className="form-grid pds-grid-3">
              <SelectField
                label="Level"
                value={r.level}
                onChange={(value) => patchRow(i, { level: value })}
              >
                <option value="">—</option>
                {EDUCATION_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </SelectField>
              <TextField
                label="Name of School"
                value={r.schoolName}
                onChange={(value) => patchRow(i, { schoolName: value })}
              />
              <TextField
                label="Basic Ed. / Degree / Course"
                value={r.degreeCourse}
                onChange={(value) => patchRow(i, { degreeCourse: value })}
              />
              <TextField
                label="Period From"
                placeholder="YYYY"
                value={r.periodFrom}
                onChange={(value) => patchRow(i, { periodFrom: value })}
              />
              <TextField
                label="Period To"
                placeholder="YYYY"
                value={r.periodTo}
                onChange={(value) => patchRow(i, { periodTo: value })}
              />
              <TextField
                label="Highest Level / Units Earned"
                value={r.highestLevel}
                onChange={(value) => patchRow(i, { highestLevel: value })}
              />
              <TextField
                label="Year Graduated"
                value={r.yearGraduated}
                onChange={(value) => patchRow(i, { yearGraduated: value })}
              />
              <TextField
                label="Scholarship / Academic Honors"
                value={r.honors}
                onChange={(value) => patchRow(i, { honors: value })}
              />
            </div>
            <RemoveRowButton onClick={() => setRows(rows.filter((_, idx) => idx !== i))} />
          </div>
        ))}
      </div>
    </>
  );
}
