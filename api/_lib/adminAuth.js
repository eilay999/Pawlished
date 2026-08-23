import { requireOtpSession } from './otpSession.js';

const normalizeDigits = (value = '') => String(value || '').replace(/\D/g, '');

const toWhatsAppNumber = (value = '') => {
  const digits = normalizeDigits(value);
  if (!digits) return '';
  if (digits.startsWith('972')) return digits;
  if (digits.startsWith('0')) return `972${digits.slice(1)}`;
  if (String(value || '').trim().startsWith('+')) return digits;
  return digits;
};

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const parseAdminPhones = () => {
  const raw = String(process.env.ADMIN_PHONES || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const set = new Set();
  raw.forEach((phone) => {
    const normalized = toWhatsAppNumber(phone);
    if (normalized) set.add(normalized);
  });

  return set;
};

export const requireAdminSession = (req) => {
  const session = requireOtpSession(req);
  const allowedPhones = parseAdminPhones();

  if (allowedPhones.size === 0) {
    throw createHttpError(500, 'ADMIN_PHONES not configured');
  }

  if (!allowedPhones.has(session.phone)) {
    throw createHttpError(403, 'Admin access only');
  }

  return session;
};

