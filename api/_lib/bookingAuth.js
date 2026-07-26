import crypto from 'crypto';

const TOKEN_TTL_SECONDS = 30 * 60;

const normalizeDigits = (value = '') => String(value || '').replace(/\D/g, '');
const encode = (value) => Buffer.from(value).toString('base64url');
const decode = (value) => Buffer.from(value, 'base64url').toString('utf8');

const getSecret = () => {
  const secret = String(process.env.OTP_SECRET || '').trim();
  if (secret.length < 24) {
    const error = new Error('OTP_SECRET must contain at least 24 characters');
    error.statusCode = 500;
    throw error;
  }
  return secret;
};

const sign = (payload) =>
  crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');

export const createBookingToken = (phone, nowSeconds = Math.floor(Date.now() / 1000)) => {
  const normalizedPhone = normalizeDigits(phone);
  if (!normalizedPhone) {
    const error = new Error('Invalid phone');
    error.statusCode = 400;
    throw error;
  }

  const payload = encode(
    JSON.stringify({
      sub: normalizedPhone,
      iat: nowSeconds,
      exp: nowSeconds + TOKEN_TTL_SECONDS
    })
  );
  return `${payload}.${sign(payload)}`;
};

export const verifyBookingToken = (
  token,
  expectedPhone,
  nowSeconds = Math.floor(Date.now() / 1000)
) => {
  const [payload, signature, extra] = String(token || '').split('.');
  if (!payload || !signature || extra) return null;

  const expectedSignature = sign(payload);
  const left = Buffer.from(signature);
  const right = Buffer.from(expectedSignature);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;

  try {
    const claims = JSON.parse(decode(payload));
    const expected = normalizeDigits(expectedPhone);
    if (!claims.sub || claims.exp < nowSeconds || (expected && claims.sub !== expected)) {
      return null;
    }
    return claims;
  } catch {
    return null;
  }
};

export const requireBookingToken = (req, phone) => {
  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const claims = verifyBookingToken(token, phone);
  if (!claims) {
    const error = new Error('Phone verification required');
    error.statusCode = 401;
    throw error;
  }
  return claims;
};
