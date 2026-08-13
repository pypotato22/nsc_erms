import { useCallback, useEffect, useRef, useState } from 'react';
import {
  deleteEmployee,
  restoreEmployee,
  listEmployeeAssignments,
} from '../../js/api/employees.js';
import { ApiError } from '../../js/api/client.js';
import { getInitials, getYearsOfService } from '../../js/utils/helpers.js';
import { showToast } from '../../js/utils/toast.js';
import { canWrite } from '../../js/utils/authz.js';
import { emitAppEvent } from '../../shared/lib/appEvents.js';
import { openPdsViewer, downloadOfficialPdsExcel } from '../../js/components/pdsViewer.js';
import { renderTabDocs } from '../../js/components/documents.js';

const TABS = [
  { id: 'info', label: 'Personal Info' },
  { id: 'employment', label: 'Employment' },
  { id: 'docs', label: 'Documents' },
];

const STATUS_CLASS = { Active: 'active', Inactive: 'inactive', 'On Leave': 'leave' };

function StatusBadge({ status }) {
  const label = status || '—';
  return <span className={`badge ${STATUS_CLASS[label] ?? 'inactive'}`}>{label}</span>;
}

function InfoRow({ label, children, mono = false }) {
  return (
    <div className="info-row">
      <span className="ir-label">{label}</span>
      <span className="ir-val" style={mono ? { fontFamily: "'DM Mono', monospace" } : undefined}>
        {children}
      </span>
    </div>
  );
}

