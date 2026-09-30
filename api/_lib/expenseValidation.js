import { EXPENSE_CATEGORIES } from '../../services/reports.js';

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const cleanText = (value, max) => {
  const text = String(value ?? '').trim();
  if (text.length > max) throw createHttpError(400, 'Text too long');
  return text;
};

const cleanDate = (value) => {
  const text = String(value || '');
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const valid =
    match &&
    Number(match[1]) >= 2000 &&
    Number(match[1]) <= 2100 &&
    !Number.isNaN(new Date(`${text}T12:00:00Z`).getTime()) &&
    new Date(`${text}T12:00:00Z`).toISOString().slice(0, 10) === text;
  if (!valid) throw createHttpError(400, 'Invalid date');
  return text;
};

const cleanAmount = (value, { allowZero = false } = {}) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number > 10000000 || number < 0 || (!allowZero && number === 0)) {
    throw createHttpError(400, 'Invalid amount');
  }
  return Math.round((number + Number.EPSILON) * 100) / 100;
};

export const isUuid = (value) => UUID.test(String(value || ''));

export const validateExpense = (input) => {
  if (!input || typeof input !== 'object') throw createHttpError(400, 'Missing expense');
  const category = cleanText(input.category, 60);
  if (!EXPENSE_CATEGORIES.includes(category)) throw createHttpError(400, 'Invalid category');
  const amount = cleanAmount(input.amount);
  const vatAmount = cleanAmount(input.vatAmount ?? 0, { allowZero: true });
  if (vatAmount > amount) throw createHttpError(400, 'VAT exceeds amount');

  const id = input.id ? String(input.id) : undefined;
  if (id && !isUuid(id)) throw createHttpError(400, 'Invalid id');

  const receiptPath = cleanText(input.receiptPath, 200);
  // Receipt files live under "<expense id>/<file>" (created by create_expense_upload_url).
  if (receiptPath && !(id && receiptPath.startsWith(`${id}/`) && !receiptPath.includes('..'))) {
    throw createHttpError(400, 'Invalid receipt path');
  }

  return {
    ...(id ? { id } : {}),
    expense_date: cleanDate(input.date),
    category,
    vendor: cleanText(input.vendor, 120) || null,
    description: cleanText(input.description, 300) || null,
    amount,
    vat_amount: vatAmount,
    receipt_path: receiptPath || null,
    notes: cleanText(input.notes, 500) || null
  };
};

export const validateRefund = (input) => {
  if (!input || typeof input !== 'object') throw createHttpError(400, 'Missing refund');
  const id = input.id ? String(input.id) : undefined;
  if (id && !isUuid(id)) throw createHttpError(400, 'Invalid id');
  return {
    ...(id ? { id } : {}),
    refund_date: cleanDate(input.date),
    appointment_id: cleanText(input.appointmentId, 80) || null,
    customer_name: cleanText(input.customerName, 120) || null,
    amount: cleanAmount(input.amount),
    reason: cleanText(input.reason, 300) || null
  };
};

export const safeFileName = (name) => {
  const base = String(name || 'receipt').replace(/[^A-Za-z0-9._-]/g, '_').replace(/_+/g, '_').slice(-80);
  return base || 'receipt';
};

export const MAX_RECEIPT_BYTES = 3 * 1024 * 1024; // Vercel body limit is 4.5MB and base64 adds ~33%

// Detects the real file type from its first bytes (never trust the file name or the client's type).
export const detectReceiptType = (buffer) => {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { type: 'image/jpeg', ext: 'jpg' };
  if (buffer[0] === 0x89 && buffer.toString('latin1', 1, 4) === 'PNG') return { type: 'image/png', ext: 'png' };
  if (buffer.toString('latin1', 0, 4) === 'RIFF' && buffer.toString('latin1', 8, 12) === 'WEBP') {
    return { type: 'image/webp', ext: 'webp' };
  }
  if (buffer.toString('latin1', 0, 4) === '%PDF') return { type: 'application/pdf', ext: 'pdf' };
  return null;
};
