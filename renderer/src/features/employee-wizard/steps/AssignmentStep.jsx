import { useEffect, useState } from 'react';
import { getDepartmentPositions } from '../../../js/api/departments.js';
import { SelectField, TextField } from './Fields.jsx';

export function AssignmentStep({
  assignment,
  patchAssignment,
  departments,
  employmentTypes,
  employmentStatuses,
  defaultEmployeeNo,
}) {
  const [positions, setPositions] = useState([]);
  const [positionsState, setPositionsState] = useState('idle');

  const departmentId = assignment.departmentId;

  useEffect(() => {
    if (!departmentId) {
      setPositions([]);
      setPositionsState('idle');
      return undefined;
    }
    let cancelled = false;
    setPositionsState('loading');
    getDepartmentPositions(departmentId)
      .then(({ positions: next }) => {
        if (cancelled) return;
        setPositions(next);
        setPositionsState('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setPositions([]);
        setPositionsState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [departmentId]);

  useEffect(() => {
    if (positionsState !== 'ready' || !assignment.departmentPositionId) return;
    const stillValid = positions.some(
      (p) => String(p.department_position_id) === String(assignment.departmentPositionId),
    );
    if (!stillValid) patchAssignment({ departmentPositionId: '' });
  }, [positions, positionsState, assignment.departmentPositionId, patchAssignment]);

  const positionDisabled = positionsState !== 'ready' || positions.length === 0;

  return (
    <>
      <p className="pds-hint">NSC employment placement for this record (required to save).</p>
      <div className="form-grid">
        <TextField
          label="Employee No"
          value={assignment.employeeNo || defaultEmployeeNo || ''}
          onChange={(value) => patchAssignment({ employeeNo: value })}
        />
        <SelectField
          label="Department *"
          value={String(assignment.departmentId || '')}
          onChange={(value) =>
            patchAssignment({ departmentId: value, departmentPositionId: '' })
          }
        >
          <option value="">Select department</option>
          {departments.map((d) => (
            <option key={d.id} value={String(d.id)}>
              {d.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Position *"
          value={String(assignment.departmentPositionId || '')}
          disabled={positionDisabled}
          onChange={(value) => patchAssignment({ departmentPositionId: value })}
        >
          {positionsState === 'idle' || positionsState === 'error' ? (
            <option value="">Select department first</option>
          ) : positionsState === 'loading' ? (
            <option value="">Loading…</option>
          ) : positions.length === 0 ? (
            <option value="">No positions for this department</option>
          ) : (
            <>
              <option value="">Select position</option>
              {positions.map((p) => (
                <option key={p.department_position_id} value={String(p.department_position_id)}>
                  {p.position_name}
                </option>
              ))}
            </>
          )}
        </SelectField>
        <SelectField
          label="Employment type *"
          value={String(assignment.employmentTypeId || '')}
          onChange={(value) => patchAssignment({ employmentTypeId: value })}
        >
          {employmentTypes.map((t) => (
            <option key={t.id} value={String(t.id)}>
              {t.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Status *"
          value={String(assignment.employmentStatusId || '')}
          onChange={(value) => patchAssignment({ employmentStatusId: value })}
        >
          {employmentStatuses.map((s) => (
            <option key={s.id} value={String(s.id)}>
              {s.name}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Start Date *"
          type="date"
          value={assignment.startDate}
          onChange={(value) => patchAssignment({ startDate: value })}
        />
      </div>
    </>
  );
}
