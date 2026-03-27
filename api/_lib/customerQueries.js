import { createCustomerFromStructuredInput, normalizeDigits } from './appointments.js';

const CUSTOMER_EXAMPLE =
  'לדוגמה: תוסיף לקוח חדש: שם דני, טלפון 0501234567, שם חיה ריי, סוג פודל';

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const normalizeText = (value = '') =>
  String(value || '')
    .replace(/[“”״]/g, '"')
    .replace(/[’'׳]/g, "'")
    .replace(/[–—־]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const FIELD_LABELS = {
  customerName: ['שם לקוח', 'שם לקוחה', 'שם'],
  phone: ['טלפון', 'נייד', 'פלאפון'],
  petName: ['שם חיה', 'חיה', 'שם הכלב', 'שם הכלבה', 'שם החתול', 'שם החתולה', 'כלב', 'כלבה', 'חתול', 'חתולה'],
  petType: ['סוג', 'גזע', 'זן'],
  notes: ['הערות', 'הערה', 'notes', 'note'],
  defaultPrice: ['מחיר קבוע', 'מחיר']
};

const ALL_LABELS = Array.from(new Set(Object.values(FIELD_LABELS).flat())).sort(
  (left, right) => right.length - left.length
);

const buildFieldRegex = (labels) => {
  const labelPattern = labels.map(escapeRegex).join('|');
  const stopPattern = ALL_LABELS.map(escapeRegex).join('|');
  return new RegExp(
    `(?:^|[\\s,\\n])(?:${labelPattern})\\s*[:\\-]?\\s*(.+?)(?=(?:[\\s,\\n]+|,\\s*)(?:${stopPattern})\\s*[:\\-]?|$)`
  );
};

const extractLabeledValue = (text, labels) => {
  const match = normalizeText(text).match(buildFieldRegex(labels));
  return match?.[1]?.trim() || '';
};

const looksLikeLabeledPrefix = (text = '') =>
  ALL_LABELS.some((label) => normalizeText(text).startsWith(`${label} `) || normalizeText(text).startsWith(`${label}:`));

const extractLeadingName = (text = '') => {
  const safeText = normalizeText(text);
  if (!safeText || looksLikeLabeledPrefix(safeText)) {
    return '';
  }

  const stopPattern = ALL_LABELS.map(escapeRegex).join('|');
  const match = safeText.match(new RegExp(`^(.+?)(?=(?:[\\s,\\n]+|,\\s*)(?:${stopPattern})\\s*[:\\-]?|$)`));
  return match?.[1]?.trim() || '';
};

const extractPhone = (text = '') => {
  const labeledPhone = extractLabeledValue(text, FIELD_LABELS.phone);
  if (labeledPhone) {
    return labeledPhone;
  }

  const match = normalizeText(text).match(/(?:\+972|972|0)\d[\d\s-]{7,}/);
  return match?.[0]?.trim() || '';
};

const parsePrice = (value = '') => {
  const numeric = String(value || '').replace(/[^\d.]/g, '');
  if (!numeric) {
    return undefined;
  }
  const parsed = Number(numeric);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const extractCustomerDetails = (message = '') => {
  const text = normalizeText(message);
  const customerName = extractLabeledValue(text, FIELD_LABELS.customerName) || extractLeadingName(text);
  const phone = extractPhone(text);
  const petName = extractLabeledValue(text, FIELD_LABELS.petName);
  const petType = extractLabeledValue(text, FIELD_LABELS.petType);
  const notes = extractLabeledValue(text, FIELD_LABELS.notes);
  const defaultPrice = parsePrice(extractLabeledValue(text, FIELD_LABELS.defaultPrice));

  return {
    text,
    customerName,
    phone,
    petName,
    petType,
    notes,
    defaultPrice
  };
};

export const parseCustomerQuery = (message) => {
  const text = normalizeText(message);
  const match = text.match(
    /^(?:הוסף|תוסיף|תוסיפי|צור|תיצור|להוסיף|הוספת|תוכל להוסיף|תוכלי להוסיף|אפשר להוסיף)\s+(?:לי\s+)?(?:את\s+)?לקוח(?:ה)?(?:\s+חדש(?:ה)?)?\s*[:\-]?\s*(.*)$/
  );

  if (!match) {
    return null;
  }

  const body = normalizeText(match[1] || '');
  const details = extractCustomerDetails(body);

  return {
    kind: 'customer_query',
    action: 'create',
    text,
    ...details
  };
};

export const mergeCustomerDetails = (base = {}, message = '', preferredMissingFields = []) => {
  const details = extractCustomerDetails(message);
  const merged = {
    ...base,
    ...Object.fromEntries(
      Object.entries(details).filter(([, value]) => value !== '' && value !== undefined && value !== null)
    )
  };

  const normalizedMessage = normalizeText(message);
  const meaningfulText =
    normalizedMessage &&
    !/^[?!.]+$/.test(normalizedMessage) &&
    normalizeDigits(normalizedMessage).length !== normalizedMessage.length;

  if (preferredMissingFields.length === 1 && meaningfulText) {
    const target = preferredMissingFields[0];
    if (target === 'customerName' && !details.customerName) {
      merged.customerName = normalizedMessage;
    } else if (target === 'petName' && !details.petName) {
      merged.petName = normalizedMessage;
    } else if (target === 'petType' && !details.petType) {
      merged.petType = normalizedMessage;
    }
  }

  if (preferredMissingFields.includes('phone') && !merged.phone) {
    const phoneOnly = normalizeDigits(normalizedMessage);
    if (phoneOnly.length >= 9) {
      merged.phone = normalizedMessage;
    }
  }

  return {
    ...merged,
    text: `${String(base.text || '').trim()} ${normalizedMessage}`.trim()
  };
};

export const buildCustomerQueryMissingText = ({ customerName, phone, petName, petType }) => {
  if (!customerName) {
    return `חסר לי שם לקוח. ${CUSTOMER_EXAMPLE}`;
  }

  if (!phone || normalizeDigits(phone).length < 9) {
    return `חסר לי מספר טלפון תקין. ${CUSTOMER_EXAMPLE}`;
  }

  if (!petName) {
    return `חסר לי שם חיית המחמד. ${CUSTOMER_EXAMPLE}`;
  }

  if (!petType) {
    return `חסר לי סוג או גזע של חיית המחמד. ${CUSTOMER_EXAMPLE}`;
  }

  return '';
};

export const buildCustomerSuccessText = (customer) =>
  `הוספתי לקוח חדש: ${customer.name} | ${customer.petName} | ${customer.petType} | ${customer.phone}`;

export const buildCustomerFailureText = (reason = '') => {
  const message = String(reason || '');

  if (message.startsWith('חסר לי')) {
    return message;
  }

  if (message.includes('Missing customer name')) {
    return `חסר לי שם לקוח. ${CUSTOMER_EXAMPLE}`;
  }

  if (message.includes('Missing phone')) {
    return `חסר לי מספר טלפון. ${CUSTOMER_EXAMPLE}`;
  }

  if (message.includes('New customers require petName and petType')) {
    return `כדי לפתוח לקוח חדש אני צריך גם שם חיה וגם סוג או גזע. ${CUSTOMER_EXAMPLE}`;
  }

  if (message.includes('כבר קיים לקוח עם הטלפון הזה')) {
    return message;
  }

  if (message.includes('כבר קיים לקוח בשם')) {
    return message;
  }

  if (message.includes('נמצאו כמה לקוחות בשם הזה')) {
    return 'מצאתי כמה לקוחות בשם הזה. תשלח גם מספר טלפון.';
  }

  return `לא הצלחתי להוסיף את הלקוח החדש. ${message || CUSTOMER_EXAMPLE}`;
};

export const createCustomerFromQuery = async (query) => {
  if (!query?.customerName || !query?.phone || !query?.petName || !query?.petType) {
    throw createHttpError(400, buildCustomerQueryMissingText(query || {}));
  }

  const result = await createCustomerFromStructuredInput({
    customerName: query.customerName,
    phone: query.phone,
    petName: query.petName,
    petType: query.petType,
    notes: query.notes,
    defaultPrice: query.defaultPrice
  });

  return {
    customer: result.customer,
    text: buildCustomerSuccessText(result.customer)
  };
};
