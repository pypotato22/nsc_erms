import { useCallback, useEffect, useState } from 'react';
import {
  listArchivedEmployees,
  restoreEmployee,
  permanentDeleteEmployee,
} from '../../js/api/employees.js';
import { ApiError } from '../../js/api/client.js';
import { getInitials } from '../../js/utils/helpers.js';
import { showToast } from '../../js/utils/toast.js';
import { canWrite } from '../../js/utils/authz.js';
import { renderEmployeeTable } from '../../js/components/employeeTable.js';

const PAGE_SIZE = 25;

function Avatar({ emp, size = 36 }) {
  const src =
    emp.photoUrl ||
    (emp.profilePicturePath ? `/api/v1/employees/${emp.id}/photo` : emp.picture);
  const initials = getInitials(emp.firstName || '', emp.lastName || '');
  const boxStyle = { width: size, height: size, fontSize: size * 0.35, borderRadius: '50%' };
  if (src) {
    return (
      <img
        src={src}
        alt=""
        style={{ ...boxStyle, objectFit: 'cover', flexShrink: 0 }}
        onError={(e) => {
          e.currentTarget.replaceWith(
            Object.assign(document.createElement('div'), {
              className: 'avatar',
              textContent: initials,
              style: `width:${size}px;height:${size}px;font-size:${size * 0.35}px;border-radius:50%;`,
            }),
          );
        }}
      />
    );
  }
  return (
    <div className="avatar" style={boxStyle}>
      {initials}
    </div>
  );
}

export function ArchivedEmployeesPage({ getSearchQuery = () => '' }) {
  const [page, setPage] = useState(1);
  const [employees, setEmployees] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const writable = canWrite();

  const load = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const data = await listArchivedEmployees({ page: p, limit: PAGE_SIZE });
      setEmployees(data.employees || []);
      setPage(data.page || 1);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
      const badge = document.getElementById('archived-employees-badge');
      if (badge) badge.textContent = String(data.total ?? (data.employees?.length || 0));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to load.', 'error');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    load(page);
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="toolbar" style={{ justifyContent: 'space-between' }}>
        <p style={{ margin: 0, fontSize: '0.9286rem', color: 'var(--text-2)' }}>
          Soft-deleted employees. Restore returns them as Inactive.
        </p>
        <button type="button" className="btn btn-sm btn-edit" onClick={() => { setPage(1); load(1); }}>
          Refresh
        </button>
      </div>
      <div className="card" style={{ padding: '8px 14px' }}>
        <div className="bk-list">
          {loading && <div className="empty">Loading archived employees…</div>}
          {!loading && !employees.length && (
            <div className="empty" style={{ padding: '28px 0', textAlign: 'center' }}>
              <p style={{ fontWeight: 600 }}>No archived employees</p>
            </div>
          )}
          {employees.map((emp) => {
            const when = emp.deletedAt ? new Date(emp.deletedAt).toLocaleString('en-PH') : '—';
            const docs = Number(emp.documentCount) || 0;
            return (
              <div className="bk-item" style={{ alignItems: 'flex-start' }} key={emp.id}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flex: 1, minWidth: 0 }}>
                  <Avatar emp={emp} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="bk-name">
                      {emp.lastName}, {emp.firstName}
                      {emp.employeeNo && (
                        <span style={{ fontSize: '0.7143rem', background: 'var(--bg-subtle)', color: 'var(--blue-700)', padding: '1px 7px', borderRadius: 99, fontWeight: 700, marginLeft: 5 }}>
                          {emp.employeeNo}
                        </span>
                      )}
                    </div>
                    <div className="bk-meta">
                      {emp.email || '—'} · {docs} document(s) · archived {when}
                    </div>
                  </div>
                </div>
                <div className="bk-acts">
                  {writable ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-sm btn-edit"
                        onClick={async () => {
                          try {
                            await restoreEmployee(emp.id);
                            showToast('Employee restored as Inactive.', 'success');
                            await load(page);
                            renderEmployeeTable(getSearchQuery()).catch(() => {});
                          } catch (err) {
                            showToast(err instanceof ApiError ? err.message : 'Restore failed.', 'error');
                          }
                        }}
                      >
                        Restore
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-del"
                        onClick={async () => {
                          if (!confirm('Permanently delete this employee and their files?')) return;
                          try {
                            await permanentDeleteEmployee(emp.id);
                            showToast('Employee permanently deleted.', 'success');
                            await load(page);
                          } catch (err) {
                            showToast(err instanceof ApiError ? err.message : 'Delete failed.', 'error');
                          }
                        }}
                      >
                        Delete forever
                      </button>
                    </>
                  ) : (
                    <span style={{ fontSize: '0.7857rem', color: 'var(--text-3)' }}>View only</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="pager" style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
          <button type="button" className="btn btn-sm" disabled={!total || page <= 1} onClick={() => setPage((p) => p - 1)}>
            Prev
          </button>
          <span style={{ fontSize: '0.8571rem', color: 'var(--text-3)' }}>
            {total === 0 ? 'No archived employees' : `Page ${page} of ${totalPages} · ${total} employee(s)`}
          </span>
          <button type="button" className="btn btn-sm" disabled={!total || page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      </div>
    </>
  );
}
