// Receipts/revenue report logic (pure functions, unit tested in tests/reports.test.mjs).
// Amounts are gross (what the customer pays). For a licensed dealer (LICENSED) the gross includes VAT.

export const TAX_STATUS = { EXEMPT: 'EXEMPT', LICENSED: 'LICENSED' };

export const DEFAULT_TAX_SETTINGS = { taxStatus: 'EXEMPT', vatRate: 0.18, exemptCeiling: 120000 };

export const BUSINESS_PROFILE = {
  name: 'Pawlished',
  taxId: '327575445',
  address: 'הגלים 6, ראשון לציון'
};

const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export const normalizeTaxSettings = (rows) => {
  const map = {};
  if (Array.isArray(rows)) {
    rows.forEach((row) => {
      if (row && typeof row.key === 'string') map[row.key] = row.value;
    });
  }
  const vat = Number(map.vat_rate);
  const ceiling = Number(map.exempt_ceiling);
  return {
    taxStatus: map.tax_status === TAX_STATUS.LICENSED ? TAX_STATUS.LICENSED : TAX_STATUS.EXEMPT,
    vatRate: Number.isFinite(vat) && vat >= 0 && vat <= 0.3 ? vat : DEFAULT_TAX_SETTINGS.vatRate,
    exemptCeiling: Number.isFinite(ceiling) && ceiling > 0 ? ceiling : DEFAULT_TAX_SETTINGS.exemptCeiling
  };
};

export const splitVat = (gross, tax) => {
  const total = round2(gross);
  if (!tax || tax.taxStatus !== TAX_STATUS.LICENSED) return { gross: total, net: total, vat: 0 };
  const net = round2(total / (1 + tax.vatRate));
  return { gross: total, net, vat: round2(total - net) };
};

const toDate = (value) => (value instanceof Date ? value : new Date(value));

// Income lines: completed treatments (price) and collected cancellation fees.
export const buildReceiptRows = ({ appointments = [], customers = [], dogs = [], from, to, tax }) => {
  const customerById = new Map(customers.map((customer) => [customer.id, customer]));
  const dogById = new Map(dogs.map((dog) => [dog.id, dog]));
  const start = from ? toDate(from).getTime() : -Infinity;
  const end = to ? toDate(to).getTime() : Infinity;
  const rows = [];

  appointments.forEach((appointment) => {
    const date = toDate(appointment.date);
    const time = date.getTime();
    if (Number.isNaN(time) || time < start || time > end) return;

    let amount = 0;
    let kind = '';
    if (appointment.status === 'COMPLETED' && Number(appointment.price) > 0) {
      amount = Number(appointment.price);
      kind = 'טיפול';
    } else if (appointment.status === 'CANCELLED' && Number(appointment.cancellationFee) > 0) {
      amount = Number(appointment.cancellationFee);
      kind = 'דמי ביטול';
    }
    if (!amount) return;

    const customer = customerById.get(appointment.customerId);
    const dog = appointment.dogId ? dogById.get(appointment.dogId) : undefined;
    const vat = splitVat(amount, tax);
    rows.push({
      id: appointment.id,
      date,
      customerName: customer?.name || '',
      dogName: dog?.name || customer?.petName || '',
      description: kind === 'טיפול' ? appointment.service || 'טיפול' : kind,
      kind,
      ...vat,
      deposit: appointment.depositPaidAt ? Number(appointment.depositAmount) || 0 : 0,
      receiptNumber: appointment.invoiceNumber || '',
      receiptUrl: appointment.invoiceUrl || '',
      hasReceipt: Boolean(appointment.invoiceIssuedAt || appointment.invoiceNumber)
    });
  });

  return rows.sort((a, b) => a.date.getTime() - b.date.getTime());
};

export const summarizeRows = (rows) => {
  const total = rows.reduce(
    (acc, row) => ({
      gross: round2(acc.gross + row.gross),
      net: round2(acc.net + row.net),
      vat: round2(acc.vat + row.vat)
    }),
    { gross: 0, net: 0, vat: 0 }
  );
  return { ...total, count: rows.length, withoutReceipt: rows.filter((row) => !row.hasReceipt).length };
};

// Revenue of the last 365 days up to `now` (for the exempt-dealer ceiling).
export const trailingTurnover = ({ appointments, now = new Date() }) => {
  const end = toDate(now).getTime();
  const start = end - 365 * 24 * 60 * 60 * 1000;
  const rows = buildReceiptRows({ appointments, from: new Date(start), to: new Date(end), tax: null });
  return summarizeRows(rows).gross;
};

export const ceilingStatus = (turnover, ceiling) => {
  const safeCeiling = Number(ceiling) > 0 ? Number(ceiling) : DEFAULT_TAX_SETTINGS.exemptCeiling;
  const percent = Math.round((turnover / safeCeiling) * 100);
  return {
    percent,
    remaining: round2(Math.max(0, safeCeiling - turnover)),
    level: turnover >= safeCeiling ? 'over' : percent >= 80 ? 'warn' : 'ok'
  };
};

