-- Full CS Form 212 (Revised 2025) Personal Data Sheet payload per employee.
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS pds JSONB NOT NULL DEFAULT '{}'::jsonb;
