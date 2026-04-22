import {
  createAppointmentFromStructuredInput,
  findCustomerByPhone,
  getAllowedSlotsForLocalDate,
  toApiError
} from './_lib/appointments.js';
import {
  buildCustomerFailureText,
  createCustomerFromQuery,
  mergeCustomerDetails,
  parseCustomerQuery
} from './_lib/customerQueries.js';
import { getScheduleWindowReply, parseScheduleQuery } from './_lib/scheduleQueries.js';
import { getStatsReply, parseStatsQuery } from './_lib/statsQueries.js';
import { getBusinessAdviceReply, parseBusinessAdviceQuery } from './_lib/businessAdviceQueries.js';
import { getGeneralAssistantReply, parseGeneralAssistantQuery } from './_lib/generalAssistantQueries.js';
import { getCustomerFaqReply } from './_lib/customerFaq.js';
import {
  getAutoLearningReply,
  getLearningReply,
  learnFromIncomingMessage,
  parseAutoLearningQuery,
  parseLearningQuery
} from './_lib/learningQueries.js';
import {
  completeTaskFromQuery,
  createBulkTasksFromQuery,
  createTaskFromQuery,
  deleteTaskFromQuery,
  getTaskStatusReply,
  getTasksReply,
  parseTaskQuery,
  reopenTaskFromQuery
} from './_lib/taskQueries.js';
import {
  createCalendarEventFromQuery,
  createQuickReminderFromQuery,
  parseCalendarEventQuery,
  parseQuickReminderQuery
} from './_lib/calendarEventQueries.js';
import { handleMemoryQuery, parseMemoryQuery, saveMemory } from './_lib/memoryQueries.js';
import {
  createReminder,
  handleReminderManagementQuery,
  parseReminderManagementQuery
} from './_lib/reminders.js';
import { analyzeAppointmentMessage, parseAppointmentMessage } from './_lib/whatsappParser.js';
import {
  clearWhatsAppContext,
  loadWhatsAppContext,
  saveWhatsAppContext
} from './_lib/whatsappContext.js';
import { logWhatsAppMessage } from './_lib/whatsappMessages.js';

const verifyToken = (process.env.WHATSAPP_VERIFY_TOKEN || '').trim();
const webhookSecret = (process.env.WHATSAPP_WEBHOOK_SECRET || '').trim();
const whatsappToken = (process.env.WHATSAPP_TOKEN || '').trim();
const whatsappPhoneNumberId = (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
const ownerPhoneNumbers = (process.env.WHATSAPP_OWNER_PHONES || process.env.MANAGER_APPROVAL_PHONES || '')
  .split(',')
  .map((value) => String(value || '').trim())
  .filter(Boolean);
const ISRAEL_TIME_ZONE = 'Asia/Jerusalem';
const BOOKING_EXAMPLE = 'לדוגמה: שים את אביבית ביום שני ב-12 תספורת';
const CUSTOMER_EXAMPLE = 'לדוגמה: לקוח חדש דניאלה להבי, טלפון 0501234567, שם חיה טופי, סוג מלטז';
const NEW_CUSTOMER_BOOKING_EXAMPLE =
  'לדוגמה: לקוח חדש דניאלה להבי, טלפון 0501234567, שם חיה טופי, סוג מלטז, ביום ראשון ב-29 לחודש בשעה 07:00 תור';
const APPOINTMENT_CONTEXT_KIND = 'APPOINTMENT';
const APPOINTMENT_CONFIRMATION_CONTEXT_KIND = 'APPOINTMENT_CONFIRMATION';
const CUSTOMER_CONTEXT_KIND = 'CUSTOMER';
const QUICK_REMINDER_CONTEXT_KIND = 'QUICK_REMINDER';
const TRAINING_CONTEXT_KIND = 'TRAINING';
const SUPPORTED_SERVICE_HINT = 'תספורת';
const ASSISTANT_HELP_TEXT =
  'אני העוזר של Pawlished. אפשר לבקש ממני לקבוע תור, להוסיף לקוח חדש, לשאול על לוז יומי או שבועי, לנהל משימות, להוסיף אירוע אישי וליצור תזכורת מהירה.\n' +
  'אם חסר פרט, אפשר לענות רק עם החלק החסר. לדוגמה: אם ביקשתי שעה, אפשר לענות פשוט "7" או "07:00".';

const canSendWhatsAppReply = () => Boolean(whatsappToken && whatsappPhoneNumberId);

const normalizeWhatsAppNumber = (value = '') => String(value || '').replace(/\D/g, '');

const toWhatsAppNumber = (value = '') => {
  const digits = normalizeWhatsAppNumber(value);
  if (!digits) return '';
  if (digits.startsWith('972')) return digits;
  if (digits.startsWith('0')) return `972${digits.slice(1)}`;
  if (digits.startsWith('+972')) return digits.slice(1);
  return digits;
};

const buildPhoneVariants = (value = '') => {
  const digits = normalizeWhatsAppNumber(value);
  const variants = new Set([digits]);
  if (digits.startsWith('0')) {
    variants.add(`972${digits.slice(1)}`);
  } else if (digits.startsWith('972')) {
    variants.add(`0${digits.slice(3)}`);
  }
  return Array.from(variants).filter(Boolean);
};

const ownerPhoneRecipients = Array.from(new Set(ownerPhoneNumbers.map(toWhatsAppNumber).filter(Boolean)));
const ownerPhoneNumberSet = new Set(ownerPhoneNumbers.flatMap(buildPhoneVariants).filter(Boolean));

const isOwnerConversation = (phone = '', body = {}) => {
  if (body?.ownerMode === true || body?.isOwner === true || body?.forceOwner === true) {
    return true;
  }

  const phoneKey = normalizeWhatsAppNumber(phone);
  return Boolean(phoneKey && ownerPhoneNumberSet.has(phoneKey));
};

const isPublicCustomerConversation = (phone = '', body = {}) => {
  if (body?.customerMode === true || body?.clientMode === true || body?.publicBooking === true) {
    return true;
  }

  if (isOwnerConversation(phone, body)) {
    return false;
  }

  if (String(process.env.WHATSAPP_PUBLIC_CUSTOMER_MODE || '').toLowerCase() === 'false') {
    return false;
  }

  return isMetaPayload(body);
};

const formatReplyDate = (value = '') => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) {
    return String(value || '').trim();
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return new Intl.DateTimeFormat('he-IL', {
    timeZone: ISRAEL_TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'numeric'
  }).format(date);
};

const normalizeMessageText = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

const hasValue = (value) =>
  value !== undefined && value !== null && (typeof value !== 'string' || value.trim() !== '');

const getNowPartsInIsrael = () => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: ISRAEL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const parts = formatter
    .formatToParts(new Date())
    .filter((part) => part.type !== 'literal')
    .reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day)
  };
};

const getIsraelTodayDateString = () => {
  const now = getNowPartsInIsrael();
  return `${String(now.year).padStart(4, '0')}-${String(now.month).padStart(2, '0')}-${String(now.day).padStart(2, '0')}`;
};

const inferUpcomingDateFromDayOfMonth = (value = '') => {
  const match = normalizeMessageText(value).match(/^(?:ב-?)?(\d{1,2})$/);
  if (!match) return null;

  const day = Number(match[1]);
  const now = getNowPartsInIsrael();
  const currentMonthDate = new Date(Date.UTC(now.year, now.month - 1, day, 12, 0, 0));
  const today = new Date(Date.UTC(now.year, now.month - 1, now.day, 12, 0, 0));

  if (!Number.isNaN(currentMonthDate.getTime()) && currentMonthDate.getUTCDate() === day) {
    if (currentMonthDate.getTime() >= today.getTime()) {
      return currentMonthDate.toISOString().slice(0, 10);
    }

    const nextMonthDate = new Date(Date.UTC(now.year, now.month, day, 12, 0, 0));
    if (!Number.isNaN(nextMonthDate.getTime()) && nextMonthDate.getUTCDate() === day) {
      return nextMonthDate.toISOString().slice(0, 10);
    }
  }

  return null;
};

const inferLooseTime = (value = '') => {
  const match = normalizeMessageText(value).match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2] || '00');
  if (hours > 23 || minutes > 59) return null;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const inferLoosePhone = (value = '') => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 9 ? normalizeMessageText(value) : null;
};

const inferLooseName = (value = '') => {
  const text = normalizeMessageText(value);
  if (!text || /^[?!.]+$/.test(text) || /\d/.test(text)) return null;
  if (text.split(' ').length > 4) return null;
  return text;
};