export const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// Neutralises spreadsheet formulas in user-controlled text (customer names come from the public form).
const csvCell = (value) => {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

const formatDate = (date) =>
  new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);

export const rowsToCsv = (rows, tax) => {
  const licensed = tax?.taxStatus === TAX_STATUS.LICENSED;
  const header = ['תאריך', 'לקוח', 'כלב', 'תיאור', 'סכום', ...(licensed ? ['לפני מע"מ', 'מע"מ'] : []), 'מקדמה ששולמה', 'מספר מסמך', 'מסמך הופק'];
  const lines = [header.map(csvCell).join(',')];
  rows.forEach((row) => {
    lines.push(
      [
        formatDate(row.date),
        row.customerName,
        row.dogName,
        row.description,
        row.gross.toFixed(2),
        ...(licensed ? [row.net.toFixed(2), row.vat.toFixed(2)] : []),
        row.deposit ? row.deposit.toFixed(2) : '',
        row.receiptNumber,
        row.hasReceipt ? 'כן' : 'לא'
      ]
        .map(csvCell)
        .join(',')
    );
  });
  // BOM so Excel opens Hebrew correctly.
  return `﻿${lines.join('\r\n')}\r\n`;
};

export const buildPrintableHtml = ({ rows, tax, fromLabel, toLabel, profile = BUSINESS_PROFILE }) => {
  const licensed = tax?.taxStatus === TAX_STATUS.LICENSED;
  const totals = summarizeRows(rows);
  const money = (value) => escapeHtml(Number(value).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const body = rows
    .map(
      (row) => `<tr>
<td>${escapeHtml(formatDate(row.date))}</td>
<td>${escapeHtml(row.customerName)}</td>
<td>${escapeHtml(row.dogName)}</td>
<td>${escapeHtml(row.description)}</td>
<td class="n">${money(row.gross)}</td>
${licensed ? `<td class="n">${money(row.net)}</td><td class="n">${money(row.vat)}</td>` : ''}
<td>${escapeHtml(row.receiptNumber || (row.hasReceipt ? 'הופקה' : 'לא הופקה'))}</td>
</tr>`
    )
    .join('\n');
  const statusLabel = licensed ? 'עוסק מורשה' : 'עוסק פטור';
  return `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><title>דוח קבלות ${escapeHtml(fromLabel)} - ${escapeHtml(toLabel)}</title>
<style>
body{font-family:Arial,sans-serif;margin:24px;color:#111}
h1{font-size:20px;margin:0 0 4px}
.meta{color:#444;font-size:13px;margin-bottom:16px}
table{width:100%;border-collapse:collapse;font-size:12px}
th,td{border:1px solid #bbb;padding:5px 6px;text-align:right}
th{background:#f0f0f0}
td.n{text-align:left;direction:ltr}
tfoot td{font-weight:bold;background:#fafafa}
@media print{body{margin:10mm}}
</style></head><body>
<h1>דוח קבלות והכנסות</h1>
<div class="meta">${escapeHtml(profile.name)} · ${escapeHtml(statusLabel)} ${escapeHtml(profile.taxId)} · ${escapeHtml(profile.address)}<br>
תקופה: ${escapeHtml(fromLabel)} עד ${escapeHtml(toLabel)} · ${totals.count} רשומות${totals.withoutReceipt ? ` · ${totals.withoutReceipt} ללא מסמך` : ''}</div>
<table><thead><tr><th>תאריך</th><th>לקוח</th><th>כלב</th><th>תיאור</th><th>סכום</th>${licensed ? '<th>לפני מע"מ</th><th>מע"מ</th>' : ''}<th>מסמך</th></tr></thead>
<tbody>${body}</tbody>
<tfoot><tr><td colspan="4">סה"כ</td><td class="n">${money(totals.gross)}</td>${licensed ? `<td class="n">${money(totals.net)}</td><td class="n">${money(totals.vat)}</td>` : ''}<td></td></tr></tfoot></table>
${licensed ? '' : '<p class="meta">העסק פטור ממע"מ. הסכומים ללא מע"מ.</p>'}
</body></html>`;
};

export const availableYears = (appointments, now = new Date()) => {
  const currentYear = toDate(now).getFullYear();
  let first = currentYear;
  appointments.forEach((appointment) => {
    const year = toDate(appointment.date).getFullYear();
    if (Number.isFinite(year) && year < first) first = year;
  });
  const years = [];
  for (let year = currentYear; year >= first; year -= 1) years.push(year);
  return years;
};

// One row per month (1-12) of the given calendar year.
export const monthlySummary = ({ appointments = [], customers = [], dogs = [], year, tax }) => {
  const rows = buildReceiptRows({
    appointments,
    customers,
    dogs,
    from: new Date(year, 0, 1, 0, 0, 0, 0),
    to: new Date(year, 11, 31, 23, 59, 59, 999),
    tax
  });
  const months = Array.from({ length: 12 }, (_, index) => ({ month: index + 1, rows: [] }));
  rows.forEach((row) => months[row.date.getMonth()].rows.push(row));
  return months.map(({ month, rows: monthRows }) => ({ month, ...summarizeRows(monthRows) }));
};
