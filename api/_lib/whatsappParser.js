const ISRAEL_TIME_ZONE = 'Asia/Jerusalem';

const WEEKDAY_MAP = {
  ראשון: 0,
  'יום ראשון': 0,
  שני: 1,
  'יום שני': 1,
  שלישי: 2,
  'יום שלישי': 2,
  רביעי: 3,
  'יום רביעי': 3,
  חמישי: 4,
  'יום חמישי': 4,
  שישי: 5,
  'יום שישי': 5,
  שבת: 6,
  'יום שבת': 6
};

const SERVICE_ALIASES = [
  'טיפול מלא',
  'גזירת ציפורניים',
  'ניקוי אוזניים',
  'תספורת',
  'אמבטיה',
  'רחצה',
  'מקלחת',
  'סירוק'
];

const GENERIC_SERVICE = 'תור לקוח';

const PET_TYPE_ALIASES = [
  'פודל',
  'טוי פודל',
  'פודל ננסי',
  'שיצו',
  'פומרניין',
  'פומרני',
  'פומרנים',
  'מלטיפו',
  'שיצו פודל',
  'מלטז',
  'מלטזי'
];

const PET_NAME_LABELS = [
  'שם חיה',
  'שם הכלב',
  'שם הכלבה',
  'שם החתול',
  'שם החתולה'
];

const NON_NAME_PREFIXES = [
  'טלפון',
  'נייד',
  'פלאפון',
  'סוג',
  'גזע',
  'מחיר',
  'שם חיה',
  'שם הכלב',
  'שם הכלבה',
  'שם החתול',
  'שם החתולה'
];

const CUSTOMER_NAME_PREFIXES = ['שם לקוח', 'שם לקוחה', 'שם'];

const ACTION_PREFIXES = new Set([
  'שים',
  'תשים',
  'קבע',
  'תקבע',
  'תקבעי',
  'תוסיף',
  'להוסיף',
  'תכניס',
  'שריין',
  'תשריין',
  'תוכל',
  'תוכלי',
  'אפשר'
]);

const pad = (value) => String(value).padStart(2, '0');

const normalizeText = (value = '') =>
  String(value || '')
    .replace(/[“”״]/g, '"')
    .replace(/[’׳]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeLines = (value = '') =>
  String(value || '')
    .split(/\r?\n/)
    .map((line) => normalizeText(line))
    .filter(Boolean);

const getNowPartsInIsrael = () => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: ISRAEL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  });

  const parts = formatter
    .formatToParts(new Date())
    .filter(part => part.type !== 'literal')
    .reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute)
  };
};

const dateFromParts = ({ year, month, day }) => new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

