import { useEffect, useId, useMemo, useRef, useState } from 'react';

function personLabel(e) {
  return `${e.lastName}, ${e.firstName}`;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function Highlight({ text, terms }) {
  if (!terms.length) return text;
  const re = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'ig');
  return text.split(re).map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="combo-mark">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

/**
 * Searchable employee picker. Click/focus shows the full scrollable list;
 * typing narrows it live. Keyboard: ↑ ↓ Enter Esc.
 */
export function EmployeeCombobox({ employees, value, onChange, placeholder = 'Select employee' }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const selected = employees.find((e) => e.id === value) || null;
  const terms = useMemo(() => query.toLowerCase().split(/[\s,]+/).filter(Boolean), [query]);

  const results = useMemo(() => {
    if (!terms.length) return employees;
    const matched = employees.filter((e) => {
      const hay = `${e.lastName} ${e.firstName} ${e.middleName || ''} ${e.employeeNo || ''}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
    // Surface names / numbers that *start* with the first word before mid-word hits.
    const first = terms[0];
    const rank = (e) =>
      e.lastName.toLowerCase().startsWith(first) ||
      e.firstName.toLowerCase().startsWith(first) ||
      String(e.employeeNo || '').toLowerCase().startsWith(first)
        ? 0
        : 1;
    return matched
      .map((e, i) => [e, i])
      .sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1])
      .map(([e]) => e);
  }, [employees, terms]);

  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, open, results]);

  function openList() {
    if (open) return;
    setQuery('');
    const i = selected ? employees.findIndex((e) => e.id === selected.id) : 0;
    setActive(Math.max(0, i));
    setOpen(true);
  }

  function choose(e) {
    onChange(e.id);
    setOpen(false);
    setQuery('');
  }

  function clear() {
    onChange('');
    setQuery('');
    setActive(0);
    setOpen(true);
    inputRef.current?.focus();
  }

  function onKeyDown(ev) {
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      if (!open) openList();
      else setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (ev.key === 'Enter') {
      if (open) {
        ev.preventDefault();
        if (results[active]) choose(results[active]);
      }
    } else if (ev.key === 'Escape' && open) {
      ev.stopPropagation();
      setOpen(false);
      setQuery('');
    }
  }

  return (
    <div
      className="combo"
      onBlur={(ev) => {
        if (!ev.currentTarget.contains(ev.relatedTarget)) {
          setOpen(false);
          setQuery('');
        }
      }}
    >
      <input
        ref={inputRef}
        type="text"
        className="combo-input"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && results[active] ? `${listId}-${results[active].id}` : undefined}
        autoComplete="off"
        placeholder={open && selected ? personLabel(selected) : placeholder}
        value={open ? query : selected ? personLabel(selected) : ''}
        onFocus={openList}
        onClick={openList}
        onChange={(ev) => {
          setQuery(ev.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      {selected && !open ? (
        <button type="button" className="combo-btn" aria-label="Clear employee" onClick={clear}>
          ✕
        </button>
      ) : (
        <span className="combo-btn combo-caret" aria-hidden="true">
          ▾
        </span>
      )}

      {open && (
        <ul className="combo-list" id={listId} role="listbox" ref={listRef} onMouseDown={(ev) => ev.preventDefault()}>
          {!results.length && <li className="combo-empty">No employees match “{query.trim()}”</li>}
          {results.map((e, i) => (
            <li
              key={e.id}
              id={`${listId}-${e.id}`}
              role="option"
              aria-selected={e.id === value}
              data-active={i === active}
              className={`combo-opt${i === active ? ' active' : ''}${e.id === value ? ' selected' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(e)}
            >
              <span className="combo-name">
                <Highlight text={personLabel(e)} terms={terms} />
              </span>
              {e.employeeNo && (
                <span className="combo-no">
                  <Highlight text={String(e.employeeNo)} terms={terms} />
                </span>
              )}
            </li>
          ))}
          {terms.length > 0 && results.length > 0 && (
            <li className="combo-count" aria-hidden="true">
              {results.length} of {employees.length}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
