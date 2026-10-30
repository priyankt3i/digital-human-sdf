// Design source text <-> design object.
// A design file is an ES module with `export default { ... }`. In the browser
// we evaluate it with Function(); sliders rewrite literals in place so your
// comments and extend() code are preserved.

export function evaluateSource(text) {
  if (!/export\s+default/.test(text)) throw new Error('A design must contain `export default { ... }`.');
  if (/^\s*import\s/m.test(text)) throw new Error('Imports are not supported in the in-browser editor. Use the extend(h, rig, util) helpers instead.');
  const body = text.replace(/export\s+default/, 'return ');
  // eslint-disable-next-line no-new-func
  const value = new Function(`"use strict";\n${body}`)();
  if (!value || typeof value !== 'object') throw new Error('export default must be an object.');
  return value;
}

function literal(v) {
  if (typeof v === 'number') return String(+v.toFixed(4));
  if (typeof v === 'boolean') return String(v);
  return `'${String(v).replace(/'/g, "\\'")}'`;
}

/** Find the `{ ... }` body of `section: {` at the top level of the default export. */
function findSection(text, section) {
  const re = new RegExp(`(^|[\\s,{])${section}\\s*:\\s*\\{`, 'g');
  const m = re.exec(text);
  if (!m) return null;
  const open = m.index + m[0].length - 1;
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return { open, close: i }; }
  }
  return null;
}

/** Return new source text with design[section][key] = value. */
export function setSourceValue(text, section, key, value) {
  const lit = literal(value);
  const sec = findSection(text, section);
  if (!sec) {
    // add a new section right after `export default {`
    const m = /export\s+default\s*\{/.exec(text);
    if (!m) return text;
    const at = m.index + m[0].length;
    return `${text.slice(0, at)}\n  ${section}: { ${key}: ${lit} },${text.slice(at)}`;
  }
  const inner = text.slice(sec.open + 1, sec.close);
  const keyRe = new RegExp(`(\\b${key}\\s*:\\s*)('(?:[^'\\\\]|\\\\.)*'|"(?:[^"\\\\]|\\\\.)*"|true|false|-?\\d*\\.?\\d+(?:e-?\\d+)?)`);
  let next;
  if (keyRe.test(inner)) {
    next = inner.replace(keyRe, (_, k) => k + lit);
  } else {
    const trimmed = inner.replace(/\s+$/, '');
    const multiline = inner.includes('\n');
    const sep = trimmed.trim() === '' ? '' : trimmed.endsWith(',') ? '' : ',';
    next = multiline
      ? `${trimmed}${sep}\n    ${key}: ${lit},\n  `
      : `${trimmed}${sep} ${key}: ${lit} `;
  }
  return text.slice(0, sec.open + 1) + next + text.slice(sec.close);
}

/** Serialize a plain design (no extend) to tidy source. */
export function designToSource(design, schema) {
  const lines = ['export default {', `  name: ${literal(design.name || 'Untitled human')},`];
  for (const [section] of Object.entries(schema)) {
    const vals = design[section];
    if (!vals) continue;
    lines.push('', `  ${section}: {`);
    for (const [k, v] of Object.entries(vals)) lines.push(`    ${k}: ${literal(v)},`);
    lines.push('  },');
  }
  lines.push('};', '');
  return lines.join('\n');
}
