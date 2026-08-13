import { useEffect, useState } from 'react';
import { AddressBlock, SelectField, TextField } from './Fields.jsx';

const CIVIL_STATUSES = ['Single', 'Married', 'Widowed', 'Separated', 'Other'];

function PhotoPreview({ src, initials }) {
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
  }, [src]);

  if (!src || broken) {
    return (
      <div id="pic-preview" className="pic-ini">
        {initials || '?'}
      </div>
    );
  }
  return (
    <img
      id="pic-preview"
      className="pds-photo"
      src={src}
      alt=""
      data-emp-photo=""
      onError={() => setBroken(true)}
    />
  );
}

export function PersonalStep({
  personal,
  patchPersonal,
  patchAddress,
  photoSrc,
  photoInitials,
  onPickPhoto,
}) {
  const p = personal;
  const field = (key) => (value) => patchPersonal({ [key]: value });

  return (
    <>
      <div className="pic-wrap">
        <PhotoPreview src={photoSrc} initials={photoInitials} />
        <label className="pic-lbl needs-write" htmlFor="pic-input">
          Upload Photo
        </label>
        <input
          type="file"
          id="pic-input"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onPickPhoto(file);
            e.target.value = '';
          }}
        />
      </div>

      <div className="form-grid pds-grid-3">
        <TextField label="1. Surname *" value={p.surname} onChange={field('surname')} />
        <TextField label="2. First Name *" value={p.firstName} onChange={field('firstName')} />
        <TextField
          label="Name Extension"
          value={p.nameExtension}
          onChange={field('nameExtension')}
          placeholder="Jr., Sr."
        />
        <TextField label="Middle Name" value={p.middleName} onChange={field('middleName')} />
        <TextField
          label="3. Date of Birth"
          type="date"
          value={p.birthDate}
          onChange={field('birthDate')}
        />
        <TextField
          label="4. Place of Birth"
          value={p.placeOfBirth}
          onChange={field('placeOfBirth')}
        />
        <SelectField label="5. Sex at Birth" value={p.sex} onChange={field('sex')}>
          <option value="">—</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="other">Other</option>
        </SelectField>
        <SelectField label="6. Civil Status" value={p.civilStatus} onChange={field('civilStatus')}>
          <option value="">—</option>
          {CIVIL_STATUSES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Civil Status (if Other)"
          value={p.civilStatusOther}
          onChange={field('civilStatusOther')}
        />
        <TextField label="7. Height (m)" value={p.heightM} onChange={field('heightM')} />
        <TextField label="8. Weight (kg)" value={p.weightKg} onChange={field('weightKg')} />
        <TextField label="9. Blood Type" value={p.bloodType} onChange={field('bloodType')} />
        <TextField
          label="10. GSIS / UMID ID No."
          value={p.gsisUmidNo}
          onChange={field('gsisUmidNo')}
        />
        <TextField label="11. Pag-IBIG ID No." value={p.pagibigNo} onChange={field('pagibigNo')} />
        <TextField
          label="12. PhilHealth No."
          value={p.philhealthNo}
          onChange={field('philhealthNo')}
        />
        <TextField
          label="13. PhilSys Number (PSN)"
          value={p.philsysNo}
          onChange={field('philsysNo')}
        />
        <TextField label="14. TIN No." value={p.tinNo} onChange={field('tinNo')} />
        <TextField
          label="15. Agency Employee No."
          value={p.agencyEmployeeNo}
          onChange={field('agencyEmployeeNo')}
        />
      </div>

      <div className="pds-block">
        <h5>16. Citizenship</h5>
        <div className="form-grid pds-grid-3">
          <TextField label="Citizenship" value={p.citizenship} onChange={field('citizenship')} />
          <SelectField
            label="Dual citizenship?"
            value={String(Boolean(p.dualCitizenship))}
            onChange={(value) => patchPersonal({ dualCitizenship: value === 'true' })}
          >
            <option value="false">No</option>
            <option value="true">Yes</option>
          </SelectField>
          <SelectField
            label="If dual — by birth / naturalization"
            value={p.dualCitizenshipType}
            onChange={field('dualCitizenshipType')}
          >
            <option value="">—</option>
            <option value="by birth">By birth</option>
            <option value="by naturalization">By naturalization</option>
          </SelectField>
          <TextField
            label="Indicate country"
            value={p.dualCitizenshipCountry}
            onChange={field('dualCitizenshipCountry')}
          />
        </div>
      </div>

      <AddressBlock
        title="17. Residential Address"
        address={p.residentialAddress}
        onChange={(patch) => patchAddress('residentialAddress', patch)}
      />

      <div className="fg" style={{ margin: '10px 0' }}>
        <label className="pds-check-label">
          <input
            type="checkbox"
            checked={Boolean(p.sameAsResidential)}
            onChange={(e) => patchPersonal({ sameAsResidential: e.target.checked })}
          />{' '}
          Permanent address same as residential
        </label>
      </div>

      <AddressBlock
        title="18. Permanent Address"
        address={p.permanentAddress}
        disabled={Boolean(p.sameAsResidential)}
        onChange={(patch) => patchAddress('permanentAddress', patch)}
      />

      <div className="form-grid pds-grid-3" style={{ marginTop: 12 }}>
        <TextField label="19. Telephone No." value={p.telephoneNo} onChange={field('telephoneNo')} />
        <TextField label="20. Mobile No." value={p.mobileNo} onChange={field('mobileNo')} />
        <TextField
          label="21. E-mail Address"
          type="email"
          value={p.email}
          onChange={field('email')}
        />
      </div>
    </>
  );
}
