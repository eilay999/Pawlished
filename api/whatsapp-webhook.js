import {
  createAppointmentFromStructuredInput,
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
import { analyzeAppointmentMessage, parseAppointmentMessage } from './_lib/whatsappParser.js';
import {
  clearWhatsAppContext,
  loadWhatsAppContext,
  saveWhatsAppContext
} from './_lib/whatsappContext.js';

const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || '';
const webhookSecret = process.env.WHATSAPP_WEBHOOK_SECRET || '';
const whatsappToken = process.env.WHATSAPP_TOKEN || '';
const whatsappPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
const ISRAEL_TIME_ZONE = 'Asia/Jerusalem';
const BOOKING_EXAMPLE = 'לדוגמה: שים את אביבית ביום שני ב-10 תספורת';
const CUSTOMER_EXAMPLE = 'לדוגמה: לקוח חדש דניאלה להבי, טלפון 0501234567, שם חיה טופי, סוג מלטז';
const NEW_CUSTOMER_BOOKING_EXAMPLE =
  'לדוגמה: לקוח חדש דניאלה להבי, טלפון 0501234567, שם חיה טופי, סוג מלטז, ביום ראשון ב-29 לחודש בשעה 07:00 תור';
const APPOINTMENT_CONTEXT_KIND = 'APPOINTMENT';
const CUSTOMER_CONTEXT_KIND = 'CUSTOMER';
const SUPPORTED_SERVICE_HINT = 'תספורת, אמבטיה, טיפול מלא, גזירת ציפורניים, ניקוי אוזניים או סירוק';
const ASSISTANT_HELP_TEXT =
  'אני העוזר של Pawlished. אפשר לבקש ממני לקבוע תור, להוסיף לקוח חדש, לשאול על לוז יומי או שבועי, לבדוק סטטיסטיקה ולנהל משימות.\n' +
  'אם חסר פרט, אפשר לענות רק עם החלק החסר. לדוגמה: אם ביקשתי שעה, אפשר לענות פשוט "7" או "07:00".';

const canSendWhatsAppReply = () => Boolean(whatsappToken && whatsappPhoneNumberId);

const normalizeWhatsAppNumber = (value = '') => String(value || '').replace(/\D/g, '');

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

const detectAppointmentMissingFields = (payload = {}) => {
  const missing = [];

  if (!payload.customerName) missing.push('customerName');
  if (!payload.date) missing.push('date');
  if (!payload.time) missing.push('time');
  if (!payload.service) missing.push('service');

  if (payload.isNewCustomerIntent) {
    if (!payload.phone) missing.push('phone');
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
  return missing;
};

const inferValueForAppointmentField = (field, messageText, analysis = {}) => {
  if (field === 'time') return analysis.time || inferLooseTime(messageText);
  if (field === 'date') return analysis.date || inferUpcomingDateFromDayOfMonth(messageText);
  if (field === 'service') return analysis.service || null;
  if (field === 'phone') return analysis.phone || inferLoosePhone(messageText);
  if (field === 'customerName') return analysis.customerName || inferLooseName(messageText);
  if (field === 'petName') return analysis.petName || inferLooseName(messageText);
  if (field === 'petType') return analysis.petType || inferLooseName(messageText);
  if (field === 'price') return analysis.price || inferLoosePrice(messageText);
  return null;
};

const mergeAppointmentPayload = (basePayload = {}, messageText = '', preferredMissingFields = []) => {
  const analysis = analyzeAppointmentMessage(messageText);
  const merged = {
    ...basePayload,
    notes: [basePayload.notes, analysis.text].filter(Boolean).join(' | ').trim()
  };

  ['customerName', 'date', 'time', 'service', 'phone', 'petName', 'petType', 'price'].forEach((field) => {
    if (hasValue(analysis[field])) {
      merged[field] = analysis[field];
    }
  });

  merged.isNewCustomerIntent = Boolean(basePayload.isNewCustomerIntent || analysis.isNewCustomerIntent);

  if (preferredMissingFields.length > 0) {
    preferredMissingFields.forEach((field) => {
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

  if (
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
  isNewCustomerIntent: Boolean(payload.isNewCustomerIntent),
  notes: payload.notes || messageText || ''
});

const determineAppointmentRecoveryFields = (reason = '', payload = {}) => {
  const message = String(reason || '');

  if (message.includes('כבר נתפסה')) {
    return ['time'];
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

const buildConfirmationText = ({ customerName, date, time, service }) =>
  `התור של ${customerName} נקבע ל${formatReplyDate(date)} בשעה ${time} עבור ${service}.`;

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

const buildScheduleMissingDateText = () =>
  'תגיד לי לאיזה יום לבדוק. לדוגמה: מה השעות הפנויות ביום שלישי או מה הלוז השבוע';

const sendReplySafely = async (phone, text) => {
  if (!phone || !text) {
    return null;
  }

  try {
    return await sendWhatsAppTextReply(phone, text);
  } catch (error) {
    return {
      sent: false,
      reason: error?.message || 'Failed to send WhatsApp reply'
    };
  }
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
      const statsReplyResult = await getStatsReply(statsQuery.metric);
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
      const result = await createAppointmentFromStructuredInput({
        existingCustomerId: req.body?.existingCustomerId,
        customerName: parsed.customerName,
        phone:
          req.body?.customerPhone ||
          parsed.customerPhone ||
          parsed.phone ||
          '',
        date: parsed.date,
        time: parsed.time,
        service: parsed.service,
        notes: parsed.notes || incoming.text,
        petName: req.body?.petName || parsed.petName,
        petType: req.body?.petType || parsed.petType,
        price: req.body?.price ?? parsed.price
      });

      await clearWhatsAppContext(conversationPhone);

      let confirmation = null;
      const replyPhone = conversationPhone || result.customer?.phone || '';

      if (replyPhone) {
        confirmation = await sendReplySafely(
          replyPhone,
          buildConfirmationText({
            customerName: result.customer?.name || parsed.customerName,
            date: parsed.date,
            time: parsed.time,
            service: parsed.service
          })
        );
      }

      res.status(200).json({
        ok: true,
        parsed,
        parsedFromContext,
        confirmation,
        ...result
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
