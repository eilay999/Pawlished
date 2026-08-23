import crypto from 'crypto';

const otpSecret = (process.env.OTP_SECRET || '').trim();
const otpSessionTtlMin = Number(process.env.OTP_SESSION_TTL_MIN || 20);
const minOtpSecretBytes = Number(process.env.OTP_SECRET_MIN_BYTES || 32);

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const normalizeDigits = (value = '') => String(value || '').replace(/\D/g, '');

const toWhatsAppNumber = (value = '') => {
  const digits = normalizeDigits(value);
  if (!digits) return '';
  if (digits.startsWith('972')) return digits;
  if (digits.startsWith('0')) return `972${digits.slice(1)}`;
  if (value.trim().startsWith('+')) return digits;
  return digits;
};

const signPayload = (payloadBase64Url) =>
  crypto
    .createHmac('sha256', otpSecret)
    .update(`otp_session:${payloadBase64Url}`)
    .digest('base64url');

const timingSafeEqualString = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

export const createOtpSessionToken = (phone) => {
  if (!otpSecret || Buffer.byteLength(otpSecret, 'utf8') < minOtpSecretBytes) {
    throw createHttpError(500, 'OTP_SECRET not configured (or too weak)');
  }

  const waPhone = toWhatsAppNumber(phone);
  if (!waPhone) {
    throw createHttpError(400, 'Invalid phone');
  }

  const ttlMs = (Number.isFinite(otpSessionTtlMin) ? otpSessionTtlMin : 20) * 60 * 1000;
  const payload = {
    v: 1,
    phone: waPhone,
    exp: Date.now() + Math.max(1, ttlMs)
  };

  const payloadBase64Url = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = signPayload(payloadBase64Url);
  return `${payloadBase64Url}.${signature}`;
};

export const verifyOtpSessionToken = (token) => {
  if (!otpSecret || Buffer.byteLength(otpSecret, 'utf8') < minOtpSecretBytes) {
    throw createHttpError(500, 'OTP_SECRET not configured (or too weak)');
  }

  const raw = String(token || '').trim();
  const [payloadBase64Url, signature] = raw.split('.');

  if (!payloadBase64Url || !signature) {
    throw createHttpError(401, 'Missing phone verification token');
  }

  const expected = signPayload(payloadBase64Url);
  if (!timingSafeEqualString(signature, expected)) {
    throw createHttpError(401, 'Invalid phone verification token');
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadBase64Url, 'base64url').toString('utf8'));
  } catch {
    throw createHttpError(401, 'Invalid phone verification token');
  }

  if (!payload || payload.v !== 1 || typeof payload.phone !== 'string' || typeof payload.exp !== 'number') {
    throw createHttpError(401, 'Invalid phone verification token');
  }

  if (Date.now() > payload.exp) {
    throw createHttpError(401, 'Phone verification expired. Please verify again.');
  }

  return {
    phone: payload.phone,
    expiresAt: payload.exp
  };
};

export const getOtpTokenFromRequest = (req) => {
  const headerToken =
    (req?.headers?.['x-otp-token'] || req?.headers?.['x-otp-token'.toLowerCase()]) ??
    null;

  const auth = req?.headers?.authorization || req?.headers?.Authorization || '';
  const bearer = typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')
    ? auth.slice('bearer '.length).trim()
    : null;

  const bodyToken =
    (req?.body && typeof req.body === 'object' ? req.body.otpToken || req.body.otp_token : null) ??
    null;

  return String(headerToken || bearer || bodyToken || '').trim();
};

export const requireOtpSession = (req) => {
  const token = getOtpTokenFromRequest(req);
  if (!token) {
    throw createHttpError(401, 'Phone verification required');
  }
  return verifyOtpSessionToken(token);
};
