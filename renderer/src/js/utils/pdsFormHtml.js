import { escapeHtml } from './helpers.js';
import { emptyPds, clonePds } from './pds.js';

function v(value) {
  const s = value == null ? '' : String(value).trim();
  return s ? escapeHtml(s) : '<span class="cs212-na">N/A</span>';
}

function plain(value) {
  const s = value == null ? '' : String(value).trim();
  return s || 'N/A';
}

function fmtDate(value) {
  if (!value) return '';
  const s = String(value).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return s;
  return `${m[2]}/${m[3]}/${m[1]}`;
}

function addrLines(addr) {
  if (!addr) return '';
  return [
    addr.houseBlockLot,
    addr.street,
    addr.subdivision,
    addr.barangay,
    addr.cityMunicipality,
    addr.province,
    addr.zipCode,
  ]
    .filter(Boolean)
    .join(', ');
}

function yn(val) {
  if (val === true || val === 'Yes' || val === 'true') return 'Yes';
  if (val === false || val === 'No' || val === 'false') return 'No';
  return String(val || '').trim();
}

/**
 * Build CS Form No. 212–style HTML for on-screen view or print.
 * @param {object} employee
 * @param {{ forPrint?: boolean }} [opts]
 */
export function buildCs212Html(employee, opts = {}) {
  const pds = clonePds(employee?.pds || emptyPds());
  const p = pds.personal;
  const f = pds.family;
  const o = pds.otherInfo || {};
  const assignment = employee?.assignment;
  const photoUrl = employee?.photoUrl || null;
  const rootClass = opts.forPrint ? 'cs212 cs212-print' : 'cs212 cs212-screen';

  const photo = photoUrl
    ? `<img class="cs212-photo" src="${escapeHtml(photoUrl)}" alt="" />`
    : `<div class="cs212-photo cs212-photo-empty">ID<br/>PHOTO</div>`;

  return `
<div class="${rootClass}">
  <div class="cs212-page">
    <div class="cs212-topline">
      <div class="cs212-form-meta">
        <div>CS Form No. 212</div>
        <div>Revised 2025</div>
      </div>
      <div class="cs212-title-wrap">
        <h1 class="cs212-title">PERSONAL DATA SHEET</h1>
        <p class="cs212-warn">WARNING: Any misrepresentation made in the Personal Data Sheet and the Work Experience Sheet shall cause the filing of administrative/criminal case/s against the person concerned.</p>
      </div>
      <div class="cs212-photo-slot">${photo}</div>
    </div>

    <div class="cs212-sec">I. PERSONAL INFORMATION</div>
    <table class="cs212-table">
      <tr>
        <td class="cs212-lbl" style="width:18%">1. SURNAME</td>
        <td class="cs212-val" colspan="5">${v(p.surname)}</td>
      </tr>
      <tr>
        <td class="cs212-lbl">2. FIRST NAME</td>
        <td class="cs212-val" colspan="3">${v(p.firstName)}</td>
        <td class="cs212-lbl">NAME EXTENSION (JR., SR)</td>
        <td class="cs212-val">${v(p.nameExtension)}</td>
      </tr>
      <tr>
        <td class="cs212-lbl">MIDDLE NAME</td>
        <td class="cs212-val" colspan="5">${v(p.middleName)}</td>
      </tr>
    </table>
    <table class="cs212-table cs212-split">
      <tr>
        <td class="cs212-left">
          <table class="cs212-table nested">
            <tr><td class="cs212-lbl">3. DATE OF BIRTH</td><td class="cs212-val">${v(fmtDate(p.birthDate))}</td></tr>
            <tr><td class="cs212-lbl">4. PLACE OF BIRTH</td><td class="cs212-val">${v(p.placeOfBirth)}</td></tr>
            <tr><td class="cs212-lbl">5. SEX AT BIRTH</td><td class="cs212-val">${v(p.sex)}</td></tr>
            <tr><td class="cs212-lbl">6. CIVIL STATUS</td><td class="cs212-val">${v(p.civilStatus)}${p.civilStatusOther ? ` / ${v(p.civilStatusOther)}` : ''}</td></tr>
            <tr><td class="cs212-lbl">7. HEIGHT (m)</td><td class="cs212-val">${v(p.heightM)}</td></tr>
            <tr><td class="cs212-lbl">8. WEIGHT (kg)</td><td class="cs212-val">${v(p.weightKg)}</td></tr>
            <tr><td class="cs212-lbl">9. BLOOD TYPE</td><td class="cs212-val">${v(p.bloodType)}</td></tr>
            <tr><td class="cs212-lbl">10. GSIS / UMID ID NO.</td><td class="cs212-val">${v(p.gsisUmidNo)}</td></tr>
            <tr><td class="cs212-lbl">11. PAG-IBIG ID NO.</td><td class="cs212-val">${v(p.pagibigNo)}</td></tr>
            <tr><td class="cs212-lbl">12. PHILHEALTH NO.</td><td class="cs212-val">${v(p.philhealthNo)}</td></tr>
            <tr><td class="cs212-lbl">13. PhilSys Number (PSN)</td><td class="cs212-val">${v(p.philsysNo)}</td></tr>
            <tr><td class="cs212-lbl">14. TIN NO.</td><td class="cs212-val">${v(p.tinNo)}</td></tr>
            <tr><td class="cs212-lbl">15. AGENCY EMPLOYEE NO.</td><td class="cs212-val">${v(p.agencyEmployeeNo || employee?.employeeNo)}</td></tr>
          </table>
        </td>
        <td class="cs212-right">
          <table class="cs212-table nested">
            <tr>
              <td class="cs212-lbl">16. CITIZENSHIP</td>
              <td class="cs212-val">
                ${v(p.citizenship)}
                ${p.dualCitizenship ? `<div class="cs212-sub">Dual: ${v(p.dualCitizenshipType)} · Country: ${v(p.dualCitizenshipCountry)}</div>` : ''}
              </td>
            </tr>
            <tr>
              <td class="cs212-lbl">17. RESIDENTIAL ADDRESS</td>
              <td class="cs212-val">${v(addrLines(p.residentialAddress))}</td>
            </tr>
            <tr>
              <td class="cs212-lbl">18. PERMANENT ADDRESS</td>
              <td class="cs212-val">${v(addrLines(p.permanentAddress))}</td>
            </tr>
            <tr><td class="cs212-lbl">19. TELEPHONE NO.</td><td class="cs212-val">${v(p.telephoneNo)}</td></tr>
            <tr><td class="cs212-lbl">20. MOBILE NO.</td><td class="cs212-val">${v(p.mobileNo)}</td></tr>
            <tr><td class="cs212-lbl">21. E-MAIL ADDRESS</td><td class="cs212-val">${v(p.email)}</td></tr>
          </table>
        </td>
      </tr>
    </table>

    <div class="cs212-sec">II. FAMILY BACKGROUND</div>
    <table class="cs212-table cs212-split">
      <tr>
        <td class="cs212-left">
          <table class="cs212-table nested">
            <tr><td class="cs212-lbl" colspan="2">22. SPOUSE'S INFORMATION</td></tr>
            <tr><td class="cs212-lbl">SURNAME</td><td class="cs212-val">${v(f.spouse?.surname)}</td></tr>
            <tr><td class="cs212-lbl">FIRST NAME</td><td class="cs212-val">${v(f.spouse?.firstName)} <span class="cs212-muted">Ext: ${plain(f.spouse?.nameExtension)}</span></td></tr>
            <tr><td class="cs212-lbl">MIDDLE NAME</td><td class="cs212-val">${v(f.spouse?.middleName)}</td></tr>
            <tr><td class="cs212-lbl">OCCUPATION</td><td class="cs212-val">${v(f.spouse?.occupation)}</td></tr>
            <tr><td class="cs212-lbl">EMPLOYER/BUSINESS NAME</td><td class="cs212-val">${v(f.spouse?.employer)}</td></tr>
            <tr><td class="cs212-lbl">BUSINESS ADDRESS</td><td class="cs212-val">${v(f.spouse?.businessAddress)}</td></tr>
            <tr><td class="cs212-lbl">TELEPHONE NO.</td><td class="cs212-val">${v(f.spouse?.telephoneNo)}</td></tr>
            <tr><td class="cs212-lbl" colspan="2">24. FATHER'S NAME</td></tr>
            <tr><td class="cs212-lbl">SURNAME</td><td class="cs212-val">${v(f.father?.surname)}</td></tr>
            <tr><td class="cs212-lbl">FIRST NAME</td><td class="cs212-val">${v(f.father?.firstName)} <span class="cs212-muted">Ext: ${plain(f.father?.nameExtension)}</span></td></tr>
            <tr><td class="cs212-lbl">MIDDLE NAME</td><td class="cs212-val">${v(f.father?.middleName)}</td></tr>
            <tr><td class="cs212-lbl" colspan="2">25. MOTHER'S MAIDEN NAME</td></tr>
            <tr><td class="cs212-lbl">SURNAME</td><td class="cs212-val">${v(f.mother?.surname)}</td></tr>
            <tr><td class="cs212-lbl">FIRST NAME</td><td class="cs212-val">${v(f.mother?.firstName)}</td></tr>
            <tr><td class="cs212-lbl">MIDDLE NAME</td><td class="cs212-val">${v(f.mother?.middleName)}</td></tr>
          </table>
        </td>
        <td class="cs212-right">
          <table class="cs212-table nested">
            <tr>
              <td class="cs212-lbl">23. NAME OF CHILDREN</td>
              <td class="cs212-lbl" style="width:32%">DATE OF BIRTH</td>
            </tr>
            ${childrenRows(f.children)}
          </table>
        </td>
      </tr>
    </table>
  </div>

  <div class="cs212-page">
    <div class="cs212-sec">III. EDUCATIONAL BACKGROUND</div>
    <table class="cs212-table">
      <tr>
        <td class="cs212-lbl">LEVEL</td>
        <td class="cs212-lbl">NAME OF SCHOOL</td>
        <td class="cs212-lbl">BASIC ED. / DEGREE / COURSE</td>
        <td class="cs212-lbl">FROM</td>
        <td class="cs212-lbl">TO</td>
        <td class="cs212-lbl">HIGHEST LEVEL / UNITS</td>
        <td class="cs212-lbl">YEAR GRAD.</td>
        <td class="cs212-lbl">HONORS</td>
      </tr>
      ${eduRows(pds.education)}
    </table>

    <div class="cs212-sec">IV. CIVIL SERVICE ELIGIBILITY</div>
    <table class="cs212-table">
      <tr>
        <td class="cs212-lbl">CAREER SERVICE / RA / BOARD</td>
        <td class="cs212-lbl">RATING</td>
        <td class="cs212-lbl">DATE OF EXAM</td>
        <td class="cs212-lbl">PLACE OF EXAM</td>
        <td class="cs212-lbl">LICENSE NO.</td>
        <td class="cs212-lbl">VALIDITY</td>
      </tr>
      ${eligRows(pds.eligibility)}
    </table>

    <div class="cs212-sec">V. WORK EXPERIENCE</div>
    <table class="cs212-table">
      <tr>
        <td class="cs212-lbl">FROM</td>
        <td class="cs212-lbl">TO</td>
        <td class="cs212-lbl">POSITION TITLE</td>
        <td class="cs212-lbl">DEPARTMENT / AGENCY / COMPANY</td>
        <td class="cs212-lbl">MONTHLY SALARY</td>
        <td class="cs212-lbl">SG / STEP</td>
        <td class="cs212-lbl">STATUS</td>
        <td class="cs212-lbl">GOV'T</td>
      </tr>
      ${workRows(pds.workExperience)}
    </table>
  </div>

  <div class="cs212-page">
    <div class="cs212-sec">VI. VOLUNTARY WORK / CIVIC / NGO</div>
    <table class="cs212-table">
      <tr>
        <td class="cs212-lbl">NAME &amp; ADDRESS OF ORGANIZATION</td>
        <td class="cs212-lbl">FROM</td>
        <td class="cs212-lbl">TO</td>
        <td class="cs212-lbl">HOURS</td>
        <td class="cs212-lbl">POSITION / NATURE OF WORK</td>
      </tr>
      ${volRows(pds.voluntaryWork)}
    </table>

    <div class="cs212-sec">VII. LEARNING AND DEVELOPMENT</div>
    <table class="cs212-table">
      <tr>
        <td class="cs212-lbl">TITLE OF L&amp;D / TRAINING</td>
        <td class="cs212-lbl">FROM</td>
        <td class="cs212-lbl">TO</td>
        <td class="cs212-lbl">HOURS</td>
        <td class="cs212-lbl">TYPE</td>
        <td class="cs212-lbl">CONDUCTED / SPONSORED BY</td>
      </tr>
      ${ldRows(pds.learningDevelopment)}
    </table>

    <div class="cs212-sec">VIII. OTHER INFORMATION</div>
    <table class="cs212-table">
      <tr>
        <td class="cs212-lbl" style="width:33%">29. SPECIAL SKILLS / HOBBIES</td>
        <td class="cs212-lbl" style="width:33%">30. NON-ACADEMIC DISTINCTIONS</td>
        <td class="cs212-lbl">31. MEMBERSHIP IN ASSOCIATION / ORG.</td>
      </tr>
      <tr>
        <td class="cs212-val cs212-top">${listCell(o.skills)}</td>
        <td class="cs212-val cs212-top">${listCell(o.recognitions)}</td>
        <td class="cs212-val cs212-top">${listCell(o.memberships)}</td>
      </tr>
    </table>

    <div class="cs212-sec">34–40. QUESTIONS</div>
    ${qPrint('34', 'Are you related by consanguinity or affinity to the appointing/recommending authority, or to the chief of bureau/office, or to a person who has authority to influence in the office?', o.q34)}
    ${qPrint('35', 'Have you ever been found guilty of any administrative offense?', o.q35)}
    ${qPrint('36', 'Have you been criminally charged before any court?', o.q36)}
    ${qPrint('37', 'Have you ever been convicted of any crime or violation of any law?', o.q37)}
    ${qPrint('38', 'Have you ever been separated from the service for cause?', o.q38)}
    ${qPrint('39', 'Have you ever been a candidate in a national or local election (except Barangay election)?', o.q39)}
    ${qPrint('40', 'Have you acquired the status of an immigrant or permanent resident of another country?', o.q40)}

    <div class="cs212-sec">REFERENCES</div>
    <table class="cs212-table">
      <tr>
        <td class="cs212-lbl">NAME</td>
        <td class="cs212-lbl">ADDRESS</td>
        <td class="cs212-lbl">TELEPHONE NO.</td>
      </tr>
      ${(o.references || []).map((r) => `
        <tr>
          <td class="cs212-val">${v(r.name)}</td>
          <td class="cs212-val">${v(r.address)}</td>
          <td class="cs212-val">${v(r.telephoneNo)}</td>
        </tr>`).join('') || `<tr><td class="cs212-val" colspan="3">${v('')}</td></tr>`}
    </table>

    <div class="cs212-sec">NSC EMPLOYMENT ASSIGNMENT</div>
    <table class="cs212-table">
      <tr>
        <td class="cs212-lbl">DEPARTMENT</td>
        <td class="cs212-val">${v(assignment?.departmentName)}</td>
        <td class="cs212-lbl">POSITION</td>
        <td class="cs212-val">${v(assignment?.positionName)}</td>
      </tr>
      <tr>
        <td class="cs212-lbl">EMPLOYMENT TYPE</td>
        <td class="cs212-val">${v(assignment?.employmentTypeName)}</td>
        <td class="cs212-lbl">STATUS</td>
        <td class="cs212-val">${v(assignment?.employmentStatusName)}</td>
      </tr>
      <tr>
        <td class="cs212-lbl">START DATE</td>
        <td class="cs212-val">${v(fmtDate(assignment?.startDate))}</td>
        <td class="cs212-lbl">EMPLOYEE NO.</td>
        <td class="cs212-val">${v(employee?.employeeNo)}</td>
      </tr>
    </table>

    <p class="cs212-footer">Generated from NSC-ERMS · CS Form No. 212 (Revised 2025) layout · ${escapeHtml(new Date().toLocaleString())}</p>
  </div>
</div>`;
}

