import { useEffect, useState } from 'react';
import { SelectField, TextAreaField, TextField, YesNoOptions } from './Fields.jsx';

function SignaturePreview({ src }) {
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
  }, [src]);

  if (!src || broken) {
    return (
      <div id="sig-preview" className="sig-placeholder">
        No signature uploaded
      </div>
    );
  }
  return (
    <img
      id="sig-preview"
      className="pds-signature"
      src={src}
      alt="Signature"
      data-emp-signature=""
      onError={() => setBroken(true)}
    />
  );
}

function QBlock({ label, value, onChange }) {
  const item = value || { answer: '', details: '' };
  return (
    <div className="pds-q">
      <p className="pds-q-label">{label}</p>
      <div className="form-grid pds-grid-3">
        <SelectField
          label="Answer"
          value={item.answer}
          onChange={(next) => onChange({ answer: next })}
        >
          <YesNoOptions />
        </SelectField>
        <TextAreaField
          label="If Yes, give details"
          value={item.details}
          onChange={(next) => onChange({ details: next })}
        />
      </div>
    </div>
  );
}

function QSub({
  label,
  value,
  onChange,
  withDetails = false,
  withCaseMeta = false,
  detailsLabel = 'If Yes, give details',
}) {
  const item = value || { answer: '', details: '', dateFiled: '', status: '' };
  return (
    <div className="pds-q-sub">
      <p className="pds-q-sub-label">{label}</p>
      <div className="form-grid pds-grid-3">
        <SelectField
          label="Answer"
          value={item.answer}
          onChange={(next) => onChange({ answer: next })}
        >
          <YesNoOptions />
        </SelectField>
        {withCaseMeta && (
          <>
            <TextField
              label="Date filed"
              type="date"
              value={item.dateFiled}
              onChange={(next) => onChange({ dateFiled: next })}
            />
            <TextField
              label="Status of case/s"
              value={item.status}
              onChange={(next) => onChange({ status: next })}
            />
          </>
        )}
        {withDetails && (
          <TextAreaField
            label={detailsLabel}
            value={item.details}
            onChange={(next) => onChange({ details: next })}
          />
        )}
      </div>
    </div>
  );
}

