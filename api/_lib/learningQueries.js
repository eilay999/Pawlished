import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { listMemoriesForPhone, saveMemory } from './memoryQueries.js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const PLATFORM_WORDS = ['אינסטגרם', 'פייסבוק', 'גוגל', 'טיקטוק', 'אתר', 'וואטסאפ', 'יוטיוב', 'מטא'];

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const getSupabaseClient = () => {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw createHttpError(500, 'Supabase service role not configured');
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false }
  });
};

const normalizeText = (value = '') =>
  String(value || '')
    .replace(/[“”״]/g, '"')
    .replace(/[‘’׳']/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

const normalizePhone = (value = '') => String(value || '').replace(/\D/g, '');

const shouldSkipAutoMemory = (text) =>
  /^(?:תזכור|תזכר|תזכרי|שמור|תשמור|תשמרי|חשוב שתדע|מעכשיו)(?:\s|$)/u.test(text);

const looksLikeOperationalCommand = (text) =>
  /(?:לקבוע|קבע|תקבע|תור|לקוח חדש|תזכיר|להזכיר|תזכורת|משימה|סטטיסטיקה|לוז|יומן)/u.test(text);

const extractAutoMemories = (message = '') => {
  const text = normalizeText(message);
  if (!text || shouldSkipAutoMemory(text)) return [];

  const memories = [];
  const hasNumbers = /\d/.test(text);
  const hasPerformanceWords =
    /(?:פניות|לידים|סגירות|נסגרו|סגרנו|הכנסות|עלה|עלות|תקציב|קמפיין|פרסום|עוקבים|צפיות|תגובות)/u.test(
      text
    );

  for (const platform of PLATFORM_WORDS) {
    if (text.includes(platform) && (hasNumbers || hasPerformanceWords)) {
      memories.push({
        subject: platform,
        value: text
      });
    }
  }

  if (/(?:מעכשיו|תמיד|כל פעם|אל תשכח|תלמד|אני רוצה ש|שיהיה)/u.test(text)) {
    memories.push({
      subject: 'העדפת עבודה',
      value: text
    });
  }

  if (
    /(?:Pawlished|העסק|מספרה|מספרת|כלבים|לקוחות|שירות|מחיר|מדיניות|ביטול)/u.test(text) &&
    /(?:צריך|רוצה|עדיף|חשוב|אסור|מותר|הוא|היא|זה)/u.test(text)
  ) {
    memories.push({
      subject: 'מידע עסקי',
      value: text
    });
  }

  return memories.slice(0, 3);
};

export const recordLearningEvent = async ({ phone, text, intentKind = 'incoming', metadata = {} }) => {
  const normalizedText = normalizeText(text);
  if (!normalizedText) return null;

  const supabase = getSupabaseClient();
  const row = {
    id: crypto.randomUUID(),
    phone: normalizePhone(phone) || 'global',
    direction: 'incoming',
    text: normalizedText,
    intent_kind: intentKind || 'incoming',
    metadata
  };

  const { data, error } = await supabase
    .from('whatsapp_learning_events')
    .insert(row)
    .select('*')
    .single();

  if (error) {
    throw createHttpError(500, error.message || 'Failed to record learning event');
  }

  return data;
};

export const learnFromIncomingMessage = async ({ phone, text, intentKind = 'incoming' }) => {
  const normalizedText = normalizeText(text);
  if (!normalizedText) return { event: null, memories: [] };

  const event = await recordLearningEvent({
    phone,
    text: normalizedText,
    intentKind
  });

  const learnedMemories = [];
  for (const memory of extractAutoMemories(normalizedText)) {
    const saved = await saveMemory({
      phone,
      subject: memory.subject,
      value: memory.value,
      rawText: normalizedText
    });
    learnedMemories.push(saved);
  }

  return {
    event,
    memories: learnedMemories
  };
};

export const listRecentLearningEvents = async (phone, limit = 20) => {
  const phoneKey = normalizePhone(phone) || 'global';
  const phones = phoneKey === 'global' ? ['global'] : [phoneKey, 'global'];
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('whatsapp_learning_events')
    .select('phone, text, intent_kind, created_at')
    .in('phone', phones)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw createHttpError(500, error.message || 'Failed to load learning events');
  }

  return data || [];
};

export const parseLearningQuery = (message = '') => {
  const text = normalizeText(message);
  if (!text) return null;

  if (/(?:מה למדת|מה אתה לומד|מה למדת על העסק|מה למדת לאחרונה|יומן למידה|תראה למידה)/u.test(text)) {
    return {
      kind: 'learning_query',
      text
    };
  }

  return null;
};

export const parseAutoLearningQuery = (message = '') => {
  const text = normalizeText(message);
  if (!text || looksLikeOperationalCommand(text)) return null;

  const memories = extractAutoMemories(text);
  if (!memories.length) return null;

  return {
    kind: 'auto_learning_query',
    text,
    memories
  };
};

export const getAutoLearningReply = async ({ query }) => {
  const lines = (query.memories || []).map((memory) => `- ${memory.subject}: ${memory.value}`);
  return {
    text:
      'למדתי ושמרתי את זה להמשך:\n' +
      lines.join('\n') +
      '\n\nאפשר לשאול אותי אחר כך: "מה למדת" או "תן לי עצות לשיפור העסק".'
  };
};

export const getLearningReply = async ({ phone }) => {
  const [memories, events] = await Promise.all([
    listMemoriesForPhone(phone, 8).catch(() => []),
    listRecentLearningEvents(phone, 8).catch(() => [])
  ]);

  const memoryLines = memories.length
    ? memories.map((memory) => `- ${memory.subject}: ${memory.value}`)
    : ['- עוד אין זיכרונות שמורים.'];
  const eventLines = events.length
    ? events.map((event) => `- ${event.text}`)
    : ['- עוד אין מספיק הודעות ביומן הלמידה.'];

  return {
    memories,
    events,
    text:
      'זה מה שלמדתי עד עכשיו:\n' +
      memoryLines.join('\n') +
      '\n\nהודעות אחרונות שמהן אני לומד:\n' +
      eventLines.join('\n') +
      '\n\nכדי ללמד אותי טוב יותר, כתוב דברים כמו: "אינסטגרם הביא היום 3 פניות וסגירה אחת".'
  };
};
