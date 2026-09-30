import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeTaxSettings, splitVat, buildReceiptRows, summarizeRows, trailingTurnover,
  ceilingStatus, rowsToCsv, buildPrintableHtml, escapeHtml, TAX_STATUS, monthlySummary, availableYears
} from '../services/reports.js';

const LICENSED = { taxStatus: TAX_STATUS.LICENSED, vatRate: 0.18, exemptCeiling: 120000 };
const EXEMPT = { taxStatus: TAX_STATUS.EXEMPT, vatRate: 0.18, exemptCeiling: 120000 };

const customers = [{ id: 'c1', name: 'דנה', petName: 'לוקי' }, { id: 'c2', name: '=HYPERLINK("http://evil")', petName: '<b>x</b>' }];
const appts = [
  { id: 'a1', customerId: 'c1', date: '2026-09-10T08:00:00Z', service: 'תספורת', status: 'COMPLETED', price: 236, invoiceNumber: '1001', invoiceIssuedAt: '2026-09-10' },
  { id: 'a2', customerId: 'c2', date: '2026-09-11T08:00:00Z', service: 'תספורת', status: 'COMPLETED', price: 118 },
  { id: 'a3', customerId: 'c1', date: '2026-09-12T08:00:00Z', service: 'x', status: 'CANCELLED', price: 240, cancellationFee: 50 },
  { id: 'a4', customerId: 'c1', date: '2026-09-13T08:00:00Z', service: 'x', status: 'SCHEDULED', price: 240 },
  { id: 'a5', customerId: 'c1', date: '2025-01-01T08:00:00Z', service: 'x', status: 'COMPLETED', price: 500 }
];

test('settings default to exempt and sanitise bad values', () => {
  assert.deepEqual(normalizeTaxSettings([]), { taxStatus: 'EXEMPT', vatRate: 0.18, exemptCeiling: 120000 });
  const s = normalizeTaxSettings([{ key: 'tax_status', value: 'LICENSED' }, { key: 'vat_rate', value: 5 }, { key: 'exempt_ceiling', value: -1 }]);
  assert.equal(s.taxStatus, 'LICENSED'); assert.equal(s.vatRate, 0.18); assert.equal(s.exemptCeiling, 120000);
  assert.equal(normalizeTaxSettings([{ key: 'tax_status', value: 'hacker' }]).taxStatus, 'EXEMPT');
});

test('VAT is split only for licensed dealers', () => {
  assert.deepEqual(splitVat(118, LICENSED), { gross: 118, net: 100, vat: 18 });
  assert.deepEqual(splitVat(118, EXEMPT), { gross: 118, net: 118, vat: 0 });
});

test('rows include completed treatments and cancellation fees only, inside the range', () => {
  const rows = buildReceiptRows({ appointments: appts, customers, from: '2026-09-01', to: '2026-09-30', tax: EXEMPT });
  assert.deepEqual(rows.map((r) => r.id), ['a1', 'a2', 'a3']);
  assert.equal(rows[2].gross, 50); assert.equal(rows[2].description, 'דמי ביטול');
  const totals = summarizeRows(rows);
  assert.equal(totals.gross, 404); assert.equal(totals.count, 3); assert.equal(totals.withoutReceipt, 2);
});

test('licensed totals add up', () => {
  const rows = buildReceiptRows({ appointments: appts.slice(0, 2), customers, tax: LICENSED, from: '2026-09-01', to: '2026-09-30' });
  assert.deepEqual(summarizeRows(rows), { gross: 354, net: 300, vat: 54, count: 2, withoutReceipt: 1 });
});

test('turnover ceiling warns at 80% and flags when exceeded', () => {
  assert.equal(ceilingStatus(50000, 120000).level, 'ok');
  assert.equal(ceilingStatus(100000, 120000).level, 'warn');
  assert.equal(ceilingStatus(120000, 120000).level, 'over');
  assert.equal(ceilingStatus(90000, 120000).remaining, 30000);
  assert.equal(trailingTurnover({ appointments: appts, now: new Date('2026-09-30T00:00:00Z') }), 404);
});

test('CSV neutralises formulas and quotes cells', () => {
  const rows = buildReceiptRows({ appointments: appts, customers, from: '2026-09-01', to: '2026-09-30', tax: EXEMPT });
  const csv = rowsToCsv(rows, EXEMPT);
  assert.ok(csv.startsWith('﻿'));
  assert.ok(csv.includes('"\'=HYPERLINK(""http://evil"")"'));
  assert.ok(!csv.includes(',=HYPERLINK'));
});

test('printable HTML escapes user text', () => {
  const rows = buildReceiptRows({ appointments: appts, customers, from: '2026-09-01', to: '2026-09-30', tax: EXEMPT });
  const html = buildPrintableHtml({ rows, tax: EXEMPT, fromLabel: '1.9', toLabel: '30.9' });
  assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt;') || !html.includes('<b>x</b>'));
  assert.ok(!html.includes('<b>x</b>'));
  assert.ok(html.includes('עוסק פטור'));
  assert.equal(escapeHtml('<a href="x">&'), '&lt;a href=&quot;x&quot;&gt;&amp;');
});

test('yearly summary has 12 months and the totals match the rows', () => {
  const months = monthlySummary({ appointments: appts, customers, year: 2026, tax: EXEMPT });
  assert.equal(months.length, 12);
  assert.equal(months[8].gross, 404); // September
  assert.equal(months[8].count, 3);
  assert.equal(months.reduce((sum, m) => sum + m.gross, 0), 404);
  assert.equal(monthlySummary({ appointments: appts, customers, year: 2025, tax: EXEMPT })[0].gross, 500);
});

test('available years run from the first appointment to the current year', () => {
  assert.deepEqual(availableYears(appts, new Date('2026-10-01')), [2026, 2025]);
  assert.deepEqual(availableYears([], new Date('2026-10-01')), [2026]);
});
