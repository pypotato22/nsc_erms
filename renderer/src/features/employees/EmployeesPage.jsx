import { useCallback, useEffect, useRef, useState } from 'react';
import { listEmployees } from '../../js/api/employees.js';
import { listDepartments, listEmploymentStatuses } from '../../js/api/departments.js';
import { ApiError } from '../../js/api/client.js';
import { getInitials } from '../../js/utils/helpers.js';
import { showToast } from '../../js/utils/toast.js';
import { canWrite } from '../../js/utils/authz.js';
import { onAppEvent } from '../../shared/lib/appEvents.js';

const PAGE_SIZE = 12;
const SORT_COLS = [
  { key: 'name', label: 'Employee' },
  { key: 'contact', label: 'Contact' },
  { key: 'position', label: 'Position' },
  { key: 'department', label: 'Department' },
  { key: 'status', label: 'Status' },
  { key: 'startDate', label: 'Start date' },
];

function statusBadgeClass(status) {
  if (status === 'Active') return 'active';
  if (status === 'On Leave') return 'leave';
  return 'inactive';
}

function EmployeeAvatar({ emp, size = 34, fontSize = 12 }) {
  const first = emp.firstName ?? '';
  const last = emp.lastName ?? '';
  const initials = getInitials(first, last);
  const src =
    emp.photoUrl ||
    (emp.profilePicturePath ? `/api/v1/employees/${emp.id}/photo` : emp.picture);
  const boxStyle = {
    width: size,
    height: size,
    fontSize: `${fontSize / 14}rem`,
  };
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return (
      <div className="avatar" style={boxStyle}>
        {initials}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        objectFit: 'cover',
        flexShrink: 0,
      }}
      onError={() => setBroken(true)}
    />
  );
}

/**
 * @param {{
 *   initialQuery?: string,
 *   onSearchSync?: (q: string) => void,
 * }} props
 */
