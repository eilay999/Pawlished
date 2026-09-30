import test from 'node:test';
import assert from 'node:assert/strict';
import { isArrivalConfirmationText } from '../api/_lib/arrivalConfirmation.js';
import { safeEqual } from '../api/_lib/safeCompare.js';

test('arrival confirmation accepts typical confirmations', () => {
  for (const text of ['1', ' 1 ', 'כן', 'מאשר', 'מאשרת!', 'מאושר', 'ok', 'OK.', 'נגיע']) {
    assert.equal(isArrivalConfirmationText(text), true, text);
  }
});

test('arrival confirmation ignores other messages', () => {
  for (const text of ['', 'רוצה לבטל', '12', 'כן אבל אפשר לשנות שעה', 'מתי התור?', '0']) {
    assert.equal(isArrivalConfirmationText(text), false, text);
  }
});

test('safeEqual compares strings in constant time and rejects non-strings', () => {
  assert.equal(safeEqual('secret', 'secret'), true);
  assert.equal(safeEqual('secret', 'secreT'), false);
  assert.equal(safeEqual('a', 'ab'), false);
  assert.equal(safeEqual(undefined, 'a'), false);
});

test('invoicing is disabled without INVOICE_START_DATE', async () => {
  process.env.INVOICE_API_URL = 'https://example.invalid/api';
  process.env.INVOICE_API_KEY = 'k';
  delete process.env.INVOICE_START_DATE;
  const mod = await import('../api/_lib/invoices.js?nostart');
  assert.equal(mod.isInvoicingConfigured(), false);
  assert.deepEqual(await mod.issuePendingInvoices(), []);
});

test('invoicing is enabled with a valid INVOICE_START_DATE', async () => {
  process.env.INVOICE_API_URL = 'https://example.invalid/api';
  process.env.INVOICE_API_KEY = 'k';
  process.env.INVOICE_START_DATE = '2026-10-15';
  const mod = await import('../api/_lib/invoices.js?withstart');
  assert.equal(mod.isInvoicingConfigured(), true);
});
