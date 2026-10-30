// Builds inspector controls from a schema-like table and keeps them in sync.

const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null) n.setAttribute(k, v);
  }
  for (const kid of kids) if (kid != null) n.append(kid);
  return n;
};

const fmt = (f, v) => {
  if (f.unit === '°') return `${Math.round(v)}°`;
  if (f.unit === 'm') return `${v.toFixed(2)} m`;
  if (f.step >= 1) return String(Math.round(v));
  if (f.unit === '') return v.toFixed(2);
  return `${v.toFixed(2)}×`;
};

function fill(input) {
  const p = ((input.value - input.min) / (input.max - input.min)) * 100;
  input.style.setProperty('--fill', `${p}%`);
}

/**
 * sections: { [id]: { label, fields: { [key]: field } } }
 * onChange(section, key, value, { final })
 * Returns { update(values) } to push new values into the controls.
 */
export function buildControls(root, sections, onChange, { openFirst = true, idPrefix = 'c' } = {}) {
  root.innerHTML = '';
  const setters = {};
  let first = true;
  for (const [sid, sec] of Object.entries(sections)) {
    const rows = el('div', { class: 'rows' });
    const group = el('details', { class: 'group' }, el('summary', {}, sec.label), rows);
    if (first && openFirst) group.open = true;
    first = false;
    setters[sid] = {};

    if (sid === 'materials') {
      const grid = el('div', { class: 'swatches' });
      for (const [key, f] of Object.entries(sec.fields)) {
        const id = `${idPrefix}-${sid}-${key}`;
        const input = el('input', { type: 'color', id, value: f.default });
        input.addEventListener('input', () => onChange(sid, key, input.value, { final: false }));
        input.addEventListener('change', () => onChange(sid, key, input.value, { final: true }));
        grid.append(el('label', { class: 'swatch', for: id }, input, f.label));
        setters[sid][key] = (v) => { input.value = v; };
      }
      rows.append(grid);
      root.append(group);
      continue;
    }

    for (const [key, f] of Object.entries(sec.fields)) {
      const id = `${idPrefix}-${sid}-${key}`;
      if (f.type === 'number') {
        const out = el('output', { for: id });
        const input = el('input', { type: 'range', id, min: f.min, max: f.max, step: f.step, value: f.default });
        input.addEventListener('input', () => { fill(input); out.textContent = fmt({ ...f, key }, +input.value); onChange(sid, key, +input.value, { final: false }); });
        input.addEventListener('change', () => onChange(sid, key, +input.value, { final: true }));
        input.addEventListener('dblclick', () => { input.value = f.default; input.dispatchEvent(new Event('input')); input.dispatchEvent(new Event('change')); });
        rows.append(el('div', { class: 'row' }, el('label', { for: id }, f.label), out, input));
        setters[sid][key] = (v) => { input.value = v; fill(input); out.textContent = fmt({ ...f, key }, +v); };
      } else if (f.type === 'enum') {
        const chips = el('div', { class: 'chips', role: 'group', 'aria-label': f.label });
        const buttons = f.options.map((opt) => {
          const b = el('button', { type: 'button', 'aria-pressed': 'false' }, opt);
          b.addEventListener('click', () => onChange(sid, key, opt, { final: true }));
          chips.append(b);
          return b;
        });
        rows.append(el('div', { class: 'row' }, el('label', {}, f.label), el('span'), chips));
        setters[sid][key] = (v) => buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.textContent === v)));
      } else if (f.type === 'bool') {
        const input = el('input', { type: 'checkbox', id, role: 'switch' });
        input.addEventListener('change', () => onChange(sid, key, input.checked, { final: true }));
        rows.append(el('div', { class: 'row inline' }, el('label', { for: id }, f.label), el('span', { class: 'switch' }, input, el('span'))));
        setters[sid][key] = (v) => { input.checked = !!v; };
      }
    }
    root.append(group);
  }
  return {
    update(values) {
      for (const [sid, keys] of Object.entries(setters)) {
        for (const [key, set] of Object.entries(keys)) {
          if (values[sid] && values[sid][key] !== undefined) set(values[sid][key]);
        }
      }
    },
  };
}