function childrenRows(children) {
  const rows = Array.isArray(children) && children.length ? children : [{}];
  const padded = [...rows];
  while (padded.length < 6) padded.push({});
  return padded
    .slice(0, 12)
    .map(
      (c) => `
    <tr>
      <td class="cs212-val">${v(c.name)}</td>
      <td class="cs212-val">${v(fmtDate(c.dateOfBirth))}</td>
    </tr>`,
    )
    .join('');
}

function eduRows(list) {
  const rows = Array.isArray(list) && list.length ? list : [{}];
  return rows
    .map(
      (r) => `
    <tr>
      <td class="cs212-val">${v(r.level)}</td>
      <td class="cs212-val">${v(r.schoolName)}</td>
      <td class="cs212-val">${v(r.degreeCourse)}</td>
      <td class="cs212-val">${v(r.periodFrom)}</td>
      <td class="cs212-val">${v(r.periodTo)}</td>
      <td class="cs212-val">${v(r.highestLevel)}</td>
      <td class="cs212-val">${v(r.yearGraduated)}</td>
      <td class="cs212-val">${v(r.honors)}</td>
    </tr>`,
    )
    .join('');
}

function eligRows(list) {
  const rows = Array.isArray(list) && list.length ? list : [{}];
  return rows
    .map(
      (r) => `
    <tr>
      <td class="cs212-val">${v(r.careerService)}</td>
      <td class="cs212-val">${v(r.rating)}</td>
      <td class="cs212-val">${v(fmtDate(r.examDate))}</td>
      <td class="cs212-val">${v(r.examPlace)}</td>
      <td class="cs212-val">${v(r.licenseNumber)}</td>
      <td class="cs212-val">${v(fmtDate(r.licenseValidity))}</td>
    </tr>`,
    )
    .join('');
}

