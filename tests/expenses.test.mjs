import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeExpense, normalizeRefund, buildExpenseRows, yearlyProfit, expensesToCsv, refundsToCsv,
  profitToCsv, EXPENSE_CATEGORIES, TAX_STATUS
} from '../services/reports.js';
import { validateExpense, validateRefund, safeFileName, detectReceiptType } from '../api/_lib/expenseValidation.js';

const EXEMPT = { taxStatus: TAX_STATUS.EXEMPT, vatRate: 0.18 };
const LICENSED = { taxStatus: TAX_STATUS.LICENSED, vatRate: 0.18 };
const ID = '123e4567-e89b-12d3-a456-426614174000';

const expenses = [
  normalizeExpense({ id: 'e1', expense_date: '2026-03-10', category: 'שכירות', amount: '1180', vat_amount: '180' }),
  normalizeExpense({ id: 'e2', expense_date: '2026-03-20', category: 'אחר', amount: 100 }),
  normalizeExpense({ id: 'e3', expense_date: '2025-12-31', category: 'אחר', amount: 50 })
];
const refunds = [normalizeRefund({ id: 'r1', refund_date: '2026-03-15', amount: 59, customer_name: '=cmd' })];
const appointments = [{ id: 'a1', customerId: 'c', date: '2026-03-05T09:00:00Z', status: 'COMPLETED', price: 1180, service: 's' }];

test('date-only values do not shift a day', () => {
  assert.equal(expenses[2].date.getFullYear(), 2025);
  assert.equal(expenses[2].date.getDate(), 31);
});

test('expense rows filter by range and sort', () => {
  const rows = buildExpenseRows({ expenses, from: new Date(2026, 0, 1), to: new Date(2026, 11, 31, 23, 59) });
  assert.deepEqual(rows.map((r) => r.id), ['e1', 'e2']);
});

test('yearly profit: exempt dealer', () => {
  const { months, totals } = yearlyProfit({ appointments, customers: [], expenses, refunds, year: 2026, tax: EXEMPT });
  assert.equal(months[2].income, 1180);
  assert.equal(months[2].refunds, 59);
  assert.equal(months[2].expenses, 1280);
  assert.equal(months[2].profit, -159);
  assert.equal(totals.profit, -159);
});

test('yearly profit: licensed dealer works on net amounts', () => {
  const { totals } = yearlyProfit({ appointments, customers: [], expenses, refunds, year: 2026, tax: LICENSED });
  // income 1000 net, refund 50 net, expenses (1180-180)+100 = 1100
  assert.deepEqual(totals, { income: 1000, refunds: 50, expenses: 1100, profit: -150 });
});

test('CSV exports neutralise formulas', () => {
  assert.ok(refundsToCsv(refunds).includes("\"'=cmd\""));
  assert.ok(expensesToCsv(expenses).startsWith('﻿'));
  assert.ok(profitToCsv(yearlyProfit({ appointments, customers: [], expenses, refunds, year: 2026, tax: EXEMPT }), 2026).includes('סה""כ'));
});

test('expense validation accepts good input and rejects bad input', () => {
  const ok = validateExpense({ date: '2026-03-10', category: EXPENSE_CATEGORIES[0], amount: '120.555', vatAmount: 10, vendor: ' ספק ' });
  assert.equal(ok.amount, 120.56); assert.equal(ok.vendor, 'ספק');
  assert.throws(() => validateExpense({ date: '2026-02-31', category: 'אחר', amount: 5 }), /Invalid date/);
  assert.throws(() => validateExpense({ date: '2026-03-10', category: 'hack', amount: 5 }), /Invalid category/);
  assert.throws(() => validateExpense({ date: '2026-03-10', category: 'אחר', amount: -5 }), /Invalid amount/);
  assert.throws(() => validateExpense({ date: '2026-03-10', category: 'אחר', amount: 5, vatAmount: 6 }), /VAT exceeds/);
  assert.throws(() => validateExpense({ id: 'nope', date: '2026-03-10', category: 'אחר', amount: 5 }), /Invalid id/);
});

test('receipt paths must belong to the expense', () => {
  const good = validateExpense({ id: ID, date: '2026-03-10', category: 'אחר', amount: 5, receiptPath: `${ID}/1-x.pdf` });
  assert.equal(good.receipt_path, `${ID}/1-x.pdf`);
  assert.throws(() => validateExpense({ id: ID, date: '2026-03-10', category: 'אחר', amount: 5, receiptPath: 'other/x.pdf' }), /receipt path/);
  assert.throws(() => validateExpense({ id: ID, date: '2026-03-10', category: 'אחר', amount: 5, receiptPath: `${ID}/../x` }), /receipt path/);
  assert.throws(() => validateExpense({ date: '2026-03-10', category: 'אחר', amount: 5, receiptPath: `${ID}/x.pdf` }), /receipt path/);
});

test('refund validation and file name sanitising', () => {
  assert.equal(validateRefund({ date: '2026-03-15', amount: 59 }).amount, 59);
  assert.throws(() => validateRefund({ date: '2026-03-15', amount: 0 }), /Invalid amount/);
  assert.ok(!safeFileName('../../etc/passwd').includes('/'));
  assert.ok(/^[A-Za-z0-9._-]+$/.test(safeFileName('../../א ב.pdf')));
  assert.equal(safeFileName(''), 'receipt');
});

test('receipt type is detected from the file bytes, not the name', () => {
  assert.equal(detectReceiptType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))?.type, 'image/jpeg');
  assert.equal(detectReceiptType(Buffer.from('%PDF-1.7 rest of file'))?.type, 'application/pdf');
  assert.equal(detectReceiptType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]))?.type, 'image/png');
  assert.equal(detectReceiptType(Buffer.from('RIFF\0\0\0\0WEBPxxxx', 'latin1'))?.type, 'image/webp');
  assert.equal(detectReceiptType(Buffer.from('<script>alert(1)</script>')), null);
  assert.equal(detectReceiptType(Buffer.from('MZ\x90\x00 exe file bytes here')), null);
  assert.equal(detectReceiptType(Buffer.alloc(3)), null);
});
