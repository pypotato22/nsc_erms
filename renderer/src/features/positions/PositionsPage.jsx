import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  listPositions,
  createPosition,
  updatePosition,
  deletePosition,
} from '../../js/api/positions.js';
import { ApiError } from '../../js/api/client.js';
import { showToast } from '../../js/utils/toast.js';
import { canWrite } from '../../js/utils/authz.js';

export function PositionsPage() {
  const [positions, setPositions] = useState([]);
  const [filter, setFilter] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const writable = canWrite();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { positions: rows } = await listPositions();
      setPositions(rows || []);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Something went wrong.', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return positions;
    return positions.filter((p) => String(p.name || '').toLowerCase().includes(q));
  }, [positions, filter]);

  function openModal(id) {
    const p = id ? positions.find((x) => x.id === id) : null;
    setEditingId(id);
    setName(p?.name || '');
    setModalOpen(true);
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      showToast('Position name is required.', 'error');
      return;
    }
    try {
      if (editingId) {
        await updatePosition(editingId, { name: trimmed });
        showToast('Position renamed.', 'success');
      } else {
        await createPosition({ name: trimmed });
        showToast('Position added.', 'success');
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Something went wrong.', 'error');
    }
  }

  async function remove(id) {
    const p = positions.find((x) => x.id === id);
    if (
      !confirm(
        `Remove “${p?.name || 'this position'}” from the catalog?\n\nIt will also unlink from departments. Blocked if employees still hold it.`,
      )
    ) {
      return;
    }
    try {
      await deletePosition(id);
      showToast('Position removed.', 'success');
      await load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Something went wrong.', 'error');
    }
  }

  let emptyMsg = null;
  if (!loading && !positions.length) {
    emptyMsg = 'No positions in the catalog yet. Add one to use when linking departments.';
  } else if (!loading && !rows.length) {
    emptyMsg = 'No positions match your search.';
  }

  return (
    <>
      <div className="toolbar" style={{ justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        {writable && (
          <button type="button" className="btn btn-primary needs-write" onClick={() => openModal(null)}>
            Add Position
          </button>
        )}
        <input
          type="search"
          className="dept-filter-input"
          placeholder="Search positions…"
          autoComplete="off"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <p style={{ fontSize: '0.8571rem', color: 'var(--text-3)', margin: '-4px 0 14px' }}>
        Shared catalog of job titles. Link them to departments from the Departments page.
      </p>
      <div className="card">
        <table id="pos-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Position</th>
              <th>Employees</th>
              <th>Departments</th>
              {writable && <th className="needs-write">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => (
              <tr key={p.id}>
                <td className="dept-row-num">{String(i + 1).padStart(2, '0')}</td>
                <td>
                  {writable ? (
                    <button type="button" className="dept-name-btn" onClick={() => openModal(p.id)}>
                      <span className="dept-name">{p.name}</span>
                    </button>
                  ) : (
                    <div className="dept-name">{p.name}</div>
                  )}
                </td>
                <td className="dept-count-cell">{p.employeeCount ?? 0}</td>
                <td className="dept-count-cell">{p.departmentCount ?? 0}</td>
                {writable && (
                  <td className="dept-actions">
                    <button type="button" className="btn btn-sm btn-edit" onClick={() => openModal(p.id)}>
                      Rename
                    </button>
                    <button type="button" className="btn btn-sm btn-del" onClick={() => remove(p.id)}>
                      Remove
                    </button>
                  </td>
                )}
              </tr>
            ))}
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
            <div className="modal" style={{ maxWidth: 420 }}>
              <div className="modal-header">
                <h3>{editingId ? 'Rename Position' : 'Add Position'}</h3>
                <button type="button" className="modal-close" onClick={() => setModalOpen(false)} aria-label="Close">
                  ×
                </button>
              </div>
              <div className="fg" style={{ marginBottom: 13 }}>
                <label htmlFor="p-name">Name *</label>
                <input
                  id="p-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && save()}
                  autoFocus
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-cancel" onClick={() => setModalOpen(false)}>
                  Cancel
                </button>
                <button type="button" className="btn btn-primary" onClick={save}>
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
