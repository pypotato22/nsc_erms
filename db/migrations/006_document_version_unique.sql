-- Ensure document versions are unique per employee + type (including soft-deleted).
-- Prevents colliding version_number after soft-delete or concurrent uploads.

CREATE UNIQUE INDEX IF NOT EXISTS uq_documents_employee_type_version
  ON documents (employee_id, document_type_id, version_number);
