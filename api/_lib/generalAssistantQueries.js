import { GoogleGenAI } from '@google/genai';
import { listMemoriesForPhone } from './memoryQueries.js';
import { listRecentLearningEvents } from './learningQueries.js';

const ISRAEL_TIME_ZONE = 'Asia/Jerusalem';
const WHATSAPP_ASSISTANT_NAME = (process.env.WHATSAPP_ASSISTANT_NAME || 'בקו').trim();

const getGeminiApiKeys = () =>
  Array.from(
    new Set(
      [
        process.env.VITE_GEMINI_API_KEY,
        process.env.GEMINI_API_KEY,
        process.env.API_KEY,
        process.env.VITE_API_KEY
      ]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  );

const normalizeText = (value = '') =>
  String(value || '')
    .replace(/[“”״]/g, '"')
    .replace(/[‘’׳']/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

const formatIsraelDateTimeParts = () => {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('he-IL', {
    timeZone: ISRAEL_TIME_ZONE,
    weekday: 'long',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
    .formatToParts(now)
    .filter((part) => part.type !== 'literal')
    .reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});

  return {
    weekday: parts.weekday,
    date: `${parts.day}.${parts.month}.${parts.year}`,
    time: `${parts.hour}:${parts.minute}`
  };
};

const looksLikeAppointmentCommand = (text) =>
  /(?:לקבוע|קבע|תקבע|תור|לקוח חדש|שם לקוח|שם כלב|טלפון|תספורת|אמבטיה|ביום|בשעה|מחר|מחרתיים)/u.test(
    text
  );

const isDateOrTimeQuestion = (text) =>
  /(?:מה|איזה).*(?:תאריך|יום|שעה)|(?:מה השעה|מה היום|תאריך היום|איזה יום היום)/u.test(text);

const isCapabilityQuestion = (text) =>
  /(?:מה|איך).*(?:יודע לעשות|אתה יודע|אתה יכול|אפשר לבקש|עוזר)|(?:מי אתה|מה אתה)/u.test(text);

const isGeneralQuestion = (text) =>
  /[?؟]$/.test(text) ||
  /^(?:מה|מי|איך|למה|כמה|איפה|איזה|האם|אפשר|תסביר|תסבירי|תכתוב|תכתבי|נסח|נסחי|תן|תני|ספר|ספרי|תגיד|תגידי|מה כדאי)(?:\s|$)/u.test(
    text
  );

export const parseGeneralAssistantQuery = (message = '') => {
  const text = normalizeText(message);
  if (!text) return null;

  if (isDateOrTimeQuestion(text)) {
    return {
      kind: 'general_assistant_query',
      action: 'date_time',
      text
    };
  }

  if (isCapabilityQuestion(text)) {
    return {
      kind: 'general_assistant_query',
      action: 'capabilities',
      text
    };
  }

  if (!isGeneralQuestion(text)) return null;
  if (looksLikeAppointmentCommand(text)) return null;

  return {
    kind: 'general_assistant_query',
    action: 'answer',
    text
  };
};

const buildDateTimeReply = () => {
  const current = formatIsraelDateTimeParts();
  return `היום ${current.weekday}, ${current.date}. השעה עכשיו ${current.time} לפי שעון ישראל.`;
};

const buildCapabilitiesReply = () =>
  [
    'אני יכול לעזור גם בדברים של העסק וגם בשאלות כלליות.',
    'בעסק: לקבוע תורים, להוסיף לקוחות, לבדוק לוז, סטטיסטיקות, משימות, תזכורות וזיכרון.',
    'כללי: לענות על שאלות, להסביר, לנסח הודעות, לתת רעיונות, ולחבר את זה למה שאני יודע על Pawlished.',
    'כדי ללמד אותי: תכתוב "תזכור ש..." ואז המידע שחשוב שאדע.'
  ].join('\n').replace(/Pawlished/g, WHATSAPP_ASSISTANT_NAME);

const buildFallbackReply = () =>
  [
    'אני יכול לענות על זה, אבל כרגע שירות ה-AI לא זמין בשרת.',
    'עדיין אפשר לבקש ממני תאריך, שעה, תורים, סטטיסטיקות, תזכורות, משימות וזיכרון.',
    'כדי ללמד אותי משהו קבוע, כתוב: תזכור ש...'
  ].join('\n');

const buildSmartFallbackReply = (text = '') => {
  if (/(?:שיווק|לידים|פרסום|אינסטגרם|פייסבוק|גוגל|טיקטוק)/u.test(text)) {
    return [
      'כדי לעשות שיווק טוב, תעבוד לפי מספרים ולא לפי תחושה:',
      '1. לרשום מכל פלטפורמה כמה פניות הגיעו השבוע.',
      '2. לרשום כמה מהפניות נסגרו לתור אמיתי.',
      '3. לחזק את הערוץ שמביא סגירות, לא רק צפיות.',
      '4. להחזיר לקוחות באיחור לפני שמוציאים כסף על לקוחות חדשים.',
      '5. בכל סוף יום ללמד אותי: "תזכור שאינסטגרם הביא היום 3 פניות וסגירה אחת".'
    ].join('\n');
  }

  if (/(?:לנסח|ניסוח|תכתוב|תכתבי|הודעה|פוסט)/u.test(text)) {
    return 'שלח לי מה אתה רוצה לפרסם או למי לשלוח, ואני אנסח לך הודעה קצרה וברורה.';
  }

  return [
    'אני מבין שזו שאלה כללית, לא תור.',
    'כרגע אין לי AI פתוח בשרת לשאלה הזו, אבל אני עדיין יכול לעזור אם תנסח מה אתה רוצה להשיג.',
    'אפשר גם ללמד אותי מידע קבוע עם: תזכור ש...'
  ].join('\n');
};

const buildMemoryContext = (memories = []) => {
  if (!memories.length) return 'No saved memories yet.';
  return memories
    .slice(0, 12)
    .map((memory) => `- ${memory.subject}: ${memory.value}`)
    .join('\n');
};

const buildLearningContext = (events = []) => {
  if (!events.length) return 'No recent learning events yet.';
  return events
    .slice(0, 12)
    .map((event) => `- ${event.text}`)
    .join('\n');
};

const generateAiReply = async ({ text, memories, learningEvents }) => {
  const apiKeys = getGeminiApiKeys();
  if (!apiKeys.length) return buildSmartFallbackReply(text) || buildFallbackReply();

  const current = formatIsraelDateTimeParts();
  const model = (process.env.GEMINI_MODEL || process.env.VITE_GEMINI_MODEL || 'gemini-1.5-flash').trim();
  const prompt = `
 You are the WhatsApp assistant for ${WHATSAPP_ASSISTANT_NAME}, a dog grooming business in Israel.
Answer in Hebrew, naturally and briefly.
You can answer general questions too, not only business operations.
If the user asks about current date/time, use this exact Israel time context:
date=${current.date}, weekday=${current.weekday}, time=${current.time}, timezone=Asia/Jerusalem.
Do not invent live internet facts, prices, laws, weather, or news. If live info is needed, say you need an updated source.
Use the saved memory when relevant.

Saved memory:
${buildMemoryContext(memories)}

Recent learning events:
${buildLearningContext(learningEvents)}

User message:
${text}
`;

  for (const apiKey of apiKeys) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model,
        contents: prompt
      });

      const reply = response.text?.trim();
      if (reply) return reply;
    } catch (error) {
      // Try the next configured key. If all keys fail, use a non-technical fallback.
    }
  }

  return buildSmartFallbackReply(text);
};

export const getGeneralAssistantReply = async ({ phone, query }) => {
  if (query.action === 'date_time') {
    return { text: buildDateTimeReply() };
  }

  if (query.action === 'capabilities') {
    return { text: buildCapabilitiesReply() };
  }

  const [memories, learningEvents] = await Promise.all([
    listMemoriesForPhone(phone, 20).catch(() => []),
    listRecentLearningEvents(phone, 20).catch(() => [])
  ]);
  const text = await generateAiReply({
    text: query.text,
    memories,
    learningEvents
  });

  return {
    memories,
    learningEvents,
    text
  };
};
