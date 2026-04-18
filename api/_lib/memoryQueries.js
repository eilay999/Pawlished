import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
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
    .replace(/[’'׳]/g, "'")
    .replace(/[–—־]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

const normalizePhone = (value = '') => String(value || '').replace(/\D/g, '');

const normalizeMemoryKey = (value = '') =>
  normalizeText(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);

const cleanSubject = (value = '') =>
  normalizeText(value)
    .replace(/^(?:של|את|על|לגבי)\s+/u, '')
    .replace(/[?.!]+$/g, '')
    .trim();

const cleanFactPrefix = (value = '') =>
  normalizeText(value)
    .replace(/^(?:ש|כי)\s*/u, '')
    .trim();

const firstWords = (value = '', count = 5) =>
  normalizeText(value)
    .split(' ')
    .filter(Boolean)
    .slice(0, count)
    .join(' ');

const extractPhoneMemory = (text) => {
  const match =
    text.match(/(?:ה)?(?:מספר|טלפון|נייד|פלאפון)\s+של\s+(.+?)\s*(?:הוא|זה|:)?\s*(\+?\d[\d\s-]{7,})/u) ||
    text.match(/(.+?)\s+(?:המספר|טלפון|נייד|פלאפון)\s*(?:הוא|זה|:)?\s*(\+?\d[\d\s-]{7,})/u);

  if (!match) return null;

  const subject = cleanSubject(match[1]);
  const digits = normalizePhone(match[2]);
  if (!subject || digits.length < 8) return null;

  return {
    subject: `המספר של ${subject}`,
    value: digits.startsWith('972') ? `+${digits}` : digits
  };
};

const extractGeneralMemory = (text) => {
  const memoryTextMatch = text.match(
    /^(?:תזכור|תזכר|תזכרי|שמור|תשמור|תשמרי|חשוב שתדע|מעכשיו)(?:\s+לי)?\s+(.+)$/u
  );
  if (!memoryTextMatch) return null;

  const fact = cleanFactPrefix(memoryTextMatch[1]);
  if (!fact) return null;

  const phoneMemory = extractPhoneMemory(fact);
  if (phoneMemory) return phoneMemory;

  const subjectValueMatch =
    fact.match(/^(.+?)\s+(?:הוא|היא|זה|זו|=|:)\s+(.+)$/u) ||
    fact.match(/^(.+?)\s+-\s+(.+)$/u);

  if (subjectValueMatch) {
    return {
      subject: cleanSubject(subjectValueMatch[1]),
      value: normalizeText(subjectValueMatch[2])
    };
  }

  const platformSubject = PLATFORM_WORDS.find((word) => fact.includes(word));
  if (platformSubject) {
    return {
      subject: platformSubject,
      value: fact
    };
  }

  return {
    subject: firstWords(fact),
    value: fact
  };
};

const extractMemoryQuestionSubject = (text) => {
  const phoneQuestion = text.match(/(?:מה|מהו|מה המספר|תביא|שלח|תגיד).*?(?:מספר|טלפון|נייד|פלאפון)\s+של\s+(.+?)[?.!]*$/u);
  if (phoneQuestion?.[1]) {
    return {
      subject: `המספר של ${cleanSubject(phoneQuestion[1])}`,
      exactPhone: true
    };
  }

  const subjectQuestion =
    text.match(/(?:מה|מי|איזה).*?(?:זוכר|שמור|ידוע).*?(?:על|לגבי)\s+(.+?)[?.!]*$/u) ||
    text.match(/(?:מי זה|מה זה)\s+(.+?)[?.!]*$/u);

  if (subjectQuestion?.[1]) {
    return {
      subject: cleanSubject(subjectQuestion[1])
    };
  }

  return null;
};

export const parseMemoryQuery = (message = '') => {
  const text = normalizeText(message);
  if (!text) return null;

  const memoryToSave = extractGeneralMemory(text);
  if (memoryToSave?.subject && memoryToSave?.value) {
    return {
      kind: 'memory_query',
      action: 'save',
      text,
      ...memoryToSave
    };
  }

  if (/^(?:מה אתה זוכר|מה את זוכרת|מה שמור|מה יש בזיכרון|זיכרון)$/u.test(text)) {
    return {
      kind: 'memory_query',
      action: 'list',
      text
    };
  }

  const question = extractMemoryQuestionSubject(text);
  if (question?.subject) {
    return {
      kind: 'memory_query',
      action: 'get',
      text,
      ...question
    };
  }

  return null;
};

const memoryNotFoundText = (subject) =>
  subject
    ? `לא מצאתי בזיכרון מידע על ${subject}. אפשר לכתוב: תזכור ש${subject} הוא ...`
    : 'לא מצאתי עדיין זיכרונות שמורים.';

const formatMemoryLine = (memory) => `${memory.subject}: ${memory.value}`;

export const saveMemory = async ({ phone, subject, value, rawText = '' }) => {
  const phoneKey = normalizePhone(phone) || 'global';
  const cleanedSubject = cleanSubject(subject);
  const memoryKey = normalizeMemoryKey(cleanedSubject);
  if (!memoryKey || !value) {
    throw createHttpError(400, 'לא הצלחתי להבין מה לשמור בזיכרון.');
  }

  const supabase = getSupabaseClient();
  const row = {
    id: crypto.randomUUID(),
    phone: phoneKey,
    memory_key: memoryKey,
    subject: cleanedSubject,
    value: String(value).trim(),
    raw_text: rawText || ''
  };

  const { data, error } = await supabase
    .from('whatsapp_memories')
    .upsert(row, { onConflict: 'phone,memory_key' })
    .select('*')
    .single();

  if (error || !data) {
    throw createHttpError(500, error?.message || 'Failed to save memory');
  }

  return data;
};

export const listMemoriesForPhone = async (phone, limit = 20) => {
  const phoneKey = normalizePhone(phone) || 'global';
  const phones = phoneKey === 'global' ? ['global'] : [phoneKey, 'global'];
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('whatsapp_memories')
    .select('phone, subject, value, updated_at')
    .in('phone', phones)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw createHttpError(500, error.message || 'Failed to load memories');
  }

  return data || [];
};

export const handleMemoryQuery = async ({ phone, query }) => {
  const phoneKey = normalizePhone(phone) || 'global';
  const supabase = getSupabaseClient();

  if (query.action === 'save') {
    const subject = cleanSubject(query.subject);
    const memoryKey = normalizeMemoryKey(subject);
    if (!memoryKey || !query.value) {
      throw createHttpError(400, 'לא הצלחתי להבין מה לשמור בזיכרון.');
    }

    const row = {
      id: crypto.randomUUID(),
      phone: phoneKey,
      memory_key: memoryKey,
      subject,
      value: String(query.value).trim(),
      raw_text: query.text || ''
    };

    const { data, error } = await supabase
      .from('whatsapp_memories')
      .upsert(row, { onConflict: 'phone,memory_key' })
      .select('*')
      .single();

    if (error || !data) {
      throw createHttpError(500, error?.message || 'Failed to save memory');
    }

    return {
      memory: data,
      text: `שמרתי בזיכרון: ${formatMemoryLine(data)}`
    };
  }

  if (query.action === 'list') {
    const data = await listMemoriesForPhone(phone, 10);

    if (!data?.length) {
      return { text: memoryNotFoundText() };
    }

    return {
      memories: data,
      text: `זה מה שאני זוכר:\n${data.map(formatMemoryLine).join('\n')}`
    };
  }

  const subject = cleanSubject(query.subject);
  const memoryKey = normalizeMemoryKey(subject);
  const phones = phoneKey === 'global' ? ['global'] : [phoneKey, 'global'];
  let data = null;

  if (memoryKey) {
    const exactResult = await supabase
      .from('whatsapp_memories')
      .select('phone, subject, value, updated_at')
      .in('phone', phones)
      .eq('memory_key', memoryKey)
      .order('phone', { ascending: true })
      .limit(2);

    if (exactResult.error) {
      throw createHttpError(500, exactResult.error.message || 'Failed to load memory');
    }
    data =
      exactResult.data?.find((memory) => memory.phone === phoneKey) ||
      exactResult.data?.[0] ||
      null;
  }

  if (!data && subject) {
    const fuzzyResult = await supabase
      .from('whatsapp_memories')
      .select('phone, subject, value, updated_at')
      .in('phone', phones)
      .or(`subject.ilike.%${subject}%,value.ilike.%${subject}%`)
      .order('updated_at', { ascending: false })
      .limit(1);

    if (fuzzyResult.error) {
      throw createHttpError(500, fuzzyResult.error.message || 'Failed to search memory');
    }
    data = fuzzyResult.data?.[0] || null;
  }

  if (!data) {
    return { text: memoryNotFoundText(subject) };
  }

  return {
    memory: data,
    text: formatMemoryLine(data)
  };
};
