import { createCustomerFromStructuredInput, normalizeDigits } from './appointments.js';

const CUSTOMER_EXAMPLE =
  'לדוגמה: לקוח חדש: שם לקוח דני כהן, טלפון 0501234567, שם חיה ריי, סוג פודל, מחיר 250, תדירות 6 שבועות';

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

const normalizeLines = (value = '') =>
  String(value || '')
    .split(/\r?\n/)
    .map((line) => normalizeText(line))
    .filter(Boolean);

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const FIELD_LABELS = {
  customerName: ['שם לקוח', 'שם לקוחה', 'שם בעלים', 'לקוח בשם', 'לקוחה בשם'],
  phone: ['טלפון', 'נייד', 'פלאפון', 'מספר טלפון', 'מספר'],
  petName: [
    'שם חיה',
    'שם חיית מחמד',
    'שם הכלב',
    'שם כלב',
    'שם הכלבה',
    'שם החתול',
    'שם חתול',
    'שם החתולה',
    'חיה',
    'כלב',
    'כלבה',
    'חתול',
    'חתולה'
  ],
  petType: ['סוג כלב', 'סוג חיה', 'סוג', 'גזע', 'זן'],
  notes: ['הערות לקוח', 'הערות', 'הערה', 'מידע נוסף', 'רגישות', 'רגישויות'],
  defaultPrice: ['מחיר קבוע', 'מחיר', 'עלות'],
  visitFrequencyWeeks: ['תדירות', 'כל כמה שבועות', 'חוזר כל', 'חוזרת כל'],
  lifecycleStatus: ['סטטוס', 'מצב']
};

const ALL_BOUNDARY_LABELS = [
  ...Object.values(FIELD_LABELS).flat(),
  'שם',
  'ביקור אחרון',
  'תור אחרון',
  'לקוח חדש',
  'לקוחה חדשה'
].sort((left, right) => right.length - left.length);

const STOP_PATTERN = ALL_BOUNDARY_LABELS.map(escapeRegex).join('|');

const cleanValue = (value = '') =>
  normalizeText(value)
    .replace(/^[\s,:=-]+/, '')
    .replace(/[\s,;]+$/, '')
    .trim();

const buildValueRegex = (labels, flags = 'u') => {
  const labelsPattern = labels.map(escapeRegex).join('|');
  return new RegExp(
    `(?:^|[\\s,;\\n])(?:${labelsPattern})\\s*[:=-]?\\s*(.+?)(?=(?:[\\s,;\\n]+)(?:${STOP_PATTERN})\\s*[:=-]?|$)`,
    flags
  );
};

const extractBoundedValue = (text, labels) => {
  const match = normalizeText(text).match(buildValueRegex(labels));
  return cleanValue(match?.[1] || '');
};

const extractCustomerNameByGenericName = (text) => {
  const match = normalizeText(text).match(
    /(?:^|[\s,;\n])שם(?!\s*(?:חיה|חיית|כלב|הכלב|כלבה|הכלבה|חתול|החתול|חתולה|החתולה|מחמד))\s*[:=-]?\s*(.+?)(?=(?:[\s,;\n]+)(?:טלפון|נייד|פלאפון|שם חיה|שם חיית מחמד|שם הכלב|שם כלב|שם הכלבה|שם החתול|שם חתול|שם החתולה|חיה|כלב|כלבה|חתול|חתולה|סוג|גזע|זן|מחיר|עלות|תדירות|כל כמה שבועות|חוזר כל|הערות|הערה|סטטוס|מצב)\s*[:=-]?|$)/u
  );
  return cleanValue(match?.[1] || '');
};

const stripCustomerIntentPrefix = (text = '') =>
  normalizeText(text).replace(
    /^(?:(?:תוסיף|הוסף|תוסיפי|צור|תיצור|תיצרי|פתח|תפתח|להוסיף|אפשר להוסיף|תוכל להוסיף|תוכלי להוסיף)\s+(?:לי\s+)?(?:את\s+)?)?(?:לקוח|לקוחה|לקו)(?:\s+חדש(?:ה)?)?\s*[:=-]?\s*/u,
    ''
  );

