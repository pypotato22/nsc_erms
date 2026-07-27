/**
 * Seeds lookup catalogs + superadmin.
 * Safe to re-run: uses ON CONFLICT DO NOTHING / upsert by natural keys.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { ulid } from 'ulid';
import pg from 'pg';
import { getPgConfig } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../..');
dotenv.config({ path: path.join(root, '.env') });

// Stable IDs from NSC-ERMS-Electron mock-database.js (preserve for future data import)
const IDS = {
  positions: {
    dean: '01KWPCZW1CBKVYRSXA1Z6CH6HF',
    deptHead: '01KWPE88TNDREESSDY24JRN7PR',
    professor: '01KWPEBFXDXXGDWHCH55K4N92N',
    instructor: '01KWPERHSJS03B6AGZHJQV7Z4S',
    registrar: '01KWPESR2K1969V35VSRV6WRWC',
    librarian: '01KWPFHZEHQX25KA45TNMHK8MG',
    accountant: '01KWPFJ2CDNCAZD7JZSQG6WMDM',
    cashier: '01KWPFJ5A94BNNMF26SMK9RZC2',
    utility: '01KWPFJ885ZR24K7YZDW0TRZ8J',
    guard: '01KWPFJB60W2MNYXZ5CMMFK8JQ',
  },
  departments: {
    education: '01KWPFTJXSD6Y5XJNMRV4Z21B0',
    it: '01KWPFTNVNTJE337H0SBA3M5JA',
    hospitality: '01KWPFTRSG8V7HR95HHW2QTR5P',
    business: '01KWPFTVQ9P6ZYTTSPPFE55527',
    registrar: '01KWPFTYN5ZH6W15XE2JKN767Z',
    library: '01KWPFV1K087XAQWQ49FKVXHC4',
    finance: '01KWPFV4GWYVZJGHRANQCNS80R',
    maintenance: '01KWPFV7ER9G109B7P53J8HPY2',
    security: '01KWPFVACGX3SM6WCYF6AR9QFP',
  },
  employmentTypes: {
    fullTime: '01KWQENCKVR61KRFDYZVZN2QWK',
    partTime: '01KWQENDK8P8FK9NNHTGKDQG75',
    contractual: '01KWQENEJH2J2EM3KWZ8TQG0MW',
    probationary: '01KWQENFHVJ0NB9WWH49RJ2QD4',
    temporary: '01KWQEW91SKWHSWYTNMCJ6P39E',
    jobOrder: '01KWQENGH5ZGJNP66XC36AEG2Z',
    casual: '01KWQENHGE1J6H7X33BW5ZQ7BN',
  },
  employmentStatuses: {
    active: '01KWQDF3Z4XWRRQ1A3JZ0Z26QX',
    inactive: '01KWQDFG5NS4FW5TZNV0ZTY1GW',
    onLeave: '01KWQDFSTCQTA7RVEP83ZTMX5B',
  },
  documentTypes: {
    pds: '01KWR274DNYJ1D43YXWR0FV42T',
    resume: '01KWQPZF750QECT35PN61QJEPC',
    diploma: '01KWQPZG6HGSW7GR642VCFYRQ6',
    tor: '01KWQPZH5T74PNBWF8A2XNWNV6',
    prc: '01KWQPZJ55JV62H3FKA7WKTP3W',
    coe: '01KWQPZK4EAN688YB6G4PEPB14',
    birth: '01KWQPZM3RQF5DVA9T6Y0ND6JS',
    marriage: '01KWQPZN31TAPQ15XJ3W9G8BDW',
    nbi: '01KWQPZP2AKG69C63B44X5DHDY',
    police: '01KWQPZQ1M51TQWX0DFYT3JC22',
    medical: '01KWQPZR0Y6BSY9GX1Z6CP36SH',
    service: '01KWQPZS07DZ833V9TDAWTYYY7',
    contract: '01KWQPZSZHMYVFTZ4PC0PRMJ8X',
  },
  roles: {
    superadmin: '01KWR3DSXRSRSNKE6DG0CG9Q5B',
    admin: '01KWR3EADMIN00000000000001',
    staff: '01KWR3ESTAFF00000000000001',
    viewer: '01KWR3EVIEWER0000000000001',
  },
};

// Preserve mock junction IDs where they exist
const DEPT_POS_ROWS = [
  // Education
  ['01KWVC5F4TNBFZ1RQN07Y4T2BD', IDS.departments.education, IDS.positions.dean],
  ['01KWVC6Y42NH410H05JZFVV7KS', IDS.departments.education, IDS.positions.deptHead],
  ['01KWVC82FEYJHZ4CPP2V1Q882W', IDS.departments.education, IDS.positions.professor],
  ['01KWVC9612ASN9W9B0B4RA2YCY', IDS.departments.education, IDS.positions.instructor],
  // IT
  ['01KWVCAJQYFFKD4MH7GK03XJXC', IDS.departments.it, IDS.positions.dean],
  ['01KWVCAXN4N804QHDMZEKT7615', IDS.departments.it, IDS.positions.deptHead],
  ['01KWVCBYHD6A1FJ3MK2J6WC9VM', IDS.departments.it, IDS.positions.professor],
  ['01KWVCCAH0138D1CGPK4VW5F6S', IDS.departments.it, IDS.positions.instructor],
  // Hospitality
  ['01KWVCCTN83EX549DNX87XTAVF', IDS.departments.hospitality, IDS.positions.dean],
  ['01KWVCD4ZQFHK6P7K6EW2AMP38', IDS.departments.hospitality, IDS.positions.deptHead],
  ['01KWVCDJ6TW05PFBWHH318G512', IDS.departments.hospitality, IDS.positions.professor],
  ['01KWVCDYJDGHSBXKW83K7ZTGSP', IDS.departments.hospitality, IDS.positions.instructor],
  // Business
  ['01KWVCEF47DEDWSTAGF48V24JR', IDS.departments.business, IDS.positions.dean],
  ['01KWVCF0MQMGS9BCZNP9H4RRAJ', IDS.departments.business, IDS.positions.deptHead],
  ['01KWVCFB3BB3KC2YY3QBMS7EK1', IDS.departments.business, IDS.positions.professor],
  ['01KWVCFPPGWZPYFX30QMPJ1YRQ', IDS.departments.business, IDS.positions.instructor],
  // Support
  ['01KWVCG4DM3M0WB5YKAK5C1DFC', IDS.departments.registrar, IDS.positions.registrar],
  ['01KWVCGF3HSAC878R0GYVWSX03', IDS.departments.library, IDS.positions.librarian],
  ['01KWVCKVXNHASF755CC61PRW4S', IDS.departments.finance, IDS.positions.accountant],
  ['01KWVCGZ59TBW9K6S0CAEK19J5', IDS.departments.finance, IDS.positions.cashier],
  ['01KWVCHB349C1JHP6KXB6DXXBF', IDS.departments.maintenance, IDS.positions.utility],
  ['01KWVCHPEGFZWKSTE0VSFS2KZY', IDS.departments.security, IDS.positions.guard],
];

async function upsertLookup(client, table, id, extraCols, extraVals) {
  const cols = ['id', ...extraCols];
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  await client.query(
    `INSERT INTO ${table} (${cols.join(', ')})
     VALUES (${placeholders})
     ON CONFLICT (id) DO NOTHING`,
    [id, ...extraVals],
  );
}

function ensureDirs(filesRoot, scanInbox) {
  const inbox = scanInbox || path.join(filesRoot, 'inbox');
  for (const dir of [
    filesRoot,
    path.join(filesRoot, 'employees'),
    inbox,
    path.join(inbox, 'processed'),
    path.join(inbox, 'failed'),
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return inbox;
}

async function seed() {
  const username = process.env.SEED_SUPERADMIN_USERNAME || 'superadmin';
  const password = process.env.SEED_SUPERADMIN_PASSWORD || 'ChangeMeNow!';
  const displayName = process.env.SEED_SUPERADMIN_DISPLAY_NAME || 'System Superadmin';
  const filesRoot = process.env.FILES_ROOT || path.join(root, 'storage');
  const maxUpload = Number(process.env.MAX_UPLOAD_BYTES || 31457280);

  const client = new pg.Client(getPgConfig());
  await client.connect();

  try {
    await client.query('BEGIN');

    // Positions
    const positions = [
      [IDS.positions.dean, 'Dean'],
      [IDS.positions.deptHead, 'Department Head'],
      [IDS.positions.professor, 'Professor'],
      [IDS.positions.instructor, 'Instructor'],
      [IDS.positions.registrar, 'Registrar'],
      [IDS.positions.librarian, 'Librarian'],
      [IDS.positions.accountant, 'Accountant'],
      [IDS.positions.cashier, 'Cashier'],
      [IDS.positions.utility, 'Utility Worker'],
      [IDS.positions.guard, 'Security Guard'],
    ];
    for (const [id, name] of positions) {
      await upsertLookup(client, 'positions', id, ['name'], [name]);
    }

    // Departments
    const departments = [
      [IDS.departments.education, 'Education', 'Teacher education and related programs'],
      [IDS.departments.it, 'Information Technology', 'IT and computing programs'],
      [IDS.departments.hospitality, 'Hospitality Management', 'Hospitality and tourism programs'],
      [IDS.departments.business, 'Business Administration', 'Business and management programs'],
      [IDS.departments.registrar, "Registrar's Office", 'Student and employee records administration'],
      [IDS.departments.library, 'Library', 'Library and information services'],
      [IDS.departments.finance, 'Finance', 'Accounting and cashiering'],
      [IDS.departments.maintenance, 'Maintenance', 'Facilities and utility services'],
      [IDS.departments.security, 'Security', 'Campus security'],
    ];
    for (const [id, name, description] of departments) {
      await upsertLookup(client, 'departments', id, ['name', 'description'], [name, description]);
    }

    // Department ↔ position
    for (const [id, departmentId, positionId] of DEPT_POS_ROWS) {
      await client.query(
        `INSERT INTO department_positions (id, department_id, position_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (department_id, position_id) DO NOTHING`,
        [id, departmentId, positionId],
      );
    }

    // Employment types / statuses
    for (const [id, name] of [
      [IDS.employmentTypes.fullTime, 'Full-time'],
      [IDS.employmentTypes.partTime, 'Part-time'],
      [IDS.employmentTypes.contractual, 'Contractual'],
      [IDS.employmentTypes.probationary, 'Probationary'],
      [IDS.employmentTypes.temporary, 'Temporary'],
      [IDS.employmentTypes.jobOrder, 'Job Order'],
      [IDS.employmentTypes.casual, 'Casual'],
    ]) {
      await upsertLookup(client, 'employment_types', id, ['name'], [name]);
    }

    for (const [id, name] of [
      [IDS.employmentStatuses.active, 'Active'],
      [IDS.employmentStatuses.inactive, 'Inactive'],
      [IDS.employmentStatuses.onLeave, 'On Leave'],
    ]) {
      await upsertLookup(client, 'employment_statuses', id, ['name'], [name]);
    }

    // Document types — selective is_required (improved vs mock)
    const docTypes = [
      [IDS.documentTypes.pds, 'Personal Data Sheet', true],
      [IDS.documentTypes.resume, 'Resume/CV', true],
      [IDS.documentTypes.diploma, 'Diploma', true],
      [IDS.documentTypes.tor, 'Transcript of Records', true],
      [IDS.documentTypes.prc, 'PRC License', false],
      [IDS.documentTypes.coe, 'Certificate of Employment', false],
      [IDS.documentTypes.birth, 'Birth Certificate', true],
      [IDS.documentTypes.marriage, 'Marriage Certificate', false],
      [IDS.documentTypes.nbi, 'NBI Clearance', true],
      [IDS.documentTypes.police, 'Police Clearance', false],
      [IDS.documentTypes.medical, 'Medical Certificate', true],
      [IDS.documentTypes.service, 'Service Record', false],
      [IDS.documentTypes.contract, 'Contract', true],
    ];
    for (const [id, name, isRequired] of docTypes) {
      await client.query(
        `INSERT INTO document_types (id, name, description, is_required)
         VALUES ($1, $2, '', $3)
         ON CONFLICT (id) DO NOTHING`,
        [id, name, isRequired],
      );
    }

    // Roles
    const roles = [
      [IDS.roles.superadmin, 'superadmin', 'Super Administrator', 'Full system access including setup'],
      [IDS.roles.admin, 'admin', 'Administrator', 'Manage users and all records'],
      [IDS.roles.staff, 'staff', 'Staff', 'Create and update employee records and documents'],
      [IDS.roles.viewer, 'viewer', 'Viewer', 'Read-only access'],
    ];
    for (const [id, code, name, description] of roles) {
      await client.query(
        `INSERT INTO user_roles (id, code, name, description)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO NOTHING`,
        [id, code, name, description],
      );
    }

    // App settings defaults
    const inbox = ensureDirs(filesRoot, process.env.SCAN_INBOX_PATH);
    const backupsRoot =
      process.env.BACKUPS_ROOT || path.join(root, 'backups');
    fs.mkdirSync(backupsRoot, { recursive: true });
    const defaults = {
      setup_completed: false,
      org_name: 'Northern Samar Colleges',
      files_root: filesRoot,
      scan_inbox_path: inbox,
      backups_root: backupsRoot,
      max_upload_bytes: maxUpload,
    };
    for (const [key, value] of Object.entries(defaults)) {
      await client.query(
        `INSERT INTO app_settings (key, value)
         VALUES ($1, $2::jsonb)
         ON CONFLICT (key) DO NOTHING`,
        [key, JSON.stringify(value)],
      );
    }

    // Superadmin (no employee link required)
    const existing = await client.query(
      'SELECT id FROM users WHERE username = $1',
      [username],
    );
    if (!existing.rows.length) {
      const hash = await bcrypt.hash(password, 12);
      const userId = ulid();
      await client.query(
        `INSERT INTO users (
           id, employee_id, role_id, username, password_hash,
           display_name, is_active, must_change_password
         ) VALUES ($1, NULL, $2, $3, $4, $5, TRUE, TRUE)`,
        [userId, IDS.roles.superadmin, username, hash, displayName],
      );
      console.log(`Created superadmin user "${username}" (must change password on first login).`);
    } else {
      console.log(`Superadmin "${username}" already exists — skipped.`);
    }

    await client.query('COMMIT');
    console.log(`Seed complete.`);
    console.log(`FILES_ROOT: ${filesRoot}`);
    console.log(`SCAN_INBOX: ${inbox}`);
    console.log(`BACKUPS_ROOT: ${backupsRoot}`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
