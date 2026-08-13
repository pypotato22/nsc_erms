import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  listDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  listPositions,
  createPosition,
  updatePosition,
} from '../../js/api/departments.js';
import { ApiError } from '../../js/api/client.js';
import { showToast } from '../../js/utils/toast.js';
import { canWrite } from '../../js/utils/authz.js';
import { emitAppEvent, onAppEvent } from '../../shared/lib/appEvents.js';

const CHIP_LIMIT = 4;

export function DepartmentsPage() {
  const [departments, setDepartments] = useState([]);
  const [filter, setFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [allPositions, setAllPositions] = useState([]);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [newPosName, setNewPosName] = useState('');
  const writable = canWrite();

  const load = useCallback(async () => {
    try {
      const { departments: rows } = await listDepartments();
      setDepartments(rows || []);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Something went wrong.', 'error');
    }
  }, []);

  useEffect(() => {
    load();
    return onAppEvent('departments.refresh', load);
  }, [load]);

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return departments;
    return departments.filter((d) => `${d.name || ''} ${d.description || ''}`.toLowerCase().includes(q));
  }, [departments, filter]);

  async function openModal(deptId = null) {
    setEditingId(deptId);
    setRenamingId(null);
    setNewPosName('');
    const [{ positions }, { departments: depts }] = await Promise.all([listPositions(), listDepartments()]);
    setAllPositions(positions.map((p) => ({ id: p.id, name: p.name })));
    setDepartments(depts || []);
    if (deptId) {
      const d = depts.find((x) => x.id === deptId);
      setName(d?.name ?? '');
      setDesc(d?.description ?? '');
      setSelectedIds(new Set((d?.positions || []).map((p) => p.positionId)));
    } else {
      setName('');
      setDesc('');
      setSelectedIds(new Set());
    }
    setModalOpen(true);
  }

  function togglePos(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function saveRename(positionId) {
    const trimmed = renameValue.trim();
    if (!trimmed) {
      showToast('Position name is required.', 'error');
      return;
    }
    try {
      const { position } = await updatePosition(positionId, { name: trimmed });
      setAllPositions((prev) =>
        prev
          .map((p) => (p.id === positionId ? { id: position.id, name: position.name } : p))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      setRenamingId(null);
      showToast('Position renamed.', 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Something went wrong.', 'error');
    }
  }

  async function addNewPosition() {
    const trimmed = newPosName.trim();
    if (!trimmed) {
      showToast('Enter a position name to add.', 'error');
      return;
    }
    try {
      const { position } = await createPosition({ name: trimmed });
      setAllPositions((prev) => {
        const next = prev.some((p) => p.id === position.id)
          ? prev.map((p) => (p.id === position.id ? { id: position.id, name: position.name } : p))
          : [...prev, { id: position.id, name: position.name }];
        return next.sort((a, b) => a.name.localeCompare(b.name));
      });
      setSelectedIds((prev) => new Set(prev).add(position.id));
      setNewPosName('');
      showToast(`Position “${position.name}” added and selected.`, 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Something went wrong.', 'error');
    }
  }

  async function saveDept() {
    const trimmed = name.trim();
    if (!trimmed) {
      showToast('Department name is required.', 'error');
      return;
    }
    const data = { name: trimmed, description: desc.trim(), positionIds: [...selectedIds] };
    try {
      if (editingId) {
        await updateDepartment(editingId, data);
        showToast('Department updated.', 'success');
      } else {
        await createDepartment(data);
        showToast('Department added.', 'success');
      }
      setModalOpen(false);
      await load();
      emitAppEvent('employees.refreshFilters');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Something went wrong.', 'error');
    }
  }

  async function handleDelete(deptId) {
    if (!confirm('Delete this department?')) return;
    try {
      await deleteDepartment(deptId);
      await load();
      emitAppEvent('employees.refreshFilters');
      showToast('Department deleted.', 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Something went wrong.', 'error');
    }
  }

  let emptyMsg = null;
  if (!departments.length) emptyMsg = 'No departments yet.';
  else if (!rows.length) emptyMsg = 'No departments match your search.';

  return (
    <>
      <div className="toolbar" style={{ justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        {writable && (
          <button type="button" className="btn btn-primary needs-write" onClick={() => openModal(null)}>
            Add Department
          </button>
        )}
        <input
          type="search"
          className="dept-filter-input"
          placeholder="Search departments…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Department</th>
              <th>Employees</th>
              <th>Positions</th>
              {writable && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((dept, i) => {
              const positions = dept.positions || [];
              const shown = positions.slice(0, CHIP_LIMIT);
              const extra = positions.length - shown.length;
              const count = dept.employeeCount ?? dept.employee_count ?? 0;
              const d = (dept.description || '').trim();
              return (
                <tr key={dept.id}>
                  <td className="dept-row-num">{String(i + 1).padStart(2, '0')}</td>
                  <td>
                    {writable ? (
                      <button type="button" className="dept-name-btn" onClick={() => openModal(dept.id)}>
                        <span className="dept-name">{dept.name}</span>
                        {d ? <span className="dept-desc">{d}</span> : null}
                      </button>
                    ) : (
                      <div>
                        <div className="dept-name">{dept.name}</div>
                        {d ? <div className="dept-desc">{d}</div> : null}
                      </div>
                    )}
                  </td>
                  <td className="dept-count-cell">{count}</td>
                  <td>
                    {!positions.length ? (
                      writable ? (
                        <button type="button" className="dept-link-pos" onClick={() => openModal(dept.id)}>
                          Link positions
                        </button>
                      ) : (
                        <span className="dept-pos-empty">None</span>
                      )
                    ) : (
                      <div className="dept-pos-list">
                        {shown.map((p) => (
                          <span key={p.positionId || p.id} className="dept-pos-chip">
                            {p.name}
                          </span>
                        ))}
                        {extra > 0 && <span className="dept-pos-more">+{extra}</span>}
                      </div>
                    )}
                  </td>
                  {writable && (
                    <td className="dept-actions">
                      <button type="button" className="btn btn-sm btn-edit" onClick={() => openModal(dept.id)}>
                        Edit
                      </button>
                      <button type="button" className="btn btn-sm btn-del" onClick={() => handleDelete(dept.id)}>
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {emptyMsg && (
          <div className="empty" style={{ display: 'block' }}>
            {emptyMsg}
          </div>
        )}
      </div>

      {modalOpen &&
        createPortal(
          <div className="overlay open" onClick={(e) => e.target === e.currentTarget && setModalOpen(false)}>
            <div className="modal" style={{ maxWidth: 520 }}>
              <div className="modal-header">
                <h3>{editingId ? 'Edit Department' : 'Add Department'}</h3>
                <button type="button" className="modal-close" onClick={() => setModalOpen(false)}>
                  ×
                </button>
              </div>
              <div className="fg" style={{ marginBottom: 13 }}>
                <label>Name *</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="fg" style={{ marginBottom: 13 }}>
                <label>Description</label>
                <textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} />
              </div>
              <div className="fg" style={{ marginBottom: 8 }}>
                <label>Positions</label>
                <div id="d-pos-list" style={{ maxHeight: 200, overflow: 'auto' }}>
                  {!allPositions.length && (
                    <div className="dept-pos-empty" style={{ padding: '8px 0' }}>
                      No positions in catalog yet. Add one below.
                    </div>
                  )}
                  {allPositions.map((p) =>
                    renamingId === p.id ? (
                      <div className="dept-pos-row" key={p.id}>
                        <input type="checkbox" checked disabled readOnly />
                        <input
                          type="text"
                          className="dept-pos-rename-input"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                        />
                        <button type="button" className="btn btn-sm btn-primary" onClick={() => saveRename(p.id)}>
                          Save
                        </button>
                        <button type="button" className="btn btn-sm btn-cancel" onClick={() => setRenamingId(null)}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <label className="dept-pos-row" key={p.id}>
                        <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => togglePos(p.id)} />
                        <span className="dept-pos-name">{p.name}</span>
                        {writable && (
                          <button
                            type="button"
                            className="btn btn-sm btn-edit dept-pos-rename-btn"
                            onClick={(e) => {
                              e.preventDefault();
                              setRenamingId(p.id);
                              setRenameValue(p.name);
                            }}
                          >
                            Rename
                          </button>
                        )}
                      </label>
                    ),
                  )}
                </div>
                {writable && (
                  <div className="path-field-row" style={{ marginTop: 8 }}>
                    <input
                      type="text"
                      placeholder="New position name"
                      value={newPosName}
                      onChange={(e) => setNewPosName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addNewPosition())}
                    />
                    <button type="button" className="btn btn-sm btn-edit" onClick={addNewPosition}>
                      Add
                    </button>
                  </div>
                )}
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-cancel" onClick={() => setModalOpen(false)}>
                  Cancel
                </button>
                <button type="button" className="btn btn-primary" onClick={saveDept}>
                  Save
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