export function EmployeesPage({ initialQuery = '', onSearchSync }) {
  const [query, setQuery] = useState(initialQuery);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('name');
  const [dir, setDir] = useState('asc');
  const [employees, setEmployees] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [deptId, setDeptId] = useState('');
  const [statusId, setStatusId] = useState('');
  const [departments, setDepartments] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const queryRef = useRef(query);
  const pageRef = useRef(page);
  const debounceRef = useRef(null);
  const writable = canWrite();

  queryRef.current = query;
  pageRef.current = page;

  const loadFilters = useCallback(async () => {
    try {
      const [{ departments: depts }, { employmentStatuses }] = await Promise.all([
        listDepartments(),
        listEmploymentStatuses(),
      ]);
      setDepartments(depts || []);
      setStatuses(employmentStatuses || []);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to load filters.', 'error');
    }
  }, []);

  const load = useCallback(
    async (opts = {}) => {
      const q = opts.q !== undefined ? opts.q : queryRef.current;
      const p = opts.page !== undefined ? opts.page : pageRef.current;
      const s = opts.sort !== undefined ? opts.sort : sort;
      const d = opts.dir !== undefined ? opts.dir : dir;
      const departmentId = opts.departmentId !== undefined ? opts.departmentId : deptId;
      const status = opts.statusId !== undefined ? opts.statusId : statusId;
      setLoading(true);
      try {
        const data = await listEmployees({
          q,
          departmentId,
          statusId: status,
          page: p,
          limit: PAGE_SIZE,
          sort: s,
          dir: d,
        });
        setEmployees(data.employees || []);
        setPage(data.page || 1);
        setTotal(data.total ?? 0);
        setTotalPages(data.totalPages || 1);
        if (data.sort) setSort(data.sort);
        if (data.dir) setDir(data.dir);
        const badge = document.getElementById('emp-count-badge');
        if (badge) badge.textContent = String(data.total ?? (data.employees?.length || 0));
      } catch (err) {
        showToast(err instanceof ApiError ? err.message : 'Failed to load employees.', 'error');
      } finally {
        setLoading(false);
      }
    },
    [sort, dir, deptId, statusId],
  );

  useEffect(() => {
    loadFilters();
  }, [loadFilters]);

  useEffect(() => {
    load();
  }, [page, sort, dir, deptId, statusId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const offs = [
      onAppEvent('employees.refresh', (payload) => {
        const q = payload?.q !== undefined ? payload.q : queryRef.current;
        if (q !== queryRef.current) {
          setQuery(q);
          queryRef.current = q;
          onSearchSync?.(q);
        }
        setPage(1);
        load({ q, page: 1 });
      }),
      onAppEvent('employees.refreshFilters', () => {
        loadFilters();
      }),
      onAppEvent('employees.clearSearch', () => {
        if (!queryRef.current && pageRef.current === 1) return;
        setQuery('');
        queryRef.current = '';
        onSearchSync?.('');
        setPage(1);
        load({ q: '', page: 1 });
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [load, loadFilters, onSearchSync]);

  function onSearchInput(value) {
    setQuery(value);
    onSearchSync?.(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      load({ q: value, page: 1 });
    }, 250);
  }

  function activateSort(key) {
    if (sort === key) {
      setDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(key);
      setDir('asc');
    }
    setPage(1);
  }

  const startNum = (page - 1) * PAGE_SIZE;

  return (
    <>
      <div className="toolbar" style={{ justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div className="toolbar-actions">
          {writable && (
            <button
              type="button"
              id="add-emp-btn"
              className="btn btn-primary needs-write"
              onClick={async () => {
                const { openEmployeeModal } = await import('../../js/components/employeeModal.js');
                openEmployeeModal(null);
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add Employee
            </button>
          )}
          <select
            id="filter-dept"
            value={deptId}
            onChange={(e) => {
              setDeptId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <select
            id="filter-status"
            value={statusId}
            onChange={(e) => {
              setStatusId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Status</option>
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <input
          type="search"
          id="search-input"
          className="dept-filter-input"
          placeholder="Search employees…"
          autoComplete="off"
          value={query}
          onChange={(e) => onSearchInput(e.target.value)}
        />
      </div>
      <div className="card">
        <table id="emp-table">
          <thead>
            <tr>
              <th>#</th>
              {SORT_COLS.map((col) => {
                const active = sort === col.key;
                return (
                  <th
                    key={col.key}
                    className={`th-sort${active ? ' is-sorted' : ''}`}
                    data-sort={col.key}
                    role="columnheader"
                    aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    tabIndex={0}
                    onClick={() => activateSort(col.key)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        activateSort(col.key);
                      }
                    }}
                  >
                    {col.label}{' '}
                    <span className="sort-marker" aria-hidden="true">
                      {active ? (dir === 'asc' ? '▲' : '▼') : ''}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody id="emp-tbody">
            {employees.map((emp, i) => {
              const status = emp.assignment?.employmentStatusName || '—';
              const startDate = emp.assignment?.startDate
                ? String(emp.assignment.startDate).slice(0, 10)
                : '—';
              const rowNumber = startNum + i + 1;
              return (
                <tr
                  key={emp.id}
                  className="emp-row"
                  tabIndex={0}
                  role="button"
                  aria-label={`Open profile for ${emp.firstName} ${emp.lastName}`}
                  onClick={async () => {
                    const { openProfilePanel } = await import('../../js/components/profilePanel.js');
                    openProfilePanel(emp.id);
                  }}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      const { openProfilePanel } = await import('../../js/components/profilePanel.js');
                      openProfilePanel(emp.id);
                    }
                  }}
                >
                  <td
                    style={{
                      color: 'var(--text-3)',
                      fontSize: '0.8571rem',
                      fontFamily: "'DM Mono',monospace",
                    }}
                  >
                    {String(rowNumber).padStart(2, '0')}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <EmployeeAvatar emp={emp} />
                      <div>
                        <div
                          style={{
                            fontWeight: 700,
                            color: 'var(--blue-900)',
                            letterSpacing: '-.2px',
                          }}
                        >
                          {emp.firstName} {emp.lastName}
                        </div>
                        <div style={{ fontSize: '0.7857rem', color: 'var(--text-3)' }}>
                          {emp.email || '—'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ color: 'var(--text-2)', fontSize: '0.8929rem' }}>
                    {emp.contactNumber || '—'}
                  </td>
                  <td style={{ fontWeight: 500 }}>{emp.assignment?.positionName || '—'}</td>
                  <td style={{ color: 'var(--text-2)' }}>{emp.assignment?.departmentName || '—'}</td>
                  <td>
                    <span className={`badge ${statusBadgeClass(status)}`}>{status}</span>
                  </td>
                  <td
                    style={{
                      color: 'var(--text-2)',
                      fontSize: '0.8929rem',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {startDate}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!loading && employees.length === 0 && (
          <div id="emp-empty" className="empty">
            No employees found.
          </div>
        )}
        {loading && employees.length === 0 && <div className="empty">Loading employees…</div>}
        <div className="pager" id="emp-pager">
          <button
            type="button"
            className="btn btn-sm btn-edit"
            id="emp-prev"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </button>
          <span className="pager-info" id="emp-page-info">
            {total === 0 ? 'No results' : `Page ${page} of ${totalPages} · ${total} employee(s)`}
          </span>
          <button
            type="button"
            className="btn btn-sm btn-edit"
            id="emp-next"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </>
  );
}