export function OtherStep({
  other,
  patchOther,
  patchQuestion,
  patchQuestionPart,
  patchReference,
  patchDeclaration,
  signatureSrc,
  onPickSignature,
}) {
  const o = other;
  const [listText, setListText] = useState(() => ({
    skills: (o.skills || []).join('\n'),
    recognitions: (o.recognitions || []).join('\n'),
    memberships: (o.memberships || []).join('\n'),
  }));

  const changeList = (key) => (value) => {
    setListText((prev) => ({ ...prev, [key]: value }));
    patchOther({
      [key]: value
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
    });
  };

  const declaration = o.declaration || {};
  const references = o.references || [];

  return (
    <>
      <div className="pds-block">
        <h5>29–31. Skills, Recognitions, Memberships</h5>
        <div className="form-grid">
          <TextAreaField
            label="29. Special Skills and Hobbies (one per line)"
            rows={3}
            value={listText.skills}
            onChange={changeList('skills')}
          />
          <TextAreaField
            label="30. Non-Academic Distinctions / Recognition (one per line)"
            rows={3}
            value={listText.recognitions}
            onChange={changeList('recognitions')}
          />
          <TextAreaField
            label="31. Membership in Association / Organization (one per line)"
            rows={3}
            value={listText.memberships}
            onChange={changeList('memberships')}
          />
        </div>
      </div>

      <div className="pds-block">
        <h5>34–40. Additional Questions (CS Form 212 Rev. 2025)</h5>

        <div className="pds-q">
          <p className="pds-q-label">
            34. Related by consanguinity or affinity to the appointing/recommending authority, chief
            of bureau/office, or person with authority to influence?
          </p>
          <QSub
            label="a. Within the third degree?"
            value={o.q34?.a}
            onChange={(patch) => patchQuestionPart('q34', 'a', patch)}
          />
          <QSub
            label="b. Within the fourth degree (for LGU career employees)?"
            value={o.q34?.b}
            onChange={(patch) => patchQuestionPart('q34', 'b', patch)}
          />
          <div className="fg full" style={{ marginTop: 8 }}>
            <label>If YES, give details</label>
            <textarea
              rows={2}
              value={o.q34?.details || ''}
              onChange={(e) => patchQuestion('q34', { details: e.target.value })}
            />
          </div>
        </div>

        <div className="pds-q">
          <p className="pds-q-label">35. Administrative / criminal cases</p>
          <QSub
            label="a. Have you ever been found guilty of any administrative offense?"
            value={o.q35?.a}
            withDetails
            onChange={(patch) => patchQuestionPart('q35', 'a', patch)}
          />
          <QSub
            label="b. Have you been criminally charged before any court?"
            value={o.q35?.b}
            withDetails
            withCaseMeta
            onChange={(patch) => patchQuestionPart('q35', 'b', patch)}
          />
        </div>

        <QBlock
          label="36. Have you ever been convicted of any crime or violation of any law, decree, ordinance or regulation?"
          value={o.q36}
          onChange={(patch) => patchQuestion('q36', patch)}
        />
        <QBlock
          label="37. Have you ever been separated from the service (resignation, retirement, dropped from rolls, etc.)?"
          value={o.q37}
          onChange={(patch) => patchQuestion('q37', patch)}
        />

        <div className="pds-q">
          <p className="pds-q-label">38. Election / candidacy</p>
          <QSub
            label="a. Have you ever been a candidate in a national or local election (except Barangay)?"
            value={o.q38?.a}
            withDetails
            onChange={(patch) => patchQuestionPart('q38', 'a', patch)}
          />
          <QSub
            label="b. Have you resigned from government service during the 3-month period before the last election to promote/campaign for a candidate?"
            value={o.q38?.b}
            withDetails
            onChange={(patch) => patchQuestionPart('q38', 'b', patch)}
          />
        </div>

        <QBlock
          label="39. Have you acquired the status of an immigrant or permanent resident of another country?"
          value={o.q39}
          onChange={(patch) => patchQuestion('q39', patch)}
        />

        <div className="pds-q">
          <p className="pds-q-label">
            40. Pursuant to IPRA / Magna Carta for Disabled Persons / Solo Parents Act
          </p>
          <QSub
            label="a. Are you a member of any indigenous group?"
            value={o.q40?.a}
            withDetails
            detailsLabel="If YES, please specify"
            onChange={(patch) => patchQuestionPart('q40', 'a', patch)}
          />
          <QSub
            label="b. Are you a person with disability?"
            value={o.q40?.b}
            withDetails
            detailsLabel="If YES, please specify ID No."
            onChange={(patch) => patchQuestionPart('q40', 'b', patch)}
          />
          <QSub
            label="c. Are you a solo parent?"
            value={o.q40?.c}
            withDetails
            detailsLabel="If YES, please specify ID No."
            onChange={(patch) => patchQuestionPart('q40', 'c', patch)}
          />
        </div>
      </div>

      <div className="pds-block">
        <h5>41. References</h5>
        {references.map((r, i) => (
          <div className="form-grid pds-grid-3" style={{ marginBottom: 10 }} key={i}>
            <TextField
              label="Name"
              value={r.name}
              onChange={(value) => patchReference(i, { name: value })}
            />
            <TextField
              label="Address"
              value={r.address}
              onChange={(value) => patchReference(i, { address: value })}
            />
            <TextField
              label="Telephone No."
              value={r.telephoneNo}
              onChange={(value) => patchReference(i, { telephoneNo: value })}
            />
          </div>
        ))}
      </div>

      <div className="pds-block">
        <h5>Declaration — Government ID &amp; Date Accomplished</h5>
        <div className="form-grid">
          <TextField
            label="Government Issued ID (e.g. Passport, Driver's License)"
            full
            value={declaration.governmentIssuedId}
            onChange={(value) => patchDeclaration({ governmentIssuedId: value })}
          />
          <TextField
            label="ID / License / Passport No."
            full
            value={declaration.idNumber}
            onChange={(value) => patchDeclaration({ idNumber: value })}
          />
          <TextField
            label="Date / Place of Issuance"
            full
            placeholder="e.g. 15/03/2020, Manila"
            value={declaration.datePlaceOfIssuance}
            onChange={(value) => patchDeclaration({ datePlaceOfIssuance: value })}
          />
          <TextField
            label="Date Accomplished"
            type="date"
            value={declaration.dateAccomplished}
            onChange={(value) => patchDeclaration({ dateAccomplished: value })}
          />
        </div>
        <div className="sig-wrap needs-write">
          <SignaturePreview src={signatureSrc} />
          <label className="pic-lbl" htmlFor="sig-input">
            Upload Digital Signature
          </label>
          <input
            type="file"
            id="sig-input"
            accept="image/png,image/jpeg,image/webp,image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onPickSignature(file);
              e.target.value = '';
            }}
          />
        </div>
        <p className="pds-hint">
          Upload a signature image (PNG with transparent background preferred). It is placed in the
          PDS “Sign inside the box” area. Right thumbmark remains blank for wet-ink signing.
        </p>
      </div>
    </>
  );
}