const inferLoosePrice = (value = '') => {
  const text = normalizeMessageText(value);
  const explicitMatch = text.match(/^(\d{2,4})(?:\s*(?:₪|ש["']?ח|שקל(?:ים)?))?$/);
  if (!explicitMatch) return null;

  const price = Number(explicitMatch[1]);
  return Number.isFinite(price) ? price : null;
};

const inferLooseFrequencyWeeks = (value = '') => {
  const text = normalizeMessageText(value);
  const match = text.match(/(\d{1,2})/);
  if (!match) return null;

  const weeks = Number(match[1]);
  return Number.isFinite(weeks) && weeks > 0 ? weeks : null;
};

const APPOINTMENT_FIELD_LABELS = {
  customerName: 'שם לקוח',
  date: 'יום או תאריך',
  time: 'שעה',
  service: 'שירות',
  phone: 'טלפון',
  petName: 'שם חיה',
  petType: 'סוג כלב'
};

const CUSTOMER_FIELD_LABELS = {
  customerName: 'שם לקוח',
  phone: 'טלפון',
  petName: 'שם חיה',
  petType: 'סוג כלב'
};

const APPOINTMENT_FIELD_QUESTIONS = {
  customerName: 'מה שם הלקוח?',
  date: 'לאיזה יום או תאריך לקבוע?',
  time: 'מה השעה? אפשר לענות רק עם 7 או 07:00.',
  service: `איזה שירות לקבוע? אפשר לכתוב: ${SUPPORTED_SERVICE_HINT}.`,
  phone: 'מה מספר הטלפון של הלקוח?',
  petName: 'מה השם של חיית המחמד?',
  petType: 'איזה סוג או גזע הכלב? למשל מלטז או פודל.'
};

const CUSTOMER_FIELD_QUESTIONS = {
  customerName: 'מה שם הלקוח החדש?',
  phone: 'מה מספר הטלפון של הלקוח?',
  petName: 'מה השם של חיית המחמד?',
  petType: 'איזה סוג או גזע הכלב? למשל מלטז או פודל.'
};

APPOINTMENT_FIELD_LABELS.customerLookup = 'שם לקוח, שם כלב או טלפון';
APPOINTMENT_FIELD_LABELS.price = 'מחיר';
APPOINTMENT_FIELD_LABELS.visitFrequencyWeeks = 'תדירות בשבועות';
delete APPOINTMENT_FIELD_LABELS.service;

CUSTOMER_FIELD_LABELS.defaultPrice = 'מחיר';
CUSTOMER_FIELD_LABELS.visitFrequencyWeeks = 'תדירות בשבועות';

APPOINTMENT_FIELD_QUESTIONS.customerLookup = 'את מי לקבוע? אפשר לשלוח שם לקוח, שם כלב או טלפון.';
APPOINTMENT_FIELD_QUESTIONS.customerName = 'מה השם של הלקוח החדש?';
APPOINTMENT_FIELD_QUESTIONS.price = 'מה המחיר הקבוע ללקוח?';
APPOINTMENT_FIELD_QUESTIONS.visitFrequencyWeeks = 'כל כמה שבועות הלקוח חוזר בדרך כלל?';
delete APPOINTMENT_FIELD_QUESTIONS.service;

CUSTOMER_FIELD_QUESTIONS.defaultPrice = 'מה המחיר הקבוע ללקוח?';
CUSTOMER_FIELD_QUESTIONS.visitFrequencyWeeks = 'כל כמה שבועות הלקוח חוזר בדרך כלל?';

const CUSTOMER_BOOKING_FIELD_LABELS = {
  date: 'יום או תאריך',
  time: 'שעה',
  customerName: 'שם מלא',
  petName: 'שם חיית המחמד',
  petType: 'סוג או גזע'
};

const CUSTOMER_BOOKING_FIELD_QUESTIONS = {
  date: 'לאיזה יום תרצה לקבוע? אנחנו עובדים ראשון עד שישי.',
  time: 'באיזו שעה נוח לך? אפשר לענות עם שעה כמו 07:00 או 12:00.',
  customerName: 'מה השם המלא שלך?',
  petName: 'מה השם של חיית המחמד?',
  petType: 'איזה סוג או גזע היא? למשל מלטז, פודל או שיצו.'
};

const buildMissingFieldsPrompt = (
  missingFields = [],
  labelsMap = APPOINTMENT_FIELD_LABELS,
  questionsMap = APPOINTMENT_FIELD_QUESTIONS
) => {
  const normalizedFields = missingFields.filter((field) => labelsMap[field]);
  if (normalizedFields.length === 0) return '';

  const firstField = normalizedFields[0];
  const firstLabel = labelsMap[firstField];
  const firstQuestion = questionsMap[firstField] || `מה ${firstLabel}?`;
  const remainingLabels = normalizedFields.slice(1).map((field) => labelsMap[field]);

  if (remainingLabels.length === 0) {
    return `חסר לי רק ${firstLabel}. ${firstQuestion}`;
  }

  return `כרגע חסר לי ${firstLabel}. ${firstQuestion} אחרי זה נשלים גם את: ${remainingLabels.join(', ')}.`;
};

const joinReplyLines = (...lines) => lines.filter(Boolean).join('\n');

const hasAppointmentIdentity = (payload = {}) =>
  hasValue(payload.customerName) || hasValue(payload.phone) || hasValue(payload.petName);

const detectAppointmentMissingFields = (payload = {}) => {
  const missing = [];

  if (!hasAppointmentIdentity(payload)) missing.push('customerLookup');
  if (!payload.date) missing.push('date');
  if (!payload.time) missing.push('time');

  if (payload.isNewCustomerIntent) {
    if (!payload.customerName) missing.push('customerName');
    if (!payload.phone) missing.push('phone');
    if (!payload.petName) missing.push('petName');
    if (!payload.petType) missing.push('petType');
    if (!hasValue(payload.price)) missing.push('price');
    if (!hasValue(payload.visitFrequencyWeeks)) missing.push('visitFrequencyWeeks');
  }

  return missing;
};

const detectCustomerBookingMissingFields = (payload = {}, knownCustomer = null) => {
  const missing = [];

  if (!payload.date) missing.push('date');
  if (!payload.time) missing.push('time');

  if (!knownCustomer) {
    if (!payload.customerName) missing.push('customerName');
    if (!payload.petName) missing.push('petName');
    if (!payload.petType) missing.push('petType');
  }

  return missing;
};

const detectCustomerMissingFields = (payload = {}) => {
  const missing = [];
  if (!payload.customerName) missing.push('customerName');
  if (!payload.phone) missing.push('phone');
  if (!payload.petName) missing.push('petName');
  if (!payload.petType) missing.push('petType');
  if (!hasValue(payload.defaultPrice)) missing.push('defaultPrice');
  if (!hasValue(payload.visitFrequencyWeeks)) missing.push('visitFrequencyWeeks');
  return missing;
};

const inferValueForAppointmentField = (field, messageText, analysis = {}) => {
  if (field === 'time') return analysis.time || inferLooseTime(messageText);
  if (field === 'date') return analysis.date || inferUpcomingDateFromDayOfMonth(messageText);
  if (field === 'phone') return analysis.phone || inferLoosePhone(messageText);
  if (field === 'customerLookup') {
    return (
      analysis.customerName ||
      analysis.petName ||
      analysis.phone ||
      inferLooseName(messageText) ||
      inferLoosePhone(messageText)
    );
  }
  if (field === 'customerName') return analysis.customerName || inferLooseName(messageText);
  if (field === 'petName') return analysis.petName || inferLooseName(messageText);
  if (field === 'petType') return analysis.petType || inferLooseName(messageText);
  if (field === 'price') return analysis.price || inferLoosePrice(messageText);
  if (field === 'visitFrequencyWeeks') {
    return analysis.visitFrequencyWeeks || inferLooseFrequencyWeeks(messageText);
  }
  return null;
};

const mergeAppointmentPayload = (basePayload = {}, messageText = '', preferredMissingFields = []) => {
  const analysis = analyzeAppointmentMessage(messageText);
  const merged = {
    ...basePayload,
    notes: [basePayload.notes, analysis.text].filter(Boolean).join(' | ').trim()
  };

  ['customerName', 'date', 'time', 'service', 'phone', 'petName', 'petType', 'price', 'visitFrequencyWeeks'].forEach((field) => {
    if (hasValue(analysis[field])) {
      merged[field] = analysis[field];
    }
  });

  merged.isNewCustomerIntent = Boolean(basePayload.isNewCustomerIntent || analysis.isNewCustomerIntent);

  if (preferredMissingFields.length > 0) {
    const fieldsToInfer = preferredMissingFields.length > 1 ? preferredMissingFields.slice(0, 1) : preferredMissingFields;
    fieldsToInfer.forEach((field) => {
      if (!hasValue(merged[field])) {
        const inferredValue = inferValueForAppointmentField(field, messageText, analysis);
        if (hasValue(inferredValue)) {
          merged[field] = inferredValue;
        }
      }
    });
  }

  return {
    merged,
    analysis
  };
};

const parseAssistantHelpQuery = (message = '') => {
  const text = normalizeMessageText(message);
  if (!text) return null;

  const isSimpleGreeting = /^(?:שלום|היי|הי|אהלן|הלן|בוקר טוב|צהריים טובים|ערב טוב|לילה טוב)[!?.\s]*$/i.test(
    text
  );

  if (
    isSimpleGreeting ||
    /(מה (?:אתה|את) יודע(?:ת)? לעשות|מה אפשר לבקש|איך לעבוד איתך|מה התפקיד שלך|מה המשימה שלך|עזרה|help|איך להשתמש)/.test(
      text
    )
  ) {
    return {
      kind: 'assistant_help',
      text
    };
  }

  return null;
};

const looksLikeCustomerFollowUp = (message = '') => {
  const text = normalizeMessageText(message);
  if (!text) return false;

  return (
    /(?:שם|טלפון|נייד|פלאפון|חיה|כלב|כלבה|חתול|חתולה|סוג|גזע|מחיר)/.test(text) ||
    /\d/.test(text) ||
    text.split(' ').length <= 4
  );
};

const buildAppointmentContextPayload = (payload = {}, messageText = '') => ({
  customerName: payload.customerName,
  date: payload.date,
  time: payload.time,
  service: payload.service,
  phone: payload.phone,
  petName: payload.petName,
  petType: payload.petType,
  price: payload.price,
  visitFrequencyWeeks: payload.visitFrequencyWeeks,
  isNewCustomerIntent: Boolean(payload.isNewCustomerIntent),
  notes: payload.notes || messageText || ''
});

const CUSTOMER_ASSISTANT_HELP_TEXT =
  'שלום, כאן העוזר של Pawlished. אנחנו מטפלים בכלבים קטנים בלבד 🐶\n' +
  'אפשר לכתוב לי מתי נוח לך לתור, למשל: "אפשר מחר ב-12?" או "אני רוצה תור ביום שלישי". אם זו פעם ראשונה שלך, אשאל גם שם מלא, שם חיית המחמד וסוג/גזע.';

const CUSTOMER_CLARIFICATION_TEXT =
  'לא לגמרי הבנתי 🙂\n' +
  'רצית לקבוע תור? תכתוב יום ושעה (לדוגמה: מחר ב-07:00).\n' +
  'ואם זו פעם ראשונה אצלנו — תרשום גם שם מלא, שם הכלב וסוג/גזע.\n' +
  'אם זו שאלה (מחיר/שעות/כתובת) — תכתוב פה ואני עונה.';

const CUSTOMER_HANDOFF_TEXT =
  'קיבלתי את ההודעה 😊 אני מחכה למענה אנושי ואחזור אליך בהקדם.';

const TRAINING_STEPS = [
  {
    subject: 'קהל יעד',
    question: 'באילו חיות ובאיזה גדלים אתם מטפלים? (למשל: כלבים קטנים בלבד, לא חתולים)'
  },
  {
    subject: 'שעות ותורים',
    question:
      'מה הלו"ז הקבוע של התורים לפי ימים ושעות? (תרשום בצורה מסודרת: ראשון..., שני..., וכו׳)'
  },
  {
    subject: 'מחירון',
    question:
      'מה המחירים לתספורת לפי גזעים/סוגי כלבים קטנים? ואם אין מחיר קבוע לגזע מסוים, מה התשובה הרשמית?'
  },
  {
    subject: 'מיקום',
    question: 'באיזה עיר אתם? והאם שולחים כתובת מדויקת רק אחרי קביעת תור?'
  },
  {
    subject: 'זמן טיפול',
    question: 'כמה זמן לוקח טיפול בדרך כלל?'
  },
  {
    subject: 'השארת כלב',
    question: 'האם משאירים את הכלב ומעדכנים כשהוא מוכן, או שהבעלים נשאר?'
  },
  {
    subject: 'מדיניות ביטול ואיחור',
    question: 'מה מדיניות הביטול ומה קורה אם מאחרים?'
  },
  {
    subject: 'מקדמה ותשלום',
    question: 'האם צריך מקדמה? ואיזה אמצעי תשלום אתם מקבלים?'
  },
  {
    subject: 'שירותים נוספים',
    question: 'אילו שירותים אתם עושים חוץ מתספורת? (מקלחת בלבד, ציפורניים, אוזניים וכו׳)'
  }
];

const looksLikeCustomerGreeting = (message = '') =>
  /^(?:שלום|היי|הי|אהלן|בוקר טוב|צהריים טובים|ערב טוב|לילה טוב)[!?.\s]*$/i.test(
    normalizeMessageText(message)
  );

const looksLikeCustomerGreetingWithName = (message = '') => {
  const text = normalizeMessageText(message);
  if (!text) return false;

  const match = text.match(
    /^(?:שלום|היי|הי|אהלן|הלן|בוקר טוב|צהריים טובים|ערב טוב|לילה טוב)\s+([^\s]+)[!?.\s]*$/iu
  );
  if (!match?.[1]) return false;

  const tail = normalizeMessageText(match[1]);
  if (!tail) return false;
  if (/\d/.test(tail)) return false;
  if (/(?:תור|לקבוע|אשמח|אפשר|מחיר|כמה|שעות|כתובת|איפה|מתי)/u.test(tail)) return false;

  return true;
};

const looksLikeCustomerBookingSignal = (message = '', analysis = {}) => {
  const text = normalizeMessageText(message);
  if (!text) return false;
  if (analysis.date || analysis.time) return true;
  return /(?:תור|לקבוע|לקבוע תור|פנוי|פנויה|מקום|תספורת|אמבטיה|טיפול|מתי אפשר|אפשר להגיע)/u.test(text);
};

const looksLikeCustomerWantsHuman = (message = '') => {
  const text = normalizeMessageText(message);
  if (!text) return false;
  return /(?:מענה אנושי|נציג|בן אדם|אדם|מנהל|מנהלת|לדבר עם|שיחה|תתקשר|טלפון|חייג)/u.test(text);
};

const shouldEscalateCustomerReply = (replyText = '') =>
  /(?:לא זמין|לא בטוח|לא הבנתי|צריך מקור עדכני|אין לי AI|לא יכול לענות)/u.test(
    normalizeMessageText(replyText)
  );

const isGenericCustomerNameCandidate = (value = '') => {
  const text = normalizeMessageText(value);
  if (!text) return true;
  return /^(?:היי|הי|שלום)$/u.test(text) || /(?:רוצה|צריך|צריכה|אפשר|בא לי|תור|לקבוע|פנוי|פנויה|מקום)/u.test(text);
};

const parseTrainingStartQuery = (message = '') => {
  const text = normalizeMessageText(message);
  if (!text) return false;
  return /^(?:אימון|אמן|תתחיל אימון|תתחיל לשאול|תתחיל שאלות|training|train)$/i.test(text);
};

const parseTrainingStopQuery = (message = '') => {
  const text = normalizeMessageText(message);
  if (!text) return false;
  return /^(?:עצור אימון|תפסיק אימון|סיים אימון|עצור|תפסיק|stop training)$/i.test(text);
};

const parseTrainingSkipQuery = (message = '') => {
  const text = normalizeMessageText(message);
  if (!text) return false;
  return /^(?:דלג|דילוג|skip)$/i.test(text);
};

const buildTrainingQuestionText = (stepIndex = 0) => {
  const step = TRAINING_STEPS[stepIndex];
  if (!step) {
    return 'אין עוד שאלות לאימון.';
  }

  return `אימון בוט (שאלה ${stepIndex + 1}/${TRAINING_STEPS.length}):\n${step.question}\n\nאפשר לענות רגיל, או לכתוב "דלג" כדי לדלג, או "עצור אימון" כדי לעצור.`;
};

const startTrainingFlow = async (conversationPhone) => {
  await saveWhatsAppContext(conversationPhone, {
    kind: TRAINING_CONTEXT_KIND,
    payload: { stepIndex: 0 },
    missingFields: [],
    sourceText: ''
  });

  const text = buildTrainingQuestionText(0);
  await sendReplySafely(conversationPhone, text, { intentKind: 'training_question' });
  return text;
};

const handleTrainingFlowReply = async ({ conversationPhone, conversationContext, incomingText }) => {
  const currentIndex = Number(conversationContext?.payload?.stepIndex ?? 0);
  const step = TRAINING_STEPS[currentIndex];

  if (!step) {
    await clearWhatsAppContext(conversationPhone);
    const doneText = 'האימון כבר הסתיים. אם תרצה להתחיל מחדש, כתוב "אימון".';
    await sendReplySafely(conversationPhone, doneText, { intentKind: 'training_done' });
    return doneText;
  }

  if (parseTrainingSkipQuery(incomingText)) {
    const nextIndex = currentIndex + 1;
    if (nextIndex >= TRAINING_STEPS.length) {
      await clearWhatsAppContext(conversationPhone);
      const doneText = 'סיימנו את האימון. תודה! אם תרצה לעדכן משהו, אפשר לכתוב "תזכור ש...".';
      await sendReplySafely(conversationPhone, doneText, { intentKind: 'training_done' });
      return doneText;
    }

    await saveWhatsAppContext(conversationPhone, {
      kind: TRAINING_CONTEXT_KIND,
      payload: { stepIndex: nextIndex },
      missingFields: [],
      sourceText: ''
    });

    const nextText = buildTrainingQuestionText(nextIndex);
    await sendReplySafely(conversationPhone, nextText, { intentKind: 'training_question' });
    return nextText;
  }

  const answer = normalizeMessageText(incomingText);
  if (answer) {
    await saveMemory({
      phone: 'global',
      subject: step.subject,
      value: answer,
      rawText: `training:${step.subject}`
    }).catch(() => null);
  }

  const nextIndex = currentIndex + 1;
  if (nextIndex >= TRAINING_STEPS.length) {
    await clearWhatsAppContext(conversationPhone);
    const doneText = 'סיימנו את האימון. תודה! מעכשיו אני אשמור את התשובות האלו ואשתמש בהן מול לקוחות.';
    await sendReplySafely(conversationPhone, doneText, { intentKind: 'training_done' });
    return doneText;
  }

  await saveWhatsAppContext(conversationPhone, {
    kind: TRAINING_CONTEXT_KIND,
    payload: { stepIndex: nextIndex },
    missingFields: [],
    sourceText: ''
  });

  const nextText = buildTrainingQuestionText(nextIndex);
  await sendReplySafely(conversationPhone, nextText, { intentKind: 'training_question' });
  return nextText;
};

const hydrateCustomerBookingPayload = ({ payload = {}, conversationPhone = '', knownCustomer = null }) => ({
  ...payload,
  phone: payload.phone || conversationPhone || knownCustomer?.phone || '',
  customerName:
    knownCustomer?.name ||
    (isGenericCustomerNameCandidate(payload.customerName) ? '' : payload.customerName || ''),
  petName: payload.petName || knownCustomer?.petName || '',
  petType: payload.petType || knownCustomer?.petType || '',
  price: hasValue(payload.price) ? payload.price : knownCustomer?.defaultPrice,
  visitFrequencyWeeks: payload.visitFrequencyWeeks || knownCustomer?.visitFrequencyWeeks,
  isNewCustomerIntent: Boolean(payload.isNewCustomerIntent || !knownCustomer)
});

const buildCustomerTimeQuestionForDate = (dateValue = '') => {
  const slots = getAllowedSlotsForLocalDate(dateValue);
  if (!slots.length) {
    return 'באיזו שעה נוח לך? אנחנו עובדים ראשון עד שישי.';
  }

  if (slots.length === 1) {
    return `ב-${formatReplyDate(dateValue)} יש תור אחד בלבד בשעה ${slots[0]}. מתאים לך?`;
  }

  return `באיזו שעה נוח לך? ב-${formatReplyDate(dateValue)} אפשר: ${slots.join(', ')}.`;
};

const applyCustomerScheduleRules = (payload = {}) => {
  if (!payload?.date) {
    return { payload, notice: null };
  }

  const allowedSlots = getAllowedSlotsForLocalDate(payload.date);
  if (!allowedSlots.length) {
    return {
      payload: { ...payload, date: '', time: '' },
      notice: 'ביום שבחרת אנחנו לא עובדים. אנחנו עובדים ראשון עד שישי.'
    };
  }

  if (payload?.time && !allowedSlots.includes(payload.time)) {
    return {
      payload: { ...payload, time: '' },
      notice: `ב-${formatReplyDate(payload.date)} אפשר לקבוע רק בשעות: ${allowedSlots.join(', ')}.`
    };
  }

  return { payload, notice: null };
};

const buildCustomerBookingMissingText = ({
  analysis = {},
  missingFields = [],
  knownCustomer = null,
  scheduleNotice = null
}) => {
  const normalizedFields = missingFields.filter((field) => CUSTOMER_BOOKING_FIELD_LABELS[field]);
  const missing = new Set(normalizedFields);

  const needsDate = missing.has('date');
  const needsTime = missing.has('time');
  const needsCustomerDetails = Boolean(
    !knownCustomer && (missing.has('customerName') || missing.has('petName') || missing.has('petType'))
  );

  const lines = [];
  if (scheduleNotice) lines.push(scheduleNotice);

  if (knownCustomer) {
    lines.push(`מעולה 😊 מצאתי אותך במערכת${knownCustomer.petName ? ` עם ${knownCustomer.petName}` : ''}.`);
  } else {
    lines.push('בשמחה 😊');
  }

  if (needsDate && needsTime) {
    lines.push('לאיזה יום ושעה נוחים לך לתור?');
    lines.push('אפשר לענות למשל: מחר ב-07:00.');
  } else if (needsDate) {
    lines.push(CUSTOMER_BOOKING_FIELD_QUESTIONS.date);
    if (analysis.time) {
      lines.push(`ראיתי שעה ${analysis.time} — רק תוסיף יום/תאריך 🙂`);
    }
  } else if (needsTime) {
    const timeQuestion = analysis?.date
      ? buildCustomerTimeQuestionForDate(analysis.date)
      : CUSTOMER_BOOKING_FIELD_QUESTIONS.time;
    lines.push(timeQuestion);
  }

  if (needsCustomerDetails) {
    const details = [];
    if (missing.has('customerName')) details.push('שם מלא');
    if (missing.has('petName')) details.push('שם הכלב');
    if (missing.has('petType')) details.push('סוג/גזע');

    if (details.length > 0) {
      lines.push(`ואם זו פעם ראשונה אצלנו — תרשום גם ${details.join(', ')} (אפשר הכל בהודעה אחת).`);
    }
  }

  lines.push(knownCustomer ? 'לדוגמה: מחר ב-12' : 'לדוגמה: דניאלה, טופי, מלטז, מחר 07:00');

  return joinReplyLines(...lines);
};

const determineAppointmentRecoveryFields = (reason = '', payload = {}) => {
  const message = String(reason || '');

  if (message.includes('כבר נתפסה')) {
    return ['time'];
  }

  if (message.includes('Cannot create appointments in the past')) {
    const today = getIsraelTodayDateString();
    if (payload.date && payload.date === today) {
      return ['time'];
    }
    return ['date'];
  }

  if (message.includes('כמה לקוחות')) {
    return ['phone'];
  }

  if (message.includes('Missing phone for new customer')) {
    return ['phone'];
  }

  if (message.includes('New customers require petName and petType')) {
    return ['petName', 'petType'].filter((field) => !hasValue(payload[field]));
  }

  if (message.includes('לא מצאתי לקוח קיים')) {
    return ['customerLookup'];
  }

  return detectAppointmentMissingFields(payload);
};

const sendWhatsAppTextReply = async (to, bodyText) => {
  if (!canSendWhatsAppReply()) {
    return {
      sent: false,
      reason: 'Missing WHATSAPP_TOKEN or WHATSAPP_PHONE_NUMBER_ID'
    };
  }

  const recipient = normalizeWhatsAppNumber(to);
  if (!recipient) {
    return {
      sent: false,
      reason: 'Missing recipient phone number'
    };
  }

  const response = await fetch(
    `https://graph.facebook.com/v19.0/${whatsappPhoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${whatsappToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: recipient,
        type: 'text',
        text: {
          preview_url: false,
          body: bodyText
        }
      })
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`WhatsApp reply error: ${errorBody}`);
  }

  return { sent: true };
};

const buildConfirmationText = ({ customerName, petName, date, time, price }) => {
  const petLabel = petName ? ` (${petName})` : '';
  const priceLabel = hasValue(price) ? ` במחיר ${price} ש"ח` : '';
  return `לקבוע ל-${customerName}${petLabel} ב-${formatReplyDate(date)} בשעה ${time}${priceLabel}? ענה "כן" כדי לאשר או כתוב מה לשנות.`;
};

const buildBookingSuccessText = ({ customerName, petName, date, time, price }) => {
  const petLabel = petName ? ` (${petName})` : '';
  const priceLabel = hasValue(price) ? ` במחיר ${price} ש"ח` : '';
  return `קבעתי ל-${customerName}${petLabel} תור ב-${formatReplyDate(date)} בשעה ${time}${priceLabel}.`;
};

const buildCustomerConfirmationText = ({ petName, date, time }) => {
  const petLabel = petName ? ` ל-${petName}` : '';
  return `לקבוע לך תור${petLabel} ב-${formatReplyDate(date)} בשעה ${time}? ענה "כן" לאישור או כתוב יום/שעה אחרים.`;
};

const buildCustomerBookingSuccessText = ({ petName, date, time }) => {
  const petLabel = petName ? ` ל-${petName}` : '';
  return `מעולה, קבעתי לך תור${petLabel} ב-${formatReplyDate(date)} בשעה ${time}.`;
};

const isAffirmativeReply = (text = '') => /^(כן|יאשר|מאשר|אישור|סבבה|תאשר|יאללה|ok|okay)$/i.test(normalizeMessageText(text));

const isNegativeReply = (text = '') =>
  /^(לא|בטל|תבטל|ביטול|cancel|לא לאשר)$/i.test(normalizeMessageText(text));

const buildDetectedFragments = (analysis = {}) => {
  const fragments = [];

  if (analysis.customerName) {
    fragments.push(`שם ${analysis.customerName}`);
  }

  if (analysis.date) {
    fragments.push(`יום ${formatReplyDate(analysis.date)}`);
  }

  if (analysis.time) {
    fragments.push(`שעה ${analysis.time}`);
  }

  if (analysis.service) {
    fragments.push(`שירות ${analysis.service}`);
  }

  if (analysis.phone) {
    fragments.push(`טלפון ${analysis.phone}`);
  }

  if (analysis.petName) {
    fragments.push(`שם חיה ${analysis.petName}`);
  }

  if (analysis.petType) {
    fragments.push(`סוג ${analysis.petType}`);
  }

  if (analysis.price) {
    fragments.push(`מחיר ${analysis.price} ש"ח`);
  }

  if (analysis.visitFrequencyWeeks) {
    fragments.push(`תדירות ${analysis.visitFrequencyWeeks} שבועות`);
  }

  return fragments;
};

const buildReadableMissingReply = ({
  intro = '',
  analysis = {},
  missingFields = [],
  labelsMap = APPOINTMENT_FIELD_LABELS,
  questionsMap = APPOINTMENT_FIELD_QUESTIONS,
  example = ''
}) => {
  const normalizedFields = missingFields.filter((field) => labelsMap[field]);
  const detectedFragments = buildDetectedFragments(analysis);
  const firstField = normalizedFields[0];
  const remainingLabels = normalizedFields.slice(1).map((field) => labelsMap[field]);

  return joinReplyLines(
    intro,
    detectedFragments.length > 0 ? `זיהיתי: ${detectedFragments.join(' | ')}` : '',
    firstField ? `חסר עכשיו: ${labelsMap[firstField]}` : '',
    firstField ? questionsMap[firstField] || `מה ${labelsMap[firstField]}?` : '',
    remainingLabels.length > 0 ? `אחר כך נשלים: ${remainingLabels.join(', ')}` : '',
    example
  );
};

const buildParseFailureText = (reason = '', messageText = '', options = {}) => {
  const message = String(reason || '');
  const analysis = options.analysis || (messageText ? analyzeAppointmentMessage(messageText) : {});
  const missingFields = Array.isArray(options.missingFields)
    ? options.missingFields
    : detectAppointmentMissingFields(analysis);

  if (missingFields.includes('customerLookup')) {
    return buildReadableMissingReply({
      intro: 'עוד לא זיהיתי למי לקבוע.',
      analysis,
      missingFields,
      labelsMap: APPOINTMENT_FIELD_LABELS,
      questionsMap: APPOINTMENT_FIELD_QUESTIONS,
      example: BOOKING_EXAMPLE
    });
  }

  if (analysis.isNewCustomerIntent) {
    return buildReadableMissingReply({
      intro: 'כדי לפתוח לקוח חדש ולקבוע תור אני צריך עוד כמה פרטים.',
      analysis,
      missingFields,
      labelsMap: APPOINTMENT_FIELD_LABELS,
      questionsMap: APPOINTMENT_FIELD_QUESTIONS,
      example: NEW_CUSTOMER_BOOKING_EXAMPLE
    });
  }

  if (message.includes('שם לקוח')) {
    return buildReadableMissingReply({
      intro: 'עוד לא זיהיתי את שם הלקוח.',
      analysis,
      missingFields,
      labelsMap: APPOINTMENT_FIELD_LABELS,
      questionsMap: APPOINTMENT_FIELD_QUESTIONS,
      example: BOOKING_EXAMPLE
    });
  }

  if (message.includes('תאריך')) {
    return buildReadableMissingReply({
      intro: 'עוד לא זיהיתי יום או תאריך.',
      analysis,
      missingFields,
      labelsMap: APPOINTMENT_FIELD_LABELS,
      questionsMap: APPOINTMENT_FIELD_QUESTIONS,
      example: BOOKING_EXAMPLE
    });
  }

  if (message.includes('שעה')) {
    return buildReadableMissingReply({
      intro: 'עוד לא זיהיתי שעה.',
      analysis,
      missingFields,
      labelsMap: APPOINTMENT_FIELD_LABELS,
      questionsMap: APPOINTMENT_FIELD_QUESTIONS,
      example: BOOKING_EXAMPLE
    });
  }

  if (message.includes('שירות')) {
    return buildReadableMissingReply({
      intro: 'עוד לא זיהיתי שירות.',
      analysis,
      missingFields,
      labelsMap: APPOINTMENT_FIELD_LABELS,
      questionsMap: APPOINTMENT_FIELD_QUESTIONS,
      example: BOOKING_EXAMPLE
    });
  }

  return buildReadableMissingReply({
    intro: 'לא הבנתי עד הסוף את ההודעה.',
    analysis,
    missingFields,
    labelsMap: APPOINTMENT_FIELD_LABELS,
    questionsMap: APPOINTMENT_FIELD_QUESTIONS,
    example: BOOKING_EXAMPLE
  });
};

const buildBookingFailureText = (reason = '', parsed = {}, messageText = '') => {
  const message = String(reason || '');
  const formattedDate = parsed?.date ? formatReplyDate(parsed.date) : '';
  const formattedTime = parsed?.time ? ` בשעה ${parsed.time}` : '';
  const analysis = messageText ? analyzeAppointmentMessage(messageText) : {};
  const recoveryFields = determineAppointmentRecoveryFields(reason, {
    ...parsed,
    ...analysis
  });

  if (message.includes('כבר נתפסה')) {
    return buildReadableMissingReply({
      intro: `השעה${formattedTime}${formattedDate ? ` ב${formattedDate}` : ''} כבר תפוסה.`,
      analysis: {
        ...analysis,
        ...parsed
      },
      missingFields: recoveryFields,
      labelsMap: APPOINTMENT_FIELD_LABELS,
      questionsMap: APPOINTMENT_FIELD_QUESTIONS
    });
  }

  if (message.includes('Cannot create appointments in the past')) {
    return buildReadableMissingReply({
      intro: formattedDate
        ? `אי אפשר לקבוע תור ל${formattedDate}${formattedTime}. התאריך או השעה כבר עברו.`
        : 'אי אפשר לקבוע תור לזמן שכבר עבר.',
      analysis: {
        ...analysis,
        ...parsed
      },
      missingFields: recoveryFields.length > 0 ? recoveryFields : ['date'],
      labelsMap: APPOINTMENT_FIELD_LABELS,
      questionsMap: APPOINTMENT_FIELD_QUESTIONS,
      example: BOOKING_EXAMPLE
    });
  }

  if (message.includes('כמה לקוחות')) {
    return buildReadableMissingReply({
      intro: `מצאתי כמה לקוחות בשם ${parsed?.customerName || 'הזה'}.`,
      analysis: {
        ...analysis,
        ...parsed
      },
      missingFields: recoveryFields,
      labelsMap: APPOINTMENT_FIELD_LABELS,
      questionsMap: APPOINTMENT_FIELD_QUESTIONS
    });
  }

  if (message.includes('Missing phone for new customer')) {
    return analysis.isNewCustomerIntent
      ? buildReadableMissingReply({
          intro: 'כדי לפתוח את הלקוח החדש ולקבוע לו תור חסר לי טלפון.',
          analysis: {
            ...analysis,
            ...parsed
          },
          missingFields: recoveryFields,
          labelsMap: APPOINTMENT_FIELD_LABELS,
          questionsMap: APPOINTMENT_FIELD_QUESTIONS,
          example: NEW_CUSTOMER_BOOKING_EXAMPLE
        })
      : buildReadableMissingReply({
          intro: 'לא מצאתי לקוח קיים בשם הזה.',
          analysis: {
            ...analysis,
            ...parsed
          },
          missingFields: recoveryFields,
          labelsMap: APPOINTMENT_FIELD_LABELS,
          questionsMap: APPOINTMENT_FIELD_QUESTIONS
      });
  }

  if (message.includes('לא מצאתי לקוח קיים')) {
    return joinReplyLines(
      'לא מצאתי לקוח קיים לפי השם, הכלב או הטלפון.',
      'אם זה לקוח חדש תשלח לי: שם לקוח, טלפון, שם הכלב, סוג הכלב, מחיר ותדירות.'
    );
  }

  if (message.includes('New customers require petName and petType')) {
    return buildReadableMissingReply({
      intro: 'כדי לפתוח לקוח חדש אני צריך גם שם חיה וגם סוג כלב.',
      analysis: {
        ...analysis,
        ...parsed
      },
      missingFields: recoveryFields,
      labelsMap: APPOINTMENT_FIELD_LABELS,
      questionsMap: APPOINTMENT_FIELD_QUESTIONS,
      example: NEW_CUSTOMER_BOOKING_EXAMPLE
    });
  }

  if (message.includes('Missing customer identifier')) {
    return buildReadableMissingReply({
      intro: 'חסר לי לזהות את הלקוח.',
      analysis: {
        ...analysis,
        ...parsed
      },
      missingFields: recoveryFields.length > 0 ? recoveryFields : ['customerLookup'],
      labelsMap: APPOINTMENT_FIELD_LABELS,
      questionsMap: APPOINTMENT_FIELD_QUESTIONS,
      example: BOOKING_EXAMPLE
    });
  }

  if (message.includes('Missing customerName or phone')) {
    return buildReadableMissingReply({
      intro: 'חסר לי שם לקוח או טלפון.',
      analysis: {
        ...analysis,
        ...parsed
      },
      missingFields: recoveryFields,
      labelsMap: APPOINTMENT_FIELD_LABELS,
      questionsMap: APPOINTMENT_FIELD_QUESTIONS,
      example: BOOKING_EXAMPLE
    });
  }

  if (message.includes('Missing required fields')) {
    return buildReadableMissingReply({
      intro: 'חסרים לי עוד פרטים לתור.',
      analysis: {
        ...analysis,
        ...parsed
      },
      missingFields: recoveryFields,
      labelsMap: APPOINTMENT_FIELD_LABELS,
      questionsMap: APPOINTMENT_FIELD_QUESTIONS,
      example: BOOKING_EXAMPLE
    });
  }

  return joinReplyLines(
    'לא הצלחתי לקבוע את התור.',
    message || 'נסה לנסח שוב.'
  );
};

const buildCustomerBookingFailureText = (reason = '', parsed = {}, knownCustomer = null) => {
  const message = String(reason || '');
  const formattedDate = parsed?.date ? formatReplyDate(parsed.date) : '';
  const formattedTime = parsed?.time ? ` בשעה ${parsed.time}` : '';

  if (message.includes('כבר תפוסה') || message.includes('כבר נתפסה')) {
    return joinReplyLines(
      `השעה${formattedTime}${formattedDate ? ` ב${formattedDate}` : ''} כבר תפוסה.`,
      'אפשר לשלוח יום או שעה אחרים ואנסה לקבוע מחדש.'
    );
  }

  if (message.includes('Cannot create appointments in the past')) {
    return joinReplyLines(
      formattedDate
        ? `אי אפשר לקבוע תור ל${formattedDate}${formattedTime}, הזמן הזה כבר עבר.`
        : 'אי אפשר לקבוע תור לזמן שכבר עבר.',
      'שלח לי יום ושעה אחרים.'
    );
  }

  if (message.includes('אנחנו לא עובדים') || message.includes('אפשר לקבוע רק בשעות')) {
    const scheduleAdjusted = applyCustomerScheduleRules(parsed);
    const adjustedPayload = scheduleAdjusted.payload;
    const missingFields = detectCustomerBookingMissingFields(adjustedPayload, knownCustomer);

    return buildCustomerBookingMissingText({
      analysis: adjustedPayload,
      missingFields: missingFields.length > 0 ? missingFields : ['date', 'time'],
      knownCustomer,
      scheduleNotice: scheduleAdjusted.notice || message
    });
  }

  if (message.includes('Missing') || message.includes('לא מצאתי לקוח קיים')) {
    const missingFields = detectCustomerBookingMissingFields(parsed, knownCustomer);
    return buildCustomerBookingMissingText({
      analysis: parsed,
      missingFields: missingFields.length > 0 ? missingFields : ['customerName', 'petName', 'petType'],
      knownCustomer
    });
  }

  return joinReplyLines(
    'לא הצלחתי לקבוע את התור כרגע.',
    'סימנתי לבעל העסק שצריך לבדוק את זה ולחזור אליך.'
  );
};

const buildScheduleMissingDateText = () =>
  'תגיד לי לאיזה יום לבדוק. לדוגמה: מה השעות הפנויות ביום שלישי או מה הלוז השבוע';

const sendReplySafely = async (phone, text, options = {}) => {
  if (!phone || !text) {
    return null;
  }

  let result;
  try {
    result = await sendWhatsAppTextReply(phone, text);
  } catch (error) {
    result = {
      sent: false,
      reason: error?.message || 'Failed to send WhatsApp reply'
    };
  }

  await logWhatsAppMessage({
    phone,
    direction: 'OUTGOING',
    body: text,
    intentKind: options.intentKind || 'bot_reply',
    needsHuman: Boolean(options.needsHuman),
    metadata: {
      sent: Boolean(result?.sent),
      reason: result?.reason,
      ...(options.metadata || {})
    }
  }).catch(() => null);

  return result;
};

const notifyOwners = async (text, metadata = {}) => {
  if (!text || ownerPhoneRecipients.length === 0) return;

  await Promise.all(
    ownerPhoneRecipients.map((ownerPhone) =>
      sendReplySafely(ownerPhone, text, {
        intentKind: 'owner_notification',
        metadata
      }).catch(() => null)
    )
  );
};

const buildQuickReminderPayload = (query = {}, sourceText = '') => ({
  kind: 'quick_reminder_query',
  title: query.title || '',
  remindAt: query.remindAt ? new Date(query.remindAt).toISOString() : null,
  text: query.text || sourceText || ''
});

const detectQuickReminderMissingFields = (query = {}) => {
  const missing = [];
  if (!query.title) missing.push('title');
  if (!query.remindAt || Number.isNaN(new Date(query.remindAt).getTime())) missing.push('remindAt');
  return missing;
};

const buildQuickReminderMissingText = (query = {}) => {
  const missing = detectQuickReminderMissingFields(query);

  if (missing.includes('title') && missing.includes('remindAt')) {
    return 'חסר לי מה להזכיר ומתי. לדוגמה: תזכיר לי עוד 5 דקות להוציא את הכלב.';
  }

  if (missing.includes('title')) {
    return 'מה להזכיר לך? לדוגמה: להוציא את הכלב.';
  }

  return 'מתי להזכיר? אפשר לכתוב: עוד 5 דק, בעוד שעה, מחר ב-10.';
};

const saveQuickReminderContext = async (phone, query = {}, sourceText = '') =>
  saveWhatsAppContext(phone, {
    kind: QUICK_REMINDER_CONTEXT_KIND,
    payload: buildQuickReminderPayload(query, sourceText),
    missingFields: detectQuickReminderMissingFields(query),
    sourceText: sourceText || query.text || ''
  });

const createQuickReminderAndReply = async ({ conversationPhone, query }) => {
  const reminderResult = await createQuickReminderFromQuery({
    title: query.title,
    remindAt: query.remindAt,
    phone: conversationPhone
  });
  await clearWhatsAppContext(conversationPhone);
  const reminderReply = await sendReplySafely(conversationPhone, reminderResult.text);

  return {
    reminderResult,
    reminderReply
  };
};

const createAppointmentAndReply = async ({
  conversationPhone,
  parsed,
  incomingText,
  customerMode = false
}) => {
  const result = await createAppointmentFromStructuredInput({
    customerName: parsed.customerName,
    phone: parsed.phone || (customerMode ? conversationPhone : '') || '',
    date: parsed.date,
    time: parsed.time,
    service: parsed.service,
    notes: parsed.notes || incomingText,
    petName: parsed.petName,
    petType: parsed.petType,
    price: parsed.price,
    visitFrequencyWeeks: parsed.visitFrequencyWeeks,
    allowNewCustomerDefaults: customerMode
  });

  await clearWhatsAppContext(conversationPhone);

  const reminderAt = new Date(new Date(result.appointment.date).getTime() - 60 * 60 * 1000);
  if (conversationPhone && reminderAt.getTime() > Date.now()) {
    await createReminder({
      sourceKind: 'APPOINTMENT',
      sourceId: result.appointment.id,
      phone: conversationPhone,
      title: result.customer?.name || parsed.customerName || parsed.petName || 'תור',
      remindAt: reminderAt,
      payload: {
        customerName: result.customer?.name || parsed.customerName || '',
        petName: result.customer?.petName || parsed.petName || '',
        date: parsed.date,
        time: parsed.time
      }
    });
  }

  const replyPhone = conversationPhone || result.customer?.phone || '';
  const successText = customerMode
    ? buildCustomerBookingSuccessText({
        petName: result.customer?.petName || parsed.petName,
        date: parsed.date,
        time: parsed.time
      })
    : buildBookingSuccessText({
        customerName: result.customer?.name || parsed.customerName || parsed.petName,
        petName: result.customer?.petName || parsed.petName,
        date: parsed.date,
        time: parsed.time,
        price: parsed.price ?? result.customer?.defaultPrice
      });
  const confirmation = await sendReplySafely(replyPhone, successText, {
    intentKind: customerMode ? 'customer_booking_success' : 'appointment_success'
  });

  return {
    result,
    confirmation,
    successText
  };
};

const saveCustomerBookingContext = async (conversationPhone, payload, missingFields, sourceText) =>
  saveWhatsAppContext(conversationPhone, {
    kind: APPOINTMENT_CONTEXT_KIND,
    payload: buildAppointmentContextPayload(payload, sourceText),
    missingFields,
    sourceText: payload.notes || sourceText || ''
  });

const saveCustomerConfirmationContext = async (conversationPhone, payload, sourceText) =>
  saveWhatsAppContext(conversationPhone, {
    kind: APPOINTMENT_CONFIRMATION_CONTEXT_KIND,
    payload: buildAppointmentContextPayload(payload, sourceText),
    missingFields: [],
    sourceText: payload.notes || sourceText || ''
  });

const sendCustomerHandoff = async (res, conversationPhone, incomingText, metadata = {}) => {
  const reply = await sendReplySafely(conversationPhone, CUSTOMER_HANDOFF_TEXT, {
    intentKind: 'human_handoff',
    needsHuman: true,
    metadata: {
      incomingText,
      ...metadata
    }
  });

  const customerPhone = toWhatsAppNumber(conversationPhone) || conversationPhone;
  const ownerAlert = joinReplyLines(
    'צריך מענה אנושי:',
    `לקוח: ${customerPhone}`,
    incomingText ? `הודעה: ${String(incomingText).trim().slice(0, 800)}` : '',
    `כדי לענות: השב ל-${customerPhone}: <הטקסט שלך>`
  );
  await notifyOwners(ownerAlert, {
    customerPhone,
    incomingText,
    ...metadata
  });

  res.status(200).json({
    ok: true,
    accepted: false,
    kind: 'human_handoff',
    text: CUSTOMER_HANDOFF_TEXT,
    reply
  });
};

const parseOwnerHumanReplyCommand = (message = '') => {
  const raw = String(message || '').trim();
  if (!raw) return null;

  const match = raw.match(
    /^(?:השב|ענה|תענה|שלח|תשלח)\s+ל-?\s*([+0-9][0-9\s-]{7,})\s*[:\-]\s*([\s\S]+)$/u
  );
  if (!match?.[1] || !match?.[2]) return null;

  const to = toWhatsAppNumber(match[1]);
  const body = String(match[2]).trim();
  if (!to || !body) return null;

  return { to, body };
};

const handlePublicCustomerMessage = async ({ req, res, incoming, conversationPhone, conversationContext }) => {
  const knownCustomer = conversationPhone
    ? await findCustomerByPhone(conversationPhone).catch(() => null)
    : null;

  const helpQuery = parseAssistantHelpQuery(incoming.text);
  const hasActiveBookingContext = Boolean(
    conversationContext?.kind === APPOINTMENT_CONTEXT_KIND ||
      conversationContext?.kind === APPOINTMENT_CONFIRMATION_CONTEXT_KIND
  );
  const isGreeting = Boolean(helpQuery) || looksLikeCustomerGreeting(incoming.text) || looksLikeCustomerGreetingWithName(incoming.text);

  if (isGreeting && !hasActiveBookingContext) {
    await clearWhatsAppContext(conversationPhone);
    const reply = await sendReplySafely(conversationPhone, CUSTOMER_ASSISTANT_HELP_TEXT, {
      intentKind: 'customer_help'
    });

    res.status(200).json({
      ok: true,
      accepted: true,
      kind: 'customer_help',
      text: CUSTOMER_ASSISTANT_HELP_TEXT,
      reply
    });
    return;
  }

  const customerFaq = getCustomerFaqReply(incoming.text);
  if (customerFaq) {
    const reply = await sendReplySafely(conversationPhone, customerFaq.text, {
      intentKind: customerFaq.intentKind || 'customer_faq'
    });

    res.status(200).json({
      ok: true,
      accepted: true,
      kind: customerFaq.kind || 'customer_faq',
      text: customerFaq.text,
      reply
    });
    return;
  }

  if (conversationContext?.kind === APPOINTMENT_CONFIRMATION_CONTEXT_KIND) {
    if (isAffirmativeReply(incoming.text)) {
      try {
        const bookingResult = await createAppointmentAndReply({
          conversationPhone,
          parsed: conversationContext.payload,
          incomingText: conversationContext.sourceText || incoming.text,
          customerMode: true
        });

        res.status(200).json({
          ok: true,
          accepted: true,
          kind: 'customer_booking_confirmation',
          parsed: conversationContext.payload,
          confirmation: bookingResult.confirmation,
          text: bookingResult.successText,
          ...bookingResult.result
        });
        return;
      } catch (error) {
        const apiError = toApiError(error);
        const failureText = buildCustomerBookingFailureText(
          apiError.message,
          conversationContext.payload,
          knownCustomer
        );

        if (apiError.statusCode >= 500) {
          await sendCustomerHandoff(res, conversationPhone, incoming.text, {
            reason: apiError.message
          });
          return;
        }

        const reply = await sendReplySafely(conversationPhone, failureText, {
          intentKind: 'customer_booking_failure'
        });

        res.status(200).json({
          ok: true,
          accepted: false,
          kind: 'customer_booking_confirmation',
          reason: apiError.message,
          text: failureText,
          reply
        });
        return;
      }
    }

    if (isNegativeReply(incoming.text)) {
      await clearWhatsAppContext(conversationPhone);
      const replyText = 'אין בעיה, ביטלתי את האישור. אפשר לשלוח יום או שעה אחרים.';
      const reply = await sendReplySafely(conversationPhone, replyText, {
        intentKind: 'customer_booking_cancelled'
      });

      res.status(200).json({
        ok: true,
        accepted: false,
        kind: 'customer_booking_confirmation',
        text: replyText,
        reply
      });
      return;
    }

    const { merged } = mergeAppointmentPayload(
      conversationContext.payload,
      incoming.text,
      detectCustomerBookingMissingFields(conversationContext.payload, knownCustomer)
    );
    const hydrated = hydrateCustomerBookingPayload({
      payload: merged,
      conversationPhone,
      knownCustomer
    });
    const scheduleAdjusted = applyCustomerScheduleRules(hydrated);
    const adjustedPayload = scheduleAdjusted.payload;
    const missingFields = detectCustomerBookingMissingFields(adjustedPayload, knownCustomer);

    if (missingFields.length > 0) {
      await saveCustomerBookingContext(conversationPhone, adjustedPayload, missingFields, incoming.text);
      const text = buildCustomerBookingMissingText({
        analysis: adjustedPayload,
        missingFields,
        knownCustomer,
        scheduleNotice: scheduleAdjusted.notice
      });
      const reply = await sendReplySafely(conversationPhone, text, {
        intentKind: 'customer_booking_missing'
      });

      res.status(200).json({
        ok: true,
        accepted: false,
        kind: 'customer_booking',
        missingFields,
        text,
        reply
      });
      return;
    }

    await saveCustomerConfirmationContext(conversationPhone, adjustedPayload, incoming.text);
    const confirmationText = buildCustomerConfirmationText({
      petName: adjustedPayload.petName,
      date: adjustedPayload.date,
      time: adjustedPayload.time
    });
    const confirmationReply = await sendReplySafely(conversationPhone, confirmationText, {
      intentKind: 'customer_booking_confirmation'
    });

    res.status(200).json({
      ok: true,
      accepted: false,
      kind: 'customer_booking_confirmation',
      text: confirmationText,
      reply: confirmationReply,
      parsed: adjustedPayload
    });
    return;
  }

  if (conversationContext?.kind === APPOINTMENT_CONTEXT_KIND) {
    const { merged } = mergeAppointmentPayload(
      conversationContext.payload,
      incoming.text,
      conversationContext.missingFields
    );
    const hydrated = hydrateCustomerBookingPayload({
      payload: merged,
      conversationPhone,
      knownCustomer
    });
    const scheduleAdjusted = applyCustomerScheduleRules(hydrated);
    const adjustedPayload = scheduleAdjusted.payload;
    const missingFields = detectCustomerBookingMissingFields(adjustedPayload, knownCustomer);

    if (missingFields.length > 0) {
      await saveCustomerBookingContext(conversationPhone, adjustedPayload, missingFields, incoming.text);
      const text = buildCustomerBookingMissingText({
        analysis: adjustedPayload,
        missingFields,
        knownCustomer,
        scheduleNotice: scheduleAdjusted.notice
      });
      const reply = await sendReplySafely(conversationPhone, text, {
        intentKind: 'customer_booking_missing'
      });

      res.status(200).json({
        ok: true,
        accepted: false,
        kind: 'customer_booking',
        missingFields,
        text,
        reply
      });
      return;
    }

    await saveCustomerConfirmationContext(conversationPhone, adjustedPayload, incoming.text);
    const confirmationText = buildCustomerConfirmationText({
      petName: adjustedPayload.petName,
      date: adjustedPayload.date,
      time: adjustedPayload.time
    });
    const confirmationReply = await sendReplySafely(conversationPhone, confirmationText, {
      intentKind: 'customer_booking_confirmation'
    });

    res.status(200).json({
      ok: true,
      accepted: false,
      kind: 'customer_booking_confirmation',
      text: confirmationText,
      reply: confirmationReply,
      parsed: adjustedPayload
    });
    return;
  }

  const appointmentAnalysis = hydrateCustomerBookingPayload({
    payload: analyzeAppointmentMessage(incoming.text),
    conversationPhone,
    knownCustomer
  });

  if (looksLikeCustomerBookingSignal(incoming.text, appointmentAnalysis)) {
    const scheduleAdjusted = applyCustomerScheduleRules(appointmentAnalysis);
    const adjustedPayload = scheduleAdjusted.payload;
    const missingFields = detectCustomerBookingMissingFields(adjustedPayload, knownCustomer);

    if (missingFields.length > 0) {
      await saveCustomerBookingContext(conversationPhone, adjustedPayload, missingFields, incoming.text);
      const text = buildCustomerBookingMissingText({
        analysis: adjustedPayload,
        missingFields,
        knownCustomer,
        scheduleNotice: scheduleAdjusted.notice
      });
      const reply = await sendReplySafely(conversationPhone, text, {
        intentKind: 'customer_booking_missing'
      });

      res.status(200).json({
        ok: true,
        accepted: false,
        kind: 'customer_booking',
        missingFields,
        text,
        reply
      });
      return;
    }

    await saveCustomerConfirmationContext(conversationPhone, adjustedPayload, incoming.text);
    const confirmationText = buildCustomerConfirmationText({
      petName: adjustedPayload.petName,
      date: adjustedPayload.date,
      time: adjustedPayload.time
    });
    const confirmationReply = await sendReplySafely(conversationPhone, confirmationText, {
      intentKind: 'customer_booking_confirmation'
    });

    res.status(200).json({
      ok: true,
      accepted: false,
      kind: 'customer_booking_confirmation',
      text: confirmationText,
      reply: confirmationReply,
      parsed: adjustedPayload
    });
    return;
  }

  if (String(process.env.WHATSAPP_CUSTOMER_ONLY_BOOKING || '').toLowerCase() !== 'false') {
    if (looksLikeCustomerWantsHuman(incoming.text)) {
      await sendCustomerHandoff(res, conversationPhone, incoming.text, {
        reason: 'Customer requested human support'
      });
      return;
    }

    const reply = await sendReplySafely(conversationPhone, CUSTOMER_CLARIFICATION_TEXT, {
      intentKind: 'customer_clarify'
    });

    res.status(200).json({
      ok: true,
      accepted: true,
      kind: 'customer_clarify',
      text: CUSTOMER_CLARIFICATION_TEXT,
      reply
    });
    return;
  }

  const generalAssistantQuery = parseGeneralAssistantQuery(incoming.text);
  if (generalAssistantQuery) {
    try {
      const result = await getGeneralAssistantReply({
        phone: conversationPhone,
        query: generalAssistantQuery
      });
      const needsHuman = shouldEscalateCustomerReply(result.text);
      const text = needsHuman ? CUSTOMER_HANDOFF_TEXT : result.text;
      const reply = await sendReplySafely(conversationPhone, text, {
        intentKind: needsHuman ? 'human_handoff' : 'customer_general_answer',
        needsHuman,
        metadata: {
          originalReply: needsHuman ? result.text : undefined,
          incomingText: incoming.text
        }
      });

      res.status(200).json({
        ok: true,
        accepted: !needsHuman,
        kind: needsHuman ? 'human_handoff' : 'customer_general_answer',
        text,
        reply,
        memories: result.memories
      });
      return;
    } catch (error) {
      await sendCustomerHandoff(res, conversationPhone, incoming.text, {
        reason: error?.message || 'General assistant failed'
      });
      return;
    }
  }

  if (looksLikeCustomerWantsHuman(incoming.text)) {
    await sendCustomerHandoff(res, conversationPhone, incoming.text, {
      reason: 'Customer requested human support'
    });
    return;
  }

  const reply = await sendReplySafely(conversationPhone, CUSTOMER_CLARIFICATION_TEXT, {
    intentKind: 'customer_clarify'
  });

  res.status(200).json({
    ok: true,
    accepted: true,
    kind: 'customer_clarify',
    text: CUSTOMER_CLARIFICATION_TEXT,
    reply
  });
};

const getProvidedSecret = (req) =>
  req.headers['x-webhook-secret'] ||
  req.headers['x-api-secret'] ||
  req.body?.secret ||
  '';

const isMetaPayload = (body) =>
  body?.object === 'whatsapp_business_account' || Boolean(body?.entry?.[0]?.changes?.[0]?.value);

const extractIncomingMessage = (body) => {
  if (typeof body?.text === 'string') {
    return {
      text: body.text,
      from: body.from || '',
      type: 'text'
    };
  }

  const message = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  return {
    text: message?.text?.body || '',
    from: message?.from || '',
    type: message?.type || ''
  };
};

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && verifyToken && token === verifyToken) {
      res.status(200).send(challenge);
      return;
    }

    res.status(403).send('Forbidden');
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  if (webhookSecret && !isMetaPayload(req.body)) {
    const providedSecret = String(getProvidedSecret(req));
    if (!providedSecret || providedSecret !== webhookSecret) {
      res.status(401).json({ ok: false, error: 'Unauthorized webhook call' });
      return;
    }
  }

  try {
    const incoming = extractIncomingMessage(req.body || {});
    const conversationPhone = incoming.from || req.body?.customerPhone || '';
    const conversationContext = conversationPhone
      ? await loadWhatsAppContext(conversationPhone)
      : null;

    if (!incoming.text) {
      res.status(200).json({
        ok: true,
        ignored: true,
        reason: incoming.type ? `Unsupported message type: ${incoming.type}` : 'No message text received'
      });
      return;
    }

    await logWhatsAppMessage({
      phone: conversationPhone,
      direction: 'INCOMING',
      body: incoming.text,
      messageType: incoming.type || 'text',
      intentKind: 'incoming',
      metadata: {
        isMetaPayload: isMetaPayload(req.body || {})
      }
    }).catch(() => null);

    if (isPublicCustomerConversation(conversationPhone, req.body || {})) {
      await handlePublicCustomerMessage({
        req,
        res,
        incoming,
        conversationPhone,
        conversationContext
      });
      return;
    }

    await learnFromIncomingMessage({
      phone: conversationPhone,
      text: incoming.text
    }).catch(() => null);

    const ownerHumanReply = isOwnerConversation(conversationPhone, req.body || {})
      ? parseOwnerHumanReplyCommand(incoming.text)
      : null;
    if (ownerHumanReply) {
      const sendResult = await sendReplySafely(ownerHumanReply.to, ownerHumanReply.body, {
        intentKind: 'human_reply',
        metadata: {
          byOwnerPhone: toWhatsAppNumber(conversationPhone) || normalizeWhatsAppNumber(conversationPhone)
        }
      });

      const ackText = sendResult?.sent
        ? `שלחתי ל-${ownerHumanReply.to}: ${ownerHumanReply.body}`
        : `לא הצלחתי לשלוח ל-${ownerHumanReply.to}. ${sendResult?.reason || ''}`.trim();

      const ackReply = await sendReplySafely(conversationPhone, ackText, {
        intentKind: 'human_reply_ack',
        metadata: {
          to: ownerHumanReply.to,
          sent: Boolean(sendResult?.sent),
          reason: sendResult?.reason
        }
      });

      res.status(200).json({
        ok: true,
        accepted: Boolean(sendResult?.sent),
        kind: 'owner_human_reply',
        to: ownerHumanReply.to,
        text: ackText,
        reply: ackReply
      });
      return;
    }

    if (parseTrainingStopQuery(incoming.text)) {
      await clearWhatsAppContext(conversationPhone);
      const replyText = 'עצרתי את האימון. כשתרצה להתחיל שוב, כתוב "אימון".';
      const reply = await sendReplySafely(conversationPhone, replyText, { intentKind: 'training_stop' });
      res.status(200).json({ ok: true, accepted: true, kind: 'training_stop', text: replyText, reply });
      return;
    }

    if (conversationContext?.kind === TRAINING_CONTEXT_KIND) {
      const text = await handleTrainingFlowReply({
        conversationPhone,
        conversationContext,
        incomingText: incoming.text
      });
      res.status(200).json({ ok: true, accepted: true, kind: 'training', text });
      return;
    }

    if (parseTrainingStartQuery(incoming.text)) {
      const text = await startTrainingFlow(conversationPhone);
      res.status(200).json({ ok: true, accepted: true, kind: 'training_start', text });
      return;
    }

    const assistantHelpQuery = parseAssistantHelpQuery(incoming.text);
    if (assistantHelpQuery) {
      await clearWhatsAppContext(conversationPhone);
      const helpReply = await sendReplySafely(conversationPhone, ASSISTANT_HELP_TEXT);

      res.status(200).json({
        ok: true,
        accepted: true,
        kind: 'assistant_help',
        query: assistantHelpQuery,
        reply: helpReply,
        text: ASSISTANT_HELP_TEXT
      });
      return;
    }

    const reminderManagementQuery = parseReminderManagementQuery(incoming.text);
    if (reminderManagementQuery) {
      await clearWhatsAppContext(conversationPhone);

      try {
        const reminderManagementResult = await handleReminderManagementQuery({
          phone: conversationPhone,
          query: reminderManagementQuery
        });
        const reminderManagementReply = await sendReplySafely(
          conversationPhone,
          reminderManagementResult.text
        );

        res.status(200).json({
          ok: true,
          accepted: true,
          kind: 'reminder_management_query',
          query: reminderManagementQuery,
          text: reminderManagementResult.text,
          reply: reminderManagementReply,
          reminders: reminderManagementResult.reminders
        });
        return;
      } catch (error) {
        const apiError = toApiError(error);
        const reminderManagementReply = await sendReplySafely(conversationPhone, apiError.message);
        res.status(200).json({
          ok: true,
          accepted: false,
          kind: 'reminder_management_query',
          query: reminderManagementQuery,
          reason: apiError.message,
          text: apiError.message,
          reply: reminderManagementReply
        });
        return;
      }
    }

    const memoryQuery = parseMemoryQuery(incoming.text);
    if (memoryQuery) {
      await clearWhatsAppContext(conversationPhone);

      try {
        const memoryResult = await handleMemoryQuery({
          phone: conversationPhone,
          query: memoryQuery
        });
        const memoryReply = await sendReplySafely(conversationPhone, memoryResult.text);

        res.status(200).json({
          ok: true,
          accepted: true,
          kind: 'memory_query',
          query: memoryQuery,
          text: memoryResult.text,
          reply: memoryReply,
          memory: memoryResult.memory,
          memories: memoryResult.memories
        });
        return;
      } catch (error) {
        const apiError = toApiError(error);
        const memoryReply = await sendReplySafely(conversationPhone, apiError.message);
        res.status(200).json({
          ok: true,
          accepted: false,
          kind: 'memory_query',
          query: memoryQuery,
          reason: apiError.message,
          text: apiError.message,
          reply: memoryReply
        });
        return;
      }
    }

    const learningQuery = parseLearningQuery(incoming.text);
    if (learningQuery) {
      await clearWhatsAppContext(conversationPhone);

      try {
        const learningResult = await getLearningReply({
          phone: conversationPhone
        });
        const learningReply = await sendReplySafely(conversationPhone, learningResult.text);

        res.status(200).json({
          ok: true,
          accepted: true,
          kind: 'learning_query',
          query: learningQuery,
          text: learningResult.text,
          reply: learningReply,
          memories: learningResult.memories,
          events: learningResult.events
        });
        return;
      } catch (error) {
        const apiError = toApiError(error);
        const learningReply = await sendReplySafely(conversationPhone, apiError.message);
        res.status(200).json({
          ok: true,
          accepted: false,
          kind: 'learning_query',
          query: learningQuery,
          reason: apiError.message,
          text: apiError.message,
          reply: learningReply
        });
        return;
      }
    }

    const autoLearningQuery = parseAutoLearningQuery(incoming.text);
    if (autoLearningQuery) {
      await clearWhatsAppContext(conversationPhone);
      const autoLearningResult = await getAutoLearningReply({
        query: autoLearningQuery
      });
      const autoLearningReply = await sendReplySafely(conversationPhone, autoLearningResult.text);

      res.status(200).json({
        ok: true,
        accepted: true,
        kind: 'auto_learning_query',
        query: autoLearningQuery,
        text: autoLearningResult.text,
        reply: autoLearningReply
      });
      return;
    }

    const businessAdviceQuery = parseBusinessAdviceQuery(incoming.text);
    if (businessAdviceQuery) {
      await clearWhatsAppContext(conversationPhone);

      try {
        const adviceResult = await getBusinessAdviceReply({
          phone: conversationPhone
        });
        const adviceReply = await sendReplySafely(conversationPhone, adviceResult.text);

        res.status(200).json({
          ok: true,
          accepted: true,
          kind: 'business_advice_query',
          query: businessAdviceQuery,
          text: adviceResult.text,
          reply: adviceReply,
          snapshot: adviceResult.snapshot,
          memories: adviceResult.memories
        });
        return;
      } catch (error) {
        const apiError = toApiError(error);
        const adviceReply = await sendReplySafely(conversationPhone, apiError.message);
        res.status(200).json({
          ok: true,
          accepted: false,
          kind: 'business_advice_query',
          query: businessAdviceQuery,
          reason: apiError.message,
          text: apiError.message,
          reply: adviceReply
        });
        return;
      }
    }

    const generalAssistantQuery = parseGeneralAssistantQuery(incoming.text);
    if (generalAssistantQuery && generalAssistantQuery.action !== 'answer') {
      await clearWhatsAppContext(conversationPhone);

      try {
        const generalAssistantResult = await getGeneralAssistantReply({
          phone: conversationPhone,
          query: generalAssistantQuery
        });
        const generalAssistantReply = await sendReplySafely(
          conversationPhone,
          generalAssistantResult.text
        );

        res.status(200).json({
          ok: true,
          accepted: true,
          kind: 'general_assistant_query',
          query: generalAssistantQuery,
          text: generalAssistantResult.text,
          reply: generalAssistantReply,
          memories: generalAssistantResult.memories
        });
        return;
      } catch (error) {
        const apiError = toApiError(error);
        const generalAssistantReply = await sendReplySafely(conversationPhone, apiError.message);
        res.status(200).json({
          ok: true,
          accepted: false,
          kind: 'general_assistant_query',
          query: generalAssistantQuery,
          reason: apiError.message,
          text: apiError.message,
          reply: generalAssistantReply
        });
        return;
      }
    }

    if (conversationContext?.kind === APPOINTMENT_CONFIRMATION_CONTEXT_KIND) {
      if (isAffirmativeReply(incoming.text)) {
        try {
          const bookingResult = await createAppointmentAndReply({
            conversationPhone,
            parsed: conversationContext.payload,
            incomingText: conversationContext.sourceText || incoming.text
          });

          res.status(200).json({
            ok: true,
            accepted: true,
            kind: 'appointment_confirmation',
            parsed: conversationContext.payload,
            confirmation: bookingResult.confirmation,
            text: bookingResult.successText,
            ...bookingResult.result
          });
          return;
        } catch (error) {
          const apiError = toApiError(error);
          const failureText = buildBookingFailureText(
            apiError.message,
            conversationContext.payload,
            conversationContext.sourceText || incoming.text
          );
          const failureReply = await sendReplySafely(conversationPhone, failureText);

          res.status(200).json({
            ok: true,
            accepted: false,
            kind: 'appointment_confirmation',
            reason: apiError.message,
            text: failureText,
            reply: failureReply
          });
          return;
        }
      }

      if (isNegativeReply(incoming.text)) {
        await clearWhatsAppContext(conversationPhone);
        const replyText = 'ביטלתי את האישור. תכתוב לי מה לשנות או שלח בקשה חדשה.';
        const reply = await sendReplySafely(conversationPhone, replyText);
        res.status(200).json({
          ok: true,
          accepted: false,
          kind: 'appointment_confirmation',
          text: replyText,
          reply
        });
        return;
      }

      const { merged } = mergeAppointmentPayload(
        conversationContext.payload,
        incoming.text,
        detectAppointmentMissingFields(conversationContext.payload)
      );
      const missingFields = detectAppointmentMissingFields(merged);
      if (missingFields.length > 0) {
        await saveWhatsAppContext(conversationPhone, {
          kind: APPOINTMENT_CONTEXT_KIND,
          payload: buildAppointmentContextPayload(merged, incoming.text),
          missingFields,
          sourceText: merged.notes || incoming.text
        });
        const parseFailureText = buildParseFailureText('Missing required fields', incoming.text, {
          analysis: merged,
          missingFields
        });
        const parseReply = await sendReplySafely(conversationPhone, parseFailureText);
        res.status(200).json({
          ok: true,
          accepted: false,
          kind: 'appointment_confirmation',
          text: parseFailureText,
          reply: parseReply
        });
        return;
      }

      await saveWhatsAppContext(conversationPhone, {
        kind: APPOINTMENT_CONFIRMATION_CONTEXT_KIND,
        payload: buildAppointmentContextPayload(merged, incoming.text),
        missingFields: [],
        sourceText: merged.notes || incoming.text
      });
      const confirmationText = buildConfirmationText({
        customerName: merged.customerName || merged.petName,
        petName: merged.petName,
        date: merged.date,
        time: merged.time,
        price: merged.price
      });
      const confirmationReply = await sendReplySafely(conversationPhone, confirmationText);
      res.status(200).json({
        ok: true,
        accepted: false,
        kind: 'appointment_confirmation',
        text: confirmationText,
        reply: confirmationReply,
        parsed: merged
      });
      return;
    }

    if (conversationContext?.kind === QUICK_REMINDER_CONTEXT_KIND) {
      const reminderQuery = parseQuickReminderQuery(incoming.text, conversationContext.payload);

      if (reminderQuery) {
        const missingFields = detectQuickReminderMissingFields(reminderQuery);
        if (missingFields.length > 0) {
          await saveQuickReminderContext(conversationPhone, reminderQuery, incoming.text);
          const reminderMissingText = buildQuickReminderMissingText(reminderQuery);
          const reminderMissingReply = await sendReplySafely(conversationPhone, reminderMissingText);

          res.status(200).json({
            ok: true,
            accepted: false,
            kind: 'quick_reminder_query',
            query: reminderQuery,
            missingFields,
            text: reminderMissingText,
            reply: reminderMissingReply
          });
          return;
        }

        try {
          const { reminderResult, reminderReply } = await createQuickReminderAndReply({
            conversationPhone,
            query: reminderQuery
          });

          res.status(200).json({
            ok: true,
            accepted: true,
            kind: 'quick_reminder_query',
            query: reminderQuery,
            text: reminderResult.text,
            reply: reminderReply
          });
          return;
        } catch (error) {
          const apiError = toApiError(error);
          const reminderReply = await sendReplySafely(conversationPhone, apiError.message);
          res.status(200).json({
            ok: true,
            accepted: false,
            kind: 'quick_reminder_query',
            query: reminderQuery,
            text: apiError.message,
            reply: reminderReply
          });
          return;
        }
      }
    }

    const quickReminderQuery = parseQuickReminderQuery(incoming.text);
    if (quickReminderQuery) {
      const missingFields = detectQuickReminderMissingFields(quickReminderQuery);
      if (missingFields.length > 0) {
        await saveQuickReminderContext(conversationPhone, quickReminderQuery, incoming.text);
        const reminderMissingText = buildQuickReminderMissingText(quickReminderQuery);
        const reminderMissingReply = await sendReplySafely(conversationPhone, reminderMissingText);

        res.status(200).json({
          ok: true,
          accepted: false,
          kind: 'quick_reminder_query',
          query: quickReminderQuery,
          missingFields,
          text: reminderMissingText,
          reply: reminderMissingReply
        });
        return;
      }

      try {
        const { reminderResult, reminderReply } = await createQuickReminderAndReply({
          conversationPhone,
          query: quickReminderQuery
        });
        res.status(200).json({
          ok: true,
          accepted: true,
          kind: 'quick_reminder_query',
          query: quickReminderQuery,
          text: reminderResult.text,
          reply: reminderReply
        });
        return;
      } catch (error) {
        const apiError = toApiError(error);
        const reminderReply = await sendReplySafely(conversationPhone, apiError.message);
        res.status(200).json({
          ok: true,
          accepted: false,
          kind: 'quick_reminder_query',
          query: quickReminderQuery,
          text: apiError.message,
          reply: reminderReply
        });
        return;
      }
    }

    const calendarEventQuery = parseCalendarEventQuery(incoming.text);
    if (calendarEventQuery) {
      try {
        const eventResult = await createCalendarEventFromQuery({
          title: calendarEventQuery.title,
          date: calendarEventQuery.date,
          time: calendarEventQuery.time,
          phone: conversationPhone
        });
        const eventReply = await sendReplySafely(conversationPhone, eventResult.text);
        res.status(200).json({
          ok: true,
          accepted: true,
          kind: 'calendar_event_query',
          query: calendarEventQuery,
          text: eventResult.text,
          reply: eventReply,
          event: eventResult.event
        });
        return;
      } catch (error) {
        const apiError = toApiError(error);
        const eventReply = await sendReplySafely(conversationPhone, apiError.message);
        res.status(200).json({
          ok: true,
          accepted: false,
          kind: 'calendar_event_query',
          query: calendarEventQuery,
          text: apiError.message,
          reply: eventReply
        });
        return;
      }
    }

    const scheduleQuery = parseScheduleQuery(incoming.text);
    if (scheduleQuery) {
      await clearWhatsAppContext(conversationPhone);
      const scheduleReplyText = scheduleQuery.missingDate
        ? buildScheduleMissingDateText()
        : (
            await getScheduleWindowReply({
              period: scheduleQuery.period,
              date: scheduleQuery.date,
              startDate: scheduleQuery.startDate,
              endDate: scheduleQuery.endDate,
              mode: scheduleQuery.mode
            })
          ).text;

      const scheduleReply = await sendReplySafely(
        incoming.from || req.body?.customerPhone || '',
        scheduleReplyText
      );

      res.status(200).json({
        ok: true,
        accepted: true,
        kind: 'schedule_query',
        query: scheduleQuery,
        reply: scheduleReply,
        text: scheduleReplyText
      });
      return;
    }

    const statsQuery = parseStatsQuery(incoming.text);
    if (statsQuery) {
      await clearWhatsAppContext(conversationPhone);
      const statsReplyResult = await getStatsReply(statsQuery);
      const statsReply = await sendReplySafely(
        incoming.from || req.body?.customerPhone || '',
        statsReplyResult.text
      );

      res.status(200).json({
        ok: true,
        accepted: true,
        kind: 'stats_query',
        query: statsQuery,
        reply: statsReply,
        text: statsReplyResult.text,
        snapshot: statsReplyResult.snapshot
      });
      return;
    }

    const taskQuery = parseTaskQuery(incoming.text);
    if (taskQuery) {
      try {
        await clearWhatsAppContext(conversationPhone);
        let taskReplyResult;

        if (taskQuery.action === 'summary') {
          taskReplyResult = await getTasksReply('summary');
        } else if (taskQuery.action === 'list_open') {
          taskReplyResult = await getTasksReply('list_open');
        } else if (taskQuery.action === 'status') {
          taskReplyResult = await getTaskStatusReply(taskQuery.selector);
        } else if (taskQuery.action === 'create') {
          taskReplyResult = await createTaskFromQuery({
            title: taskQuery.title,
            date: taskQuery.date
          });
        } else if (taskQuery.action === 'create_bulk') {
          taskReplyResult = await createBulkTasksFromQuery({
            titles: taskQuery.titles,
            date: taskQuery.date
          });
        } else if (taskQuery.action === 'complete') {
          taskReplyResult = await completeTaskFromQuery(taskQuery.selector);
        } else if (taskQuery.action === 'reopen') {
          taskReplyResult = await reopenTaskFromQuery(taskQuery.selector);
        } else if (taskQuery.action === 'delete') {
          taskReplyResult = await deleteTaskFromQuery(taskQuery.selector);
        } else {
          taskReplyResult = {
            text: 'לא הבנתי מה לעשות עם המשימה. נסה לכתוב: תוסיף משימה לחזור ללקוח'
          };
        }

        const taskReply = await sendReplySafely(
          incoming.from || req.body?.customerPhone || '',
          taskReplyResult.text
        );

        res.status(200).json({
          ok: true,
          accepted: true,
          kind: 'task_query',
          query: taskQuery,
          reply: taskReply,
          text: taskReplyResult.text
        });
        return;
      } catch (error) {
        const apiError = toApiError(error);
        const taskFailureReply = await sendReplySafely(
          incoming.from || req.body?.customerPhone || '',
          apiError.message
        );

        res.status(200).json({
          ok: true,
          accepted: false,
          kind: 'task_query',
          query: taskQuery,
          reason: apiError.message,
          reply: taskFailureReply
        });
        return;
      }
    }

    let customerQuery = parseCustomerQuery(incoming.text);
    if (
      !customerQuery &&
      conversationContext?.kind === CUSTOMER_CONTEXT_KIND &&
      looksLikeCustomerFollowUp(incoming.text)
    ) {
      customerQuery = {
        kind: 'customer_query',
        action: 'create',
        ...mergeCustomerDetails(
          conversationContext.payload,
          incoming.text,
          conversationContext.missingFields
        )
      };
    }

    if (customerQuery) {
      const customerMissingFields = detectCustomerMissingFields(customerQuery);
      try {
        const customerResult = await createCustomerFromQuery(customerQuery);
        await clearWhatsAppContext(conversationPhone);
        const customerReply = await sendReplySafely(
          conversationPhone,
          customerResult.text
        );

        res.status(200).json({
          ok: true,
          accepted: true,
          kind: 'customer_query',
          query: customerQuery,
          reply: customerReply,
          text: customerResult.text,
          customer: customerResult.customer
        });
        return;
      } catch (error) {
        const apiError = toApiError(error);
        let customerFailureText = buildCustomerFailureText(apiError.message);
        if (customerMissingFields.length > 0) {
          customerFailureText = buildReadableMissingReply({
            intro: 'כדי להוסיף לקוח חדש אני צריך עוד כמה פרטים.',
            analysis: customerQuery,
            missingFields: customerMissingFields,
            labelsMap: CUSTOMER_FIELD_LABELS,
            questionsMap: CUSTOMER_FIELD_QUESTIONS,
            example: CUSTOMER_EXAMPLE
          });
          await saveWhatsAppContext(conversationPhone, {
            kind: CUSTOMER_CONTEXT_KIND,
            payload: customerQuery,
            missingFields: customerMissingFields,
            sourceText: customerQuery.text || incoming.text
          });
        }

        const customerFailureReply = await sendReplySafely(
          conversationPhone,
          customerFailureText
        );

        res.status(200).json({
          ok: true,
          accepted: false,
          kind: 'customer_query',
          query: customerQuery,
          reason: apiError.message,
          text: customerFailureText,
          reply: customerFailureReply
        });
        return;
      }
    }

    const generalAssistantFallbackQuery = parseGeneralAssistantQuery(incoming.text);
    if (generalAssistantFallbackQuery) {
      await clearWhatsAppContext(conversationPhone);

      try {
        const generalAssistantResult = await getGeneralAssistantReply({
          phone: conversationPhone,
          query: generalAssistantFallbackQuery
        });
        const generalAssistantReply = await sendReplySafely(
          conversationPhone,
          generalAssistantResult.text
        );

        res.status(200).json({
          ok: true,
          accepted: true,
          kind: 'general_assistant_query',
          query: generalAssistantFallbackQuery,
          text: generalAssistantResult.text,
          reply: generalAssistantReply,
          memories: generalAssistantResult.memories
        });
        return;
      } catch (error) {
        const apiError = toApiError(error);
        const generalAssistantReply = await sendReplySafely(conversationPhone, apiError.message);
        res.status(200).json({
          ok: true,
          accepted: false,
          kind: 'general_assistant_query',
          query: generalAssistantFallbackQuery,
          reason: apiError.message,
          text: apiError.message,
          reply: generalAssistantReply
        });
        return;
      }
    }

    let parsed;
    let parsedFromContext = false;
    let appointmentAnalysis = analyzeAppointmentMessage(incoming.text);

    try {
      if (req.body?.parsed && typeof req.body.parsed === 'object') {
        parsed = req.body.parsed;
      } else {
        try {
          parsed = parseAppointmentMessage(incoming.text);
        } catch (error) {
          const initialMissingFields = detectAppointmentMissingFields(appointmentAnalysis);

          if (conversationContext?.kind === APPOINTMENT_CONTEXT_KIND) {
            const { merged } = mergeAppointmentPayload(
              conversationContext.payload,
              incoming.text,
              conversationContext.missingFields
            );
            const mergedMissingFields = detectAppointmentMissingFields(merged);
            appointmentAnalysis = merged;

            if (mergedMissingFields.length === 0) {
              parsed = {
                customerName: merged.customerName,
                date: merged.date,
                time: merged.time,
                service: merged.service,
                phone: merged.phone,
                petName: merged.petName,
                petType: merged.petType,
                price: merged.price,
                visitFrequencyWeeks: merged.visitFrequencyWeeks,
                notes: merged.notes || incoming.text
              };
              parsedFromContext = true;
            } else {
              await saveWhatsAppContext(conversationPhone, {
                kind: APPOINTMENT_CONTEXT_KIND,
                payload: buildAppointmentContextPayload(merged, incoming.text),
                missingFields: mergedMissingFields,
                sourceText: merged.notes || incoming.text
              });

              const parseFailureText = buildParseFailureText(error?.message, incoming.text, {
                analysis: merged,
                missingFields: mergedMissingFields
              });
              const parseReply = await sendReplySafely(conversationPhone, parseFailureText);

              res.status(200).json({
                ok: true,
                accepted: false,
                reason: error?.message || 'Could not parse message',
                receivedText: incoming.text,
                text: parseFailureText,
                reply: parseReply
              });
              return;
            }
          } else {
            await saveWhatsAppContext(conversationPhone, {
              kind: APPOINTMENT_CONTEXT_KIND,
              payload: buildAppointmentContextPayload(appointmentAnalysis, incoming.text),
              missingFields: initialMissingFields,
              sourceText: incoming.text
            });

            const parseFailureText = buildParseFailureText(error?.message, incoming.text, {
              analysis: appointmentAnalysis,
              missingFields: initialMissingFields
            });
            const parseReply = await sendReplySafely(conversationPhone, parseFailureText);

            res.status(200).json({
              ok: true,
              accepted: false,
              reason: error?.message || 'Could not parse message',
              receivedText: incoming.text,
              text: parseFailureText,
              reply: parseReply
            });
            return;
          }
        }
      }
    } catch (error) {
      throw error;
    }

    try {
      const normalizedParsed = {
        customerName: parsed.customerName,
        date: parsed.date,
        time: parsed.time,
        service: parsed.service || 'תספורת',
        phone: req.body?.customerPhone || parsed.customerPhone || parsed.phone || '',
        petName: req.body?.petName || parsed.petName,
        petType: req.body?.petType || parsed.petType,
        price: req.body?.price ?? parsed.price,
        visitFrequencyWeeks: parsed.visitFrequencyWeeks,
        isNewCustomerIntent: Boolean(
          appointmentAnalysis.isNewCustomerIntent ||
            parsed.isNewCustomerIntent ||
            req.body?.isNewCustomerIntent
        ),
        notes: parsed.notes || incoming.text
      };

      await saveWhatsAppContext(conversationPhone, {
        kind: APPOINTMENT_CONFIRMATION_CONTEXT_KIND,
        payload: buildAppointmentContextPayload(normalizedParsed, incoming.text),
        missingFields: [],
        sourceText: normalizedParsed.notes || incoming.text
      });

      const confirmationText = buildConfirmationText({
        customerName: normalizedParsed.customerName || normalizedParsed.petName,
        petName: normalizedParsed.petName,
        date: normalizedParsed.date,
        time: normalizedParsed.time,
        price: normalizedParsed.price
      });
      const confirmationReply = await sendReplySafely(conversationPhone, confirmationText);

      res.status(200).json({
        ok: true,
        accepted: false,
        parsed: normalizedParsed,
        parsedFromContext,
        reply: confirmationReply,
        text: confirmationText
      });
    } catch (error) {
      const apiError = toApiError(error);
      if (apiError.statusCode < 500) {
        const recoveryFields = determineAppointmentRecoveryFields(apiError.message, {
          ...parsed,
          ...appointmentAnalysis
        });
        await saveWhatsAppContext(conversationPhone, {
          kind: APPOINTMENT_CONTEXT_KIND,
          payload: buildAppointmentContextPayload(
            {
              ...parsed,
              ...appointmentAnalysis
            },
            incoming.text
          ),
          missingFields: recoveryFields,
          sourceText: parsed?.notes || incoming.text
        });

        const bookingFailureText = buildBookingFailureText(apiError.message, parsed, incoming.text);
        const failureReply = await sendReplySafely(
          conversationPhone,
          bookingFailureText
        );

        res.status(200).json({
          ok: true,
          accepted: false,
          parsed,
          reason: apiError.message,
          text: bookingFailureText,
          reply: failureReply
        });
        return;
      }

      throw error;
    }
  } catch (error) {
    const apiError = toApiError(error);
    res.status(apiError.statusCode).json({
      ok: false,
      error: apiError.message
    });
  }
}