function workRows(list) {
  const rows = Array.isArray(list) && list.length ? list : [{}];
  return rows
    .map(
      (r) => `
    <tr>
      <td class="cs212-val">${v(fmtDate(r.from))}</td>
      <td class="cs212-val">${v(fmtDate(r.to))}</td>
      <td class="cs212-val">${v(r.positionTitle)}</td>
      <td class="cs212-val">${v(r.departmentAgency)}</td>
      <td class="cs212-val">${v(r.monthlySalary)}</td>
      <td class="cs212-val">${v(r.salaryGrade)}</td>
      <td class="cs212-val">${v(r.statusOfAppointment)}</td>
      <td class="cs212-val">${v(yn(r.govService))}</td>
    </tr>`,
    )
    .join('');
}

function volRows(list) {
  const rows = Array.isArray(list) && list.length ? list : [{}];
  return rows
    .map(
      (r) => `
    <tr>
      <td class="cs212-val">${v([r.orgName, r.orgAddress].filter(Boolean).join(' — '))}</td>
      <td class="cs212-val">${v(fmtDate(r.from))}</td>
      <td class="cs212-val">${v(fmtDate(r.to))}</td>
      <td class="cs212-val">${v(r.hours)}</td>
      <td class="cs212-val">${v(r.positionNature)}</td>
    </tr>`,
    )
    .join('');
}

