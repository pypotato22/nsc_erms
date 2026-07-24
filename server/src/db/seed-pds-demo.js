/**
 * Upsert one demo employee with a complete CS Form 212 (Rev. 2025) PDS payload.
 * Safe to re-run: updates the same DEMO-PDS-001 record.
 *
 * Usage: npm run seed:pds-demo
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { ulid } from 'ulid';
import pg from 'pg';
import { getPgConfig } from '../config.js';
import { normalizePds, syncEmployeeColumnsFromPds } from '../services/pds.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../..');
dotenv.config({ path: path.join(root, '.env') });

const DEMO_EMPLOYEE_NO = 'DEMO-PDS-001';

function buildDemoPds() {
  return normalizePds({
    version: 2025,
    personal: {
      surname: 'Dela Cruz',
      firstName: 'Juan',
      middleName: 'Santos',
      nameExtension: 'Jr.',
      birthDate: '1990-05-15',
      placeOfBirth: 'Catarman, Northern Samar',
      sex: 'male',
      civilStatus: 'Married',
      heightM: '1.70',
      weightKg: '68',
      bloodType: 'O+',
      gsisUmidNo: '11-1111111-1',
      pagibigNo: '1210-1234-5678',
      philhealthNo: '12-345678901-2',
      philsysNo: '1234-5678-9012-3456',
      tinNo: '123-456-789-000',
      agencyEmployeeNo: DEMO_EMPLOYEE_NO,
      citizenship: 'Filipino',
      dualCitizenship: false,
      residentialAddress: {
        houseBlockLot: '123',
        street: 'Rizal St',
        subdivision: 'Sampaguita Village',
        barangay: 'Brgy. Dalakit',
        cityMunicipality: 'Catarman',
        province: 'Northern Samar',
        zipCode: '6400',
      },
      permanentAddress: {
        houseBlockLot: '123',
        street: 'Rizal St',
        subdivision: 'Sampaguita Village',
        barangay: 'Brgy. Dalakit',
        cityMunicipality: 'Catarman',
        province: 'Northern Samar',
        zipCode: '6400',
      },
      sameAsResidential: true,
      telephoneNo: '(055) 500-1234',
      mobileNo: '09171234567',
      email: 'juan.delacruz.demo@nsc.edu.ph',
    },
    family: {
      spouse: {
        surname: 'Dela Cruz',
        firstName: 'Maria',
        middleName: 'Reyes',
        nameExtension: '',
        occupation: 'Teacher',
        employer: 'DepEd Northern Samar',
        businessAddress: 'Catarman, Northern Samar',
        telephoneNo: '09181234567',
      },
      father: {
        surname: 'Dela Cruz',
        firstName: 'Pedro',
        middleName: 'Lopez',
        nameExtension: 'Sr.',
      },
      mother: {
        surname: 'Santos',
        firstName: 'Ana',
        middleName: 'Garcia',
        nameExtension: '',
      },
      children: [
        { name: 'Ana Marie Dela Cruz', dateOfBirth: '2015-03-10' },
        { name: 'Jose Miguel Dela Cruz', dateOfBirth: '2018-11-22' },
      ],
    },
    education: [
      {
        level: 'Elementary',
        schoolName: 'Catarman Central Elementary School',
        degreeCourse: 'Elementary',
        periodFrom: '1997',
        periodTo: '2003',
        highestLevel: 'Graduated',
        yearGraduated: '2003',
        honors: 'With Honors',
      },
      {
        level: 'Secondary',
        schoolName: 'Northern Samar National High School',
        degreeCourse: 'Secondary',
        periodFrom: '2003',
        periodTo: '2007',
        highestLevel: 'Graduated',
        yearGraduated: '2007',
        honors: 'N/A',
      },
      {
        level: 'Vocational / Trade Course',
        schoolName: 'N/A',
        degreeCourse: 'N/A',
        periodFrom: 'N/A',
        periodTo: 'N/A',
        highestLevel: 'N/A',
        yearGraduated: 'N/A',
        honors: 'N/A',
      },
      {
        level: 'College',
        schoolName: 'Northern Samar Colleges',
        degreeCourse: 'Bachelor of Science in Information Technology',
        periodFrom: '2007',
        periodTo: '2011',
        highestLevel: 'Graduated',
        yearGraduated: '2011',
        honors: 'Cum Laude',
      },
      {
        level: 'Graduate Studies',
        schoolName: 'University of Eastern Philippines',
        degreeCourse: 'Master in Information Systems',
        periodFrom: '2015',
        periodTo: '2018',
        highestLevel: 'Graduated',
        yearGraduated: '2018',
        honors: 'N/A',
      },
    ],
    eligibility: [
      {
        careerService: 'Professional (Second Level)',
        rating: '85.50',
        examDate: '2012-06-15',
        examPlace: 'CSC RO VIII, Tacloban City',
        licenseNumber: 'N/A',
        licenseValidity: '',
      },
    ],
    workExperience: [
      {
        from: '2019-06-01',
        to: '',
        positionTitle: 'IT Staff / Systems Administrator',
        departmentAgency: 'Northern Samar Colleges',
        monthlySalary: '28000',
        salaryGrade: '15-1',
        statusOfAppointment: 'Permanent',
        govService: true,
      },
      {
        from: '2012-07-01',
        to: '2019-05-31',
        positionTitle: 'Computer Programmer',
        departmentAgency: 'LGU Catarman',
        monthlySalary: '22000',
        salaryGrade: '11-1',
        statusOfAppointment: 'Permanent',
        govService: true,
      },
    ],
    voluntaryWork: [
      {
        orgName: 'NSC Alumni Association',
        orgAddress: 'Catarman, Northern Samar',
        from: '2020-01-01',
        to: '2022-12-31',
        hours: '120',
        positionNature: 'Volunteer IT Support',
      },
    ],
    learningDevelopment: [
      {
        title: 'Cybersecurity Awareness for Government Employees',
        from: '2023-08-10',
        to: '2023-08-11',
        hours: '16',
        type: 'Technical',
        conductedBy: 'DICT Region VIII',
      },
      {
        title: 'Supervisory Development Course',
        from: '2021-03-01',
        to: '2021-03-05',
        hours: '40',
        type: 'Supervisory',
        conductedBy: 'Civil Service Commission',
      },
    ],
    otherInfo: {
      skills: ['Network administration', 'Web development', 'Database management'],
      recognitions: ['Outstanding Employee 2022 — Northern Samar Colleges'],
      memberships: ['Philippine Society of IT Educators'],
      q34: { answer: 'No', details: '' },
      q35: { answer: 'No', details: '' },
      q36: { answer: 'No', details: '' },
      q37: { answer: 'No', details: '' },
      q38: { answer: 'No', details: '' },
      q39: { answer: 'No', details: '' },
      q40: { answer: 'No', details: '' },
      references: [
        {
          name: 'Dr. Elena Ramos',
          address: 'NSC Main Campus, Catarman',
          telephoneNo: '09190001111',
        },
        {
          name: 'Engr. Mark Villanueva',
          address: 'LGU Catarman IT Office',
          telephoneNo: '09190002222',
        },
        {
          name: 'Prof. Grace Lim',
          address: 'UEP Catarman',
          telephoneNo: '09190003333',
        },
      ],
    },
  });
}

async function main() {
  const client = new pg.Client(getPgConfig());
  await client.connect();
  const pds = buildDemoPds();
  const cols = syncEmployeeColumnsFromPds(pds, { employeeNo: DEMO_EMPLOYEE_NO });

  try {
    const { rows: deptPos } = await client.query(
      `SELECT dp.id
       FROM department_positions dp
       JOIN departments d ON d.id = dp.department_id
       JOIN positions p ON p.id = dp.position_id
       WHERE dp.is_active = TRUE AND d.is_active = TRUE AND p.is_active = TRUE
       ORDER BY d.name, p.name
       LIMIT 1`,
    );
    if (!deptPos[0]) {
      throw new Error('No department_positions found. Run npm run seed first.');
    }

    const { rows: types } = await client.query(
      `SELECT id FROM employment_types WHERE is_active = TRUE ORDER BY name LIMIT 1`,
    );
    const { rows: statuses } = await client.query(
      `SELECT id, name FROM employment_statuses WHERE is_active = TRUE ORDER BY name`,
    );
    if (!types[0] || !statuses.length) {
      throw new Error('Missing employment types/statuses. Run npm run seed first.');
    }
    const activeStatus =
      statuses.find((s) => /active/i.test(s.name) && !/inactive/i.test(s.name))?.id ||
      statuses[0].id;

    await client.query('BEGIN');

    const { rows: existing } = await client.query(
      `SELECT id FROM employees WHERE employee_no = $1 LIMIT 1`,
      [DEMO_EMPLOYEE_NO],
    );

    let empId = existing[0]?.id;
    if (empId) {
      await client.query(
        `UPDATE employees
         SET first_name = $2, middle_name = $3, last_name = $4, name_extension = $5,
             sex = $6, birth_date = $7, email = $8, contact_number = $9, address = $10,
             pds = $11::jsonb, remarks = $12, is_archived = FALSE, deleted_at = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [
          empId,
          cols.firstName,
          cols.middleName,
          cols.lastName,
          cols.nameExtension,
          cols.sex,
          cols.birthDate,
          cols.email,
          cols.contactNumber,
          cols.address,
          JSON.stringify(pds),
          'Demo PDS employee (CS Form 212 sample) — safe to re-seed',
        ],
      );

      const { rows: primary } = await client.query(
        `SELECT id FROM employee_assignments
         WHERE employee_id = $1 AND is_primary = TRUE
         ORDER BY is_active DESC, start_date DESC NULLS LAST
         LIMIT 1`,
        [empId],
      );
      if (primary[0]) {
        await client.query(
          `UPDATE employee_assignments
           SET department_position_id = $2,
               employment_type_id = $3,
               employment_status_id = $4,
               start_date = $5,
               is_active = TRUE,
               end_date = NULL,
               updated_at = NOW()
           WHERE id = $1`,
          [primary[0].id, deptPos[0].id, types[0].id, activeStatus, '2019-06-01'],
        );
      } else {
        await client.query(
          `INSERT INTO employee_assignments (
             id, employee_id, department_position_id, employment_type_id,
             employment_status_id, start_date, is_active, is_primary
           ) VALUES ($1,$2,$3,$4,$5,$6, TRUE, TRUE)`,
          [ulid(), empId, deptPos[0].id, types[0].id, activeStatus, '2019-06-01'],
        );
      }
      console.log(`Updated demo PDS employee ${DEMO_EMPLOYEE_NO} (${empId})`);
    } else {
      empId = ulid();
      await client.query(
        `INSERT INTO employees (
           id, employee_no, first_name, middle_name, last_name, name_extension,
           sex, birth_date, email, contact_number, address, pds, remarks
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)`,
        [
          empId,
          DEMO_EMPLOYEE_NO,
          cols.firstName,
          cols.middleName,
          cols.lastName,
          cols.nameExtension,
          cols.sex,
          cols.birthDate,
          cols.email,
          cols.contactNumber,
          cols.address,
          JSON.stringify(pds),
          'Demo PDS employee (CS Form 212 sample) — safe to re-seed',
        ],
      );
      await client.query(
        `INSERT INTO employee_assignments (
           id, employee_id, department_position_id, employment_type_id,
           employment_status_id, start_date, is_active, is_primary
         ) VALUES ($1,$2,$3,$4,$5,$6, TRUE, TRUE)`,
        [ulid(), empId, deptPos[0].id, types[0].id, activeStatus, '2019-06-01'],
      );
      console.log(`Created demo PDS employee ${DEMO_EMPLOYEE_NO} (${empId})`);
    }

    await client.query('COMMIT');
    console.log('Search for: Juan Dela Cruz / DEMO-PDS-001');
    console.log('Then: View PDS → Download Excel / Print PDF');
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    console.error(err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