const stripTrailingStructuredParts = (value = '') =>
  cleanValue(value).replace(
    /\s+(?:(?:\+972|972|0)\d[\d\s-]{7,}|ל(?:כלב|כלבה|חתול|חתולה|חיה)\s+קורא(?:ים|ת)?|טלפון|נייד|פלאפון|מספר|שם חיה|שם חיית מחמד|שם הכלב|שם כלב|שם הכלבה|שם החתול|שם חתול|שם החתולה|חיה|כלב|כלבה|חתול|חתולה|סוג|גזע|זן|מחיר|עלות|תדירות|כל כמה שבועות|חוזר כל|הערות|הערה|סטטוס|מצב)\b.*$/u,
    ''
  );

const extractLeadingName = (text = '') => {
  const body = stripCustomerIntentPrefix(text);
  if (!body || /\d/.test(body.split(/\s+/)[0] || '')) return '';

  const labelsPattern = [
    'טלפון',
    'נייד',
    'פלאפון',
    'מספר',
    'שם חיה',
    'שם חיית מחמד',
    'שם הכלב',
    'שם כלב',
    'שם הכלבה',
    'שם החתול',
    'שם חתול',
    'שם החתולה',
    'חיה',
    'כלב',
    'כלבה',
    'חתול',
    'חתולה',
    'סוג',
    'גזע',
    'זן',
    'מחיר',
    'עלות',
    'תדירות',
    'כל כמה שבועות',
    'חוזר כל',
    'הערות',
    'הערה',
    'סטטוס',
    'מצב'
  ]
    .map(escapeRegex)
    .join('|');

  const match = body.match(new RegExp(`^(.+?)(?=(?:[\\s,;\\n]+)(?:${labelsPattern})\\s*[:=-]?|$)`, 'u'));
  return stripTrailingStructuredParts(match?.[1] || '');
};

const extractPhone = (text = '') => {
  const labeledPhone = extractBoundedValue(text, FIELD_LABELS.phone);
  const source = labeledPhone || normalizeText(text);
  const match = source.match(/(?:\+972|972|0)\d[\d\s-]{7,}/);
  return cleanValue(match?.[0] || labeledPhone || '');
};