const addDays = (date, days) => {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const formatDate = (date) =>
  `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

const normalizeTime = (hours, minutes = '00') => `${pad(hours)}:${pad(minutes)}`;

const collectTimeCandidates = (text) => {
  const candidates = [];

  const explicitPatterns = [
    /(?:בשעה|שעה|לשעה)\s*(\d{1,2})(?::(\d{2}))?\b/g,
    /(?:^|\s)(\d{1,2}):(\d{2})\b/g,
    /(?:ב-|ב )\s*(\d{1,2})(?::(\d{2}))?(?!\s*לחודש)\b/g
  ];

  explicitPatterns.forEach((pattern, priority) => {
    for (const match of text.matchAll(pattern)) {
      const hours = Number(match[1]);
      const minutes = Number(match[2] || '00');
      if (hours > 23 || minutes > 59) continue;
      candidates.push({
        hours,
        minutes,
        priority
      });
    }
  });

  return candidates.sort((left, right) => left.priority - right.priority);
};

const extractTime = (text) => {
  const candidate = collectTimeCandidates(text)[0];
  if (!candidate) return null;
  return normalizeTime(candidate.hours, candidate.minutes);
};

const extractExplicitDate = (text) => {
  const isoMatch = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoMatch) return isoMatch[1];

  const shortMatch = text.match(/\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/);
  if (shortMatch) {
    const [, dayRaw, monthRaw, yearRaw] = shortMatch;
    const currentYear = getNowPartsInIsrael().year;
    const year = yearRaw ? Number(yearRaw.length === 2 ? `20${yearRaw}` : yearRaw) : currentYear;
    const month = Number(monthRaw);
    const day = Number(dayRaw);
    return `${String(year).padStart(4, '0')}-${pad(month)}-${pad(day)}`;
  }

  const monthlessMatch = text.match(/(?:ב-?)?(\d{1,2})\s+לחודש\b/);
  if (!monthlessMatch) return null;

  const now = getNowPartsInIsrael();
  const day = Number(monthlessMatch[1]);
  const currentMonthDate = new Date(Date.UTC(now.year, now.month - 1, day, 12, 0, 0));
  const today = dateFromParts(now);

  if (!Number.isNaN(currentMonthDate.getTime()) && currentMonthDate.getUTCDate() === day) {
    if (currentMonthDate.getTime() >= today.getTime()) {
      return formatDate(currentMonthDate);
    }

    const nextMonthDate = new Date(Date.UTC(now.year, now.month, day, 12, 0, 0));
    if (!Number.isNaN(nextMonthDate.getTime()) && nextMonthDate.getUTCDate() === day) {
      return formatDate(nextMonthDate);
    }
  }

  return null;
};

const extractRelativeDate = (text, time) => {
  const now = getNowPartsInIsrael();
  const today = dateFromParts(now);

  if (text.includes('מחרתיים')) {
    return formatDate(addDays(today, 2));
  }

  if (text.includes('מחר')) {
    return formatDate(addDays(today, 1));
  }

  if (text.includes('היום')) {
    return formatDate(today);
  }

  const matchedWeekday = Object.keys(WEEKDAY_MAP).find(label => text.includes(label));
  if (!matchedWeekday) return null;

  const targetDay = WEEKDAY_MAP[matchedWeekday];
  const todayDay = today.getUTCDay();
  let delta = (targetDay - todayDay + 7) % 7;

  if (delta === 0 && time) {
    const [hours, minutes] = time.split(':').map(Number);
    if (hours < now.hour || (hours === now.hour && minutes <= now.minute)) {
      delta = 7;
    }
  }

  return formatDate(addDays(today, delta));
};

const extractService = (text) =>
  SERVICE_ALIASES.find(label => text.includes(label)) || (text.includes('תור') ? GENERIC_SERVICE : null);

const extractPetType = (text) => PET_TYPE_ALIASES.find(label => text.includes(label)) || null;

const isMetadataLine = (line = '') => {
  if (!line) return true;
  if (/^לקוח(?:ה)? חדשה?$|^לקוח חדש$/.test(line)) return true;
  if (extractPhone(line)) return true;
  if (extractPrice(line) !== null) return true;
  if (extractTime(line)) return true;
  if (extractExplicitDate(line) || extractRelativeDate(line, extractTime(line))) return true;
  if (line.includes('לקבוע תור')) return true;
  if (line.includes('לכלב קוראים') || line.includes('לכלבה קוראים') || line.includes('לחתול קוראים') || line.includes('לחתולה קוראים')) return true;
  if (extractService(line) && line !== GENERIC_SERVICE) return true;
  if (PET_TYPE_ALIASES.some((label) => line === label)) return true;
  return false;
};

const extractStructuredCustomerName = (lines = []) => {
  const markerIndex = lines.findIndex((line) => /^לקוח(?:ה)? חדשה?$|^לקוח חדש$/.test(line));
  if (markerIndex === -1) return null;

  for (let index = markerIndex + 1; index < lines.length; index += 1) {
    const candidate = lines[index];
    if (!isMetadataLine(candidate)) {
      return candidate;
    }
  }

  return null;
};

const extractStructuredPetType = (lines = []) => {
  const aliases = [...PET_TYPE_ALIASES].sort((left, right) => right.length - left.length);
  for (const line of lines) {
    const match = aliases.find((label) => line === label || line.includes(`מסוג ${label}`) || line.includes(`סוג ${label}`));
    if (match) return match;
  }
  return null;
};

const extractPetName = (text) => {
  const namedMatch = text.match(/ל(?:כלב|כלבה|חתול|חתולה)\s+קור(?:א|אים)\s+([^,\n]+)/u);
  if (namedMatch?.[1]) {
    return namedMatch[1].trim();
  }

  for (const label of PET_NAME_LABELS) {
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = text.match(new RegExp(`${escapedLabel}\\s*[:\\-]?\\s*([^,\\n]+)`, 'u'));
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
};

const extractPhone = (text) => {
  const match = text.match(/(?:\+972|972|0)\d[\d\s-]{7,}/);
  return match?.[0]?.trim() || null;
};

const extractPrice = (text) => {
  const match = text.match(/(\d{2,4})(?:\s*(?:₪|ש["']?ח|שקל(?:ים)?))/);
  if (!match?.[1]) return null;

  const price = Number(match[1]);
  return Number.isFinite(price) ? price : null;
};

const mentionsNewCustomer = (text) => /לקוח(?:ה)? חדשה?|לקוח חדש/.test(text);

const extractName = (text) => {
  const sanitized = normalizeText(text)
    .replace(/[,.!?]/g, ' ')
    .replace(/\s+/g, ' ');

  const explicitNamePrefix = CUSTOMER_NAME_PREFIXES.find(
    (prefix) => sanitized.startsWith(`${prefix} `) || sanitized.startsWith(`${prefix}:`)
  );

  if (explicitNamePrefix) {
    return sanitized.slice(explicitNamePrefix.length).replace(/^[:\s-]+/, '').trim() || null;
  }

  if (
    NON_NAME_PREFIXES.some(
      (prefix) => sanitized.startsWith(`${prefix} `) || sanitized.startsWith(`${prefix}:`)
    )
  ) {
    return null;
  }

  const tokens = sanitized.split(' ').filter(Boolean);
  while (tokens.length > 0 && ACTION_PREFIXES.has(tokens[0])) {
    tokens.shift();
  }

  if (tokens[0] === 'את') {
    tokens.shift();
  }

  if (tokens[0] === 'לקוח' || tokens[0] === 'לקוחה') {
    tokens.shift();
  }

  if (tokens[0] === 'חדש' || tokens[0] === 'חדשה') {
    tokens.shift();
  }

  const stopIndex = tokens.findIndex(token => {
    if (
      token === 'ביום' ||
      token === 'יום' ||
      token === 'היום' ||
      token === 'מחר' ||
      token === 'מחרתיים' ||
      token === 'בשעה' ||
      token === 'לשעה' ||
      token === 'שעה' ||
      token === 'עם' ||
      token === 'מסוג' ||
      token === 'מהסוג' ||
      token === 'תור' ||
      token === 'לקוח' ||
      token === 'חדשה' ||
      token === 'חדש'
    ) {
      return true;
    }

    if (/^\d{1,2}(?::\d{2})?$/.test(token)) {
      return true;
    }

    if (/^\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?$/.test(token) || /^\d{4}-\d{2}-\d{2}$/.test(token)) {
      return true;
    }

    if (SERVICE_ALIASES.some(service => token === service || service.startsWith(`${token} `))) {
      return true;
    }

    return false;
  });

  const nameTokens = stopIndex === -1 ? tokens : tokens.slice(0, stopIndex);
  let candidateName = nameTokens.join(' ').trim();

  const removableSuffixes = [...SERVICE_ALIASES, ...PET_TYPE_ALIASES, 'לקוח חדש', 'לקוחה חדשה']
    .sort((left, right) => right.length - left.length);

  removableSuffixes.forEach((suffix) => {
    if (candidateName === suffix) {
      candidateName = '';
      return;
    }

    if (candidateName.endsWith(` ${suffix}`)) {
      candidateName = candidateName.slice(0, -(suffix.length + 1)).trim();
    }
  });

  return candidateName || null;
};

export const analyzeAppointmentMessage = (message) => {
  const text = normalizeText(message);
  const lines = normalizeLines(message);
  const time = extractTime(text);
  const date = extractExplicitDate(text) || extractRelativeDate(text, time);
  const customerName = extractStructuredCustomerName(lines) || extractName(text);
  const service = extractService(text) || (mentionsNewCustomer(text) && (date || time) ? GENERIC_SERVICE : null);
  const phone = extractPhone(text);
  const petName = extractPetName(String(message || '')) || extractPetName(text);
  const petType = extractStructuredPetType(lines) || extractPetType(text);
  const price = extractPrice(text);

  return {
    text,
    customerName,
    date,
    time,
    service,
    phone,
    petName,
    petType,
    price,
    isNewCustomerIntent: mentionsNewCustomer(text)
  };
};

export const parseAppointmentMessage = (message) => {
  const { text, customerName, date, time, service, phone, petName, petType, price } =
    analyzeAppointmentMessage(message);
  if (!text) {
    throw new Error('Missing message text');
  }

  if (!customerName) {
    throw new Error('לא הצלחתי לזהות שם לקוח מההודעה.');
  }

  if (!date) {
    throw new Error('לא הצלחתי לזהות תאריך מההודעה.');
  }

  if (!time) {
    throw new Error('לא הצלחתי לזהות שעה מההודעה.');
  }

  if (!service) {
    throw new Error('לא הצלחתי לזהות שירות מההודעה.');
  }

  return {
    customerName,
    date,
    time,
    service,
    phone,
    petName,
    petType,
    price,
    notes: text
  };
};
