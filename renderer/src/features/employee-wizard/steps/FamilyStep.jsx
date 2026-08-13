import {
  AddRowButton,
  EmptyRows,
  PersonNameFields,
  RemoveRowButton,
  TextField,
} from './Fields.jsx';

export function emptyChild() {
  return { name: '', dateOfBirth: '' };
}

export function FamilyStep({ family, patchSpouse, patchFather, patchMother, setChildren }) {
  const f = family;
  const children = f.children || [];

  const patchChild = (index, patch) =>
    setChildren(children.map((c, i) => (i === index ? { ...c, ...patch } : c)));

  return (
    <div className="pds-two-col">
      <div>
        <div className="pds-block">
          <h5>22. Spouse&apos;s Information</h5>
          <PersonNameFields person={f.spouse} onChange={patchSpouse} />
          <div className="form-grid">
            <TextField
              label="Occupation"
              value={f.spouse.occupation}
              onChange={(value) => patchSpouse({ occupation: value })}
            />
            <TextField
              label="Employer/Business Name"
              value={f.spouse.employer}
              onChange={(value) => patchSpouse({ employer: value })}
            />
            <TextField
              label="Business Address"
              full
              value={f.spouse.businessAddress}
              onChange={(value) => patchSpouse({ businessAddress: value })}
            />
            <TextField
              label="Telephone No."
              value={f.spouse.telephoneNo}
              onChange={(value) => patchSpouse({ telephoneNo: value })}
            />
          </div>
        </div>
        <div className="pds-block">
          <h5>24. Father&apos;s Name</h5>
          <PersonNameFields person={f.father} onChange={patchFather} />
        </div>
        <div className="pds-block">
          <h5>25. Mother&apos;s Maiden Name</h5>
          <PersonNameFields person={f.mother} onChange={patchMother} />
        </div>
      </div>
      <div className="pds-block">
        <div className="pds-block-head">
          <h5>23. Name of Children</h5>
          <AddRowButton onClick={() => setChildren([...children, emptyChild()])}>
            Add child
          </AddRowButton>
        </div>
        <div id="pds-children-list" className="pds-rows">
          {children.length === 0 ? (
            <EmptyRows>No children listed.</EmptyRows>
          ) : (
            children.map((c, i) => (
              <div className="pds-row" key={i}>
                <TextField
                  label="Full name"
                  value={c.name}
                  onChange={(value) => patchChild(i, { name: value })}
                />
                <TextField
                  label="Date of birth"
                  type="date"
                  value={c.dateOfBirth}
                  onChange={(value) => patchChild(i, { dateOfBirth: value })}
                />
                <RemoveRowButton
                  title="Remove"
                  onClick={() => setChildren(children.filter((_, idx) => idx !== i))}
                >
                  ×
                </RemoveRowButton>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