const parsePrice = (value = '') => {
  const match = String(value || '').match(/\d{2,4}(?:[.,]\d+)?/);
  if (!match) return undefined;
  const parsed = Number(match[0].replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
};

const extractPrice = (text = '') => {
  const labeledValue = extractBoundedValue(text, FIELD_LABELS.defaultPrice);
  const labeledPrice = parsePrice(labeledValue);
  if (labeledPrice !== undefined) return labeledPrice;

  const match = normalizeText(text).match(/(?:₪|ש"ח|שח|שקל|שקלים)\s*(\d{2,4})|(\d{2,4})\s*(?:₪|ש"ח|שח|שקל|שקלים)/u);
  return parsePrice(match?.[1] || match?.[2] || '');
};

const parseFrequencyWeeks = (value = '') => {
  const text = normalizeText(value);
  const match = text.match(/(\d{1,2})/);
  if (!match) return undefined;
  const weeks = Number(match[1]);
  return Number.isFinite(weeks) && weeks > 0 ? weeks : undefined;
};

const extractFrequencyWeeks = (text = '') => {
  const labeledValue = extractBoundedValue(text, FIELD_LABELS.visitFrequencyWeeks);
  const labeledFrequency = parseFrequencyWeeks(labeledValue);
  if (labeledFrequency !== undefined) return labeledFrequency;

  const match = normalizeText(text).match(/(?:כל|חוזר(?:ת)? כל)\s*(\d{1,2})\s*שבוע/u);
  return parseFrequencyWeeks(match?.[1] || '');
};

const extractPetName = (text = '') => {
  const directCallMatch = normalizeText(text).match(
    /(?:לכלב|לכלבה|לחתול|לחתולה|לחיה)\s+קורא(?:ים|ת)?\s+(.+?)(?=(?:[\s,;]+)(?:סוג|גזע|זן|מחיר|עלות|תדירות|כל כמה שבועות|טלפון|נייד|פלאפון|הערות|הערה)|$)/u
  );
  if (directCallMatch?.[1]) return cleanValue(directCallMatch[1]);

  return extractBoundedValue(text, FIELD_LABELS.petName);
};

const extractLifecycleStatus = (text = '') => {
  const value = extractBoundedValue(text, FIELD_LABELS.lifecycleStatus);
  const haystack = value || normalizeText(text);
  if (/בהמתנה|מושהה|לא פעיל|עצור/i.test(haystack)) return 'ON_HOLD';
  if (/פעיל|רגיל|אקטיבי/i.test(haystack)) return 'ACTIVE';
  return undefined;
};

const extractLastVisit = (text = '') => {
  const match = normalizeText(text).match(
    /(?:ביקור אחרון|תור אחרון|הגיע(?:ה)? לאחרונה)\s*[:=-]?\s*(\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?|\d{4}-\d{1,2}-\d{1,2})/u
  );
  if (!match?.[1]) return undefined;

  const token = match[1];
  const isoMatch = token.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${year}-${String(Number(month)).padStart(2, '0')}-${String(Number(day)).padStart(2, '0')}`;
  }

  const shortMatch = token.match(/^(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?$/);
  if (!shortMatch) return undefined;

  const currentYear = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric'
  }).format(new Date());
  const [, dayRaw, monthRaw, yearRaw] = shortMatch;
  const year = yearRaw ? Number(yearRaw.length === 2 ? `20${yearRaw}` : yearRaw) : Number(currentYear);
  return `${String(year).padStart(4, '0')}-${String(Number(monthRaw)).padStart(2, '0')}-${String(
    Number(dayRaw)
  ).padStart(2, '0')}`;
};

const hasCustomerCreateIntent = (text = '') =>
  /(?:^|\s)(?:לקוח|לקוחה|לקו)\s+חדש(?:ה)?(?:$|[\s,:=-])/u.test(normalizeText(text)) ||
  /^(?:תוסיף|הוסף|תוסיפי|צור|תיצור|תיצרי|פתח|תפתח|להוסיף|אפשר להוסיף|תוכל להוסיף|תוכלי להוסיף)\s+(?:לי\s+)?(?:את\s+)?(?:לקוח|לקוחה|לקו)/u.test(
    normalizeText(text)
  );

const looksLikeBookingRequest = (text = '') => {
  const normalized = normalizeText(text);
  const hasBookingWord = /(?:תור|לקבוע|קבע|תקבע|שריין|שעה|בשעה)/u.test(normalized);
  const hasDateOrTime = /(?:היום|מחר|מחרתיים|ביום|יום|בתאריך|\d{1,2}:\d{2}|\b\d{1,2}\s*(?:בבוקר|בערב|בצהריים)?\b)/u.test(
    normalized
  );
  return hasBookingWord && hasDateOrTime;
};

export const extractCustomerDetails = (message = '') => {
  const text = normalizeText(message);
  const rawText = String(message || '');
  const lines = normalizeLines(rawText);
  const lineText = lines.join(' ');
  const source = lineText || text;

  const customerName =
    extractBoundedValue(source, FIELD_LABELS.customerName) ||
    extractCustomerNameByGenericName(source) ||
    extractLeadingName(source);
  const phone = extractPhone(source);
  const petName = extractPetName(source);
  const petType = extractBoundedValue(source, FIELD_LABELS.petType);
  const notes = extractBoundedValue(source, FIELD_LABELS.notes);
  const defaultPrice = extractPrice(source);
  const visitFrequencyWeeks = extractFrequencyWeeks(source);
  const lifecycleStatus = extractLifecycleStatus(source);
  const lastVisit = extractLastVisit(source);

  return {
    text,
    customerName,
    phone,
    petName,
    petType,
    notes,
    defaultPrice,
    visitFrequencyWeeks,
    lifecycleStatus,
    lastVisit
  };
};

export const parseCustomerQuery = (message) => {
  const text = normalizeText(message);
  if (!text || !hasCustomerCreateIntent(text) || looksLikeBookingRequest(text)) {
    return null;
  }

  const details = extractCustomerDetails(message);

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
    } else if (target === 'defaultPrice' && details.defaultPrice === undefined) {
      merged.defaultPrice = parsePrice(normalizedMessage);
    } else if (target === 'visitFrequencyWeeks' && details.visitFrequencyWeeks === undefined) {
      merged.visitFrequencyWeeks = parseFrequencyWeeks(normalizedMessage);
    }
  }

  if (preferredMissingFields.includes('phone') && !merged.phone) {
    const phoneOnly = normalizeDigits(normalizedMessage);
    if (phoneOnly.length >= 9) {
      merged.phone = normalizedMessage;
    }
  }

  if (preferredMissingFields.includes('defaultPrice') && merged.defaultPrice === undefined) {
    merged.defaultPrice = parsePrice(normalizedMessage);
  }

  if (
    preferredMissingFields.includes('visitFrequencyWeeks') &&
    merged.visitFrequencyWeeks === undefined
  ) {
    merged.visitFrequencyWeeks = parseFrequencyWeeks(normalizedMessage);
  }

  return {
    ...merged,
    text: `${String(base.text || '').trim()} ${normalizedMessage}`.trim()
  };
};

export const buildCustomerQueryMissingText = ({
  customerName,
  phone,
  petName,
  petType,
  defaultPrice,
  visitFrequencyWeeks
}) => {
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

  if (defaultPrice === undefined) {
    return `חסר לי מחיר קבוע ללקוח. ${CUSTOMER_EXAMPLE}`;
  }

  if (visitFrequencyWeeks === undefined) {
    return `חסרה לי תדירות בשבועות. ${CUSTOMER_EXAMPLE}`;
  }

  return '';
};

export const buildCustomerSuccessText = (customer) =>
  `הוספתי לקוח חדש מסודר:
שם לקוח: ${customer.name}
טלפון: ${customer.phone}
שם חיה: ${customer.petName}
סוג/גזע: ${customer.petType}
מחיר קבוע: ${customer.defaultPrice ?? '-'}
תדירות: כל ${customer.visitFrequencyWeeks || 4} שבועות`;

export const buildCustomerFailureText = (reason = '') => {
  const message = String(reason || '');

  if (message.startsWith('חסר לי') || message.startsWith('חסרה לי')) {
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

  if (message.includes('כבר קיים לקוח')) {
    return message;
  }

  if (message.includes('נמצאו כמה לקוחות בשם הזה')) {
    return 'מצאתי כמה לקוחות בשם הזה. תשלח גם מספר טלפון.';
  }

  return `לא הצלחתי להוסיף את הלקוח החדש. ${message || CUSTOMER_EXAMPLE}`;
};

export const createCustomerFromQuery = async (query) => {
  if (
    !query?.customerName ||
    !query?.phone ||
    !query?.petName ||
    !query?.petType ||
    query?.defaultPrice === undefined ||
    query?.visitFrequencyWeeks === undefined
  ) {
    throw createHttpError(400, buildCustomerQueryMissingText(query || {}));
  }

  const result = await createCustomerFromStructuredInput({
    customerName: query.customerName,
    phone: query.phone,
    petName: query.petName,
    petType: query.petType,
    notes: query.notes,
    defaultPrice: query.defaultPrice,
    visitFrequencyWeeks: query.visitFrequencyWeeks,
    lifecycleStatus: query.lifecycleStatus,
    lastVisit: query.lastVisit
  });

  return {
    customer: result.customer,
    text: buildCustomerSuccessText(result.customer)
  };
};
