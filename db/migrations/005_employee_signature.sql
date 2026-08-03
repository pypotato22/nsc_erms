-- Digital signature image path for PDS C4 "Sign inside the box" embed.
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS signature_path TEXT;