function formatDisplayName(emp) {
  return [emp.firstName, emp.middleName, emp.lastName, emp.nameExtension]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function shortDate(value) {
  return value ? String(value).slice(0, 10) : '—';
}

function PanelHeader({ emp, onClose, onArchive }) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const a = emp.assignment;
  const initials = getInitials(emp.firstName, emp.lastName);
  const photoSrc =
    emp.photoUrl || (emp.profilePicturePath ? `/api/v1/employees/${emp.id}/photo` : '');
  const writable = canWrite();

  useEffect(() => {
    setPhotoFailed(false);
  }, [photoSrc]);

  return (
    <div className="panel-hdr" id="panel-header">
      <button className="ph-close" id="panel-close-btn" type="button" onClick={onClose}>
        ×
      </button>
      {photoSrc && !photoFailed ? (
        <img
          src={photoSrc}
          className="ph-avatar-lg"
          alt=""
          onError={() => setPhotoFailed(true)}
        />
      ) : (
        <div className="ph-ini-lg">{initials}</div>
      )}
      <h2>{formatDisplayName(emp) || `${emp.firstName ?? ''} ${emp.lastName ?? ''}`.trim()}</h2>
      <div className="ph-pos">
        {a?.positionName || 'No position'} &middot; {a?.departmentName || 'No Department'}
      </div>
      <div className="ph-badges">
        <span className="ph-badge">{a?.employmentStatusName || '—'}</span>
        <span className="ph-badge">{emp.employeeNo || '—'}</span>
        {a?.startDate ? <span className="ph-badge">Since {shortDate(a.startDate)}</span> : null}
      </div>
      <div className="ph-actions">
        <button
          className="phbtn phbtn-view"
          id="panel-view-pds-btn"
          type="button"
          onClick={() => openPdsViewer(emp)}
        >
          View PDS
        </button>
        <button
          className="phbtn phbtn-view"
          id="panel-download-pds-btn"
          type="button"
          onClick={() => downloadOfficialPdsExcel(emp.id)}
        >
          Download Excel
        </button>
        {writable ? (
          <>
            <button
              className="phbtn phbtn-edit"
              id="panel-edit-btn"
              type="button"
              onClick={async () => {
                const { openEmployeeModal } = await import('../../js/components/employeeModal.js');
                openEmployeeModal(emp.id);
                onClose();
              }}
            >
              Edit
            </button>
            <button
              className="phbtn phbtn-del"
              id="panel-delete-btn"
              type="button"
              onClick={() => onArchive(emp.id)}
            >
              Archive
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

function PdsSummary({ emp }) {
  const p = emp.pds?.personal;
  if (!p) {
    return (
      <p className="pds-profile-note">
        Full Personal Data Sheet (CS Form 212) — use <strong>View PDS</strong> or{' '}
        <strong>Edit</strong>.
      </p>
    );
  }
  const bits = [];
  if (p.civilStatus) bits.push(`Civil status: ${p.civilStatus}`);
  if (p.birthDate) bits.push(`Born: ${p.birthDate}`);
  if (p.citizenship) bits.push(`Citizenship: ${p.citizenship}`);
  bits.push(
    `Education rows: ${emp.pds?.education?.filter((r) => r.schoolName || r.level)?.length || 0}`,
  );
  bits.push(`Work entries: ${emp.pds?.workExperience?.length || 0}`);
  bits.push(`Eligibilities: ${emp.pds?.eligibility?.length || 0}`);

  return (
    <div className="info-section" style={{ marginTop: 16 }}>
      <h4>Personal Data Sheet</h4>
      <InfoRow label="Form">CS Form No. 212 (Rev. 2025)</InfoRow>
      {bits.map((b) => (
        <InfoRow key={b} label="Detail">
          {b}
        </InfoRow>
      ))}
      <p className="pds-profile-note">
        Use <strong>View PDS</strong> for an on-screen preview, <strong>Download Excel</strong> for
        the official CS Form 212 file, or <strong>Edit</strong> to update sections.
      </p>
    </div>
  );
}

function TabInfo({ emp }) {
  const sexLabel = emp.sex ? emp.sex.charAt(0).toUpperCase() + emp.sex.slice(1) : '—';
  return (
    <>
      <div className="info-section">
        <h4>Personal Information</h4>
        <InfoRow label="Full Name">{formatDisplayName(emp)}</InfoRow>
        <InfoRow label="Sex">{sexLabel}</InfoRow>
        <InfoRow label="Date of Birth">
          {emp.birthDate || emp.pds?.personal?.birthDate || '—'}
        </InfoRow>
        <InfoRow label="Email">{emp.email || '—'}</InfoRow>
        <InfoRow label="Contact">{emp.contactNumber || '—'}</InfoRow>
        <InfoRow label="Address">{emp.address || '—'}</InfoRow>
      </div>
      <PdsSummary emp={emp} />
    </>
  );
}

function TabEmployment({ emp }) {
  const [assignments, setAssignments] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setAssignments(null);
    setError('');
    listEmployeeAssignments(emp.id)
      .then(({ assignments: rows }) => {
        if (!cancelled) setAssignments(rows || []);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Failed to load assignments');
      });
    return () => {
      cancelled = true;
    };
  }, [emp.id]);

  if (error) {
    return (
      <div className="empty" style={{ padding: '20px 0', color: 'var(--error)' }}>
        {error}
      </div>
    );
  }
  if (assignments === null) {
    return (
      <div className="empty" style={{ padding: '20px 0' }}>
        Loading assignment history…
      </div>
    );
  }

  const a = emp.assignment;
  const showHistory = assignments.length > 1 || assignments.some((row) => row.endDate);

  return (
    <>
      <div className="info-section">
        <h4>Current employment</h4>
        <InfoRow label="Employee No" mono>
          {emp.employeeNo || '—'}
        </InfoRow>
        <InfoRow label="Position">{a?.positionName || '—'}</InfoRow>
        <InfoRow label="Department">{a?.departmentName || '—'}</InfoRow>
        <InfoRow label="Employment type">{a?.employmentTypeName || '—'}</InfoRow>
        <InfoRow label="Status">
          <StatusBadge status={a?.employmentStatusName} />
        </InfoRow>
        <InfoRow label="Start Date">{shortDate(a?.startDate)}</InfoRow>
        <InfoRow label="Years of Service">{getYearsOfService(a?.startDate)}</InfoRow>
      </div>
      {showHistory ? (
        <div className="info-section" style={{ marginTop: 18 }}>
          <h4>Assignment history</h4>
          <div className="assign-history">
            {assignments.map((row, i) => (
              <div className="assign-history-row" key={row.id ?? i}>
                <div className="assign-history-main">
                  <strong>{row.positionName || '—'}</strong>
                  <span style={{ color: 'var(--text-2)' }}> · {row.departmentName || '—'}</span>
                  {row.isPrimary && row.isActive ? (
                    <div style={{ marginTop: 4 }}>
                      <span className="ph-badge">Primary</span>
                    </div>
                  ) : null}
                  {!row.isActive ? (
                    <div style={{ marginTop: 4 }}>
                      <span className="ph-badge" style={{ opacity: 0.7 }}>
                        Ended
                      </span>
                    </div>
                  ) : null}
                </div>
                <div className="assign-history-meta">
                  {shortDate(row.startDate)} →{' '}
                  {row.endDate ? shortDate(row.endDate) : row.isActive ? 'Present' : '—'} ·{' '}
                  {row.employmentStatusName || '—'}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

/**
 * Profile side panel. The bridge (`js/components/profilePanel.js`) owns the
 * `.open` class on `#panel` / `#panel-backdrop`; this component only renders
 * the contents.
 *
 * `#tab-docs` is deliberately left empty so the documents bridge can mount its
 * own island into it.
 */
export function ProfilePanel({
  employee,
  syncKey = 0,
  onClose = () => {},
  getSearchQuery = () => '',
}) {
  const [tab, setTab] = useState('info');
  const empId = employee?.id ?? null;
  const empRef = useRef(employee);
  empRef.current = employee;

  useEffect(() => {
    setTab('info');
  }, [empId]);

  useEffect(() => {
    if (tab !== 'docs' || !empRef.current) return;
    renderTabDocs(empRef.current);
  }, [tab, empId, syncKey]);

  const handleArchive = useCallback(
    async (id) => {
      if (!confirm('Move this employee to Archived Employees?')) return;
      try {
        await deleteEmployee(id);
        onClose();
        emitAppEvent('employees.refresh', { q: getSearchQuery() });
        emitAppEvent('archived.refresh');
        showToast('Moved to Archived Employees.', 'info', {
          actionLabel: 'Undo',
          duration: 8000,
          onAction: async () => {
            try {
              await restoreEmployee(id);
              showToast('Employee restored as Inactive.', 'success');
              emitAppEvent('employees.refresh', { q: getSearchQuery() });
              emitAppEvent('archived.refresh');
            } catch (err) {
              showToast(err instanceof ApiError ? err.message : 'Restore failed.', 'error');
            }
          },
        });
      } catch (err) {
        showToast(err instanceof ApiError ? err.message : 'Archive failed.', 'error');
      }
    },
    [onClose, getSearchQuery],
  );

  if (!employee) return null;

  return (
    <>
      <PanelHeader emp={employee} onClose={onClose} onArchive={handleArchive} />
      <div className="panel-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            data-tab={t.id}
            className={`tab-btn${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="panel-body">
        <div id="tab-info" className={`tab-pane${tab === 'info' ? ' active' : ''}`}>
          {tab === 'info' ? <TabInfo emp={employee} /> : null}
        </div>
        <div id="tab-employment" className={`tab-pane${tab === 'employment' ? ' active' : ''}`}>
          {tab === 'employment' ? <TabEmployment emp={employee} /> : null}
        </div>
        <div id="tab-docs" className={`tab-pane${tab === 'docs' ? ' active' : ''}`} />
      </div>
    </>
  );
}
