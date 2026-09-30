// Minimal in-memory stand-in for the parts of supabase-js the API uses (tests only).
import crypto from 'crypto';

const likeToRegex = (pattern) =>
  new RegExp(`^${String(pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.')}$`, 'i');

export const createFakeSupabase = (tables = {}) => {
  const db = Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.map((row) => ({ ...row }))]));

  const from = (name) => {
    db[name] ||= [];
    const filters = [];
    let op = 'select';
    let payload = null;
    let limit = Infinity;
    let head = false;
    let wantCount = false;
    let single = null;
    let order = null;

    const matches = (row) => filters.every((f) => f(row));
    const builder = {
      select(_cols, opts) {
        if (opts?.count) wantCount = true;
        if (opts?.head) head = true;
        return builder;
      },
      insert(rows) { op = 'insert'; payload = Array.isArray(rows) ? rows : [rows]; return builder; },
      upsert(rows) { op = 'upsert'; payload = Array.isArray(rows) ? rows : [rows]; return builder; },
      update(values) { op = 'update'; payload = values; return builder; },
      delete() { op = 'delete'; return builder; },
      eq(col, val) { filters.push((r) => r[col] === val); return builder; },
      neq(col, val) { filters.push((r) => r[col] !== val); return builder; },
      is(col, val) { filters.push((r) => (val === null ? r[col] == null : r[col] === val)); return builder; },
      in(col, vals) { filters.push((r) => vals.includes(r[col])); return builder; },
      gt(col, val) { filters.push((r) => r[col] > val); return builder; },
      gte(col, val) { filters.push((r) => r[col] >= val); return builder; },
      lt(col, val) { filters.push((r) => r[col] < val); return builder; },
      lte(col, val) { filters.push((r) => r[col] <= val); return builder; },
      ilike(col, pattern) { const re = likeToRegex(pattern); filters.push((r) => re.test(String(r[col] ?? ''))); return builder; },
      or(expr) {
        const parts = String(expr).split(',').map((p) => p.split('.'));
        filters.push((r) => parts.some(([col, fn, ...rest]) => fn === 'ilike' && likeToRegex(rest.join('.')).test(String(r[col] ?? ''))));
        return builder;
      },
      contains(col, obj) { filters.push((r) => Object.entries(obj).every(([k, v]) => r[col]?.[k] === v)); return builder; },
      order(col, opts) { order = { col, asc: opts?.ascending !== false }; return builder; },
      limit(n) { limit = n; return builder; },
      maybeSingle() { single = 'maybe'; return builder; },
      single() { single = 'one'; return builder; },
      then(resolve, reject) {
        try { resolve(run()); } catch (error) { reject?.(error); }
      }
    };

    const run = () => {
      let rows;
      if (op === 'insert' || op === 'upsert') {
        rows = payload.map((row) => ({ id: crypto.randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...row }));
        db[name].push(...rows);
      } else if (op === 'update') {
        rows = db[name].filter(matches);
        rows.forEach((row) => Object.assign(row, payload));
      } else if (op === 'delete') {
        rows = db[name].filter(matches);
        db[name] = db[name].filter((row) => !rows.includes(row));
      } else {
        rows = db[name].filter(matches);
      }
      if (order) rows = [...rows].sort((a, b) => (a[order.col] > b[order.col] ? 1 : -1) * (order.asc ? 1 : -1));
      const total = rows.length;
      rows = rows.slice(0, limit).map((row) => ({ ...row }));
      if (head) return { data: null, error: null, count: total };
      const count = wantCount ? total : null;
      if (single === 'maybe') return { data: rows[0] ?? null, error: null, count };
      if (single === 'one') return rows[0] ? { data: rows[0], error: null, count } : { data: null, error: { message: 'no rows' }, count };
      return { data: rows, error: null, count };
    };
    return builder;
  };

  return { client: { from, storage: {} }, db };
};
