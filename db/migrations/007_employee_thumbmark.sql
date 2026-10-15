-- Right-thumb image path for PDS C4 "Right Thumbmark" embed.
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS thumbmark_path TEXT;
