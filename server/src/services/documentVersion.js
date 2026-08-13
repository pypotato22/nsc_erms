import { query } from '../db/pool.js';

/**
 * Next version number for an employee + document type.
 * Includes soft-deleted rows so versions never reuse a number.
 */
export async function nextDocumentVersion(employeeId, documentTypeId) {
  const { rows } = await query(
    `SELECT COALESCE(MAX(version_number), 0)::int AS max_version
     FROM documents
     WHERE employee_id = $1 AND document_type_id = $2`,
    [employeeId, documentTypeId],
  );
  return (rows[0]?.max_version ?? 0) + 1;
}

/**
 * Latest non-deleted document id for replaces_id linkage (may be null).
 */
export async function latestActiveDocumentId(employeeId, documentTypeId) {
  const { rows } = await query(
    `SELECT id
     FROM documents
     WHERE employee_id = $1
       AND document_type_id = $2
       AND deleted_at IS NULL
     ORDER BY version_number DESC
     LIMIT 1`,
    [employeeId, documentTypeId],
  );
  return rows[0]?.id ?? null;
}

export function isUniqueViolation(err) {
  return err && (err.code === '23505' || err.constraint);
}