function ldRows(list) {
  const rows = Array.isArray(list) && list.length ? list : [{}];
  return rows
    .map(
      (r) => `
    <tr>
      <td class="cs212-val">${v(r.title)}</td>
      <td class="cs212-val">${v(fmtDate(r.from))}</td>
      <td class="cs212-val">${v(fmtDate(r.to))}</td>
      <td class="cs212-val">${v(r.hours)}</td>
      <td class="cs212-val">${v(r.type)}</td>
      <td class="cs212-val">${v(r.conductedBy)}</td>
    </tr>`,
    )
    .join('');
}

function listCell(arr) {
  if (!Array.isArray(arr) || !arr.length) return v('');
  return escapeHtml(arr.join('\n')).replace(/\n/g, '<br/>');
}

function qPrint(num, label, q) {
  const item = q || {};
  const extra =
    num === '39' && (item.dateFiled || item.status)
      ? ` · Filed: ${plain(fmtDate(item.dateFiled))} · Status: ${plain(item.status)}`
      : '';
  return `
    <table class="cs212-table cs212-q">
      <tr>
        <td class="cs212-lbl" style="width:72%">${escapeHtml(num)}. ${escapeHtml(label)}</td>
        <td class="cs212-val"><strong>${v(yn(item.answer))}</strong>${extra ? escapeHtml(extra) : ''}</td>
      </tr>
      <tr>
        <td class="cs212-lbl">If YES, give details</td>
        <td class="cs212-val">${v(item.details)}</td>
      </tr>
    </table>`;
}
