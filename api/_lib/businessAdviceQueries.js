import { getStatsSnapshot } from './statsQueries.js';
import { listMemoriesForPhone } from './memoryQueries.js';
import { listRecentLearningEvents } from './learningQueries.js';

const PLATFORM_WORDS = ['אינסטגרם', 'פייסבוק', 'גוגל', 'טיקטוק', 'אתר', 'וואטסאפ', 'יוטיוב', 'מטא'];

const normalizeText = (value = '') =>
  String(value || '')
    .replace(/[“”״]/g, '"')
    .replace(/[‘’׳']/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

const formatCurrency = (value) => `₪${Number(value || 0).toLocaleString('he-IL')}`;

export const parseBusinessAdviceQuery = (message = '') => {
  const text = normalizeText(message);
  if (!text) return null;

  const asksForAdvice =
    /(?:עצה|עצות|המלצה|המלצות|תובנה|תובנות|לשפר|שיפור|להתפתח|לפתח|לגדול|אסטרטגיה|מה לעשות|איך להתקדם)/u.test(
      text
    );
  const businessContext = /(?:עסק|לקוחות|הכנסות|שיווק|פלטפורמות|אינסטגרם|פייסבוק|גוגל|וואטסאפ|טיקטוק)/u.test(
    text
  );

  if (!asksForAdvice || !businessContext) return null;

  return {
    kind: 'business_advice_query',
    text
  };
};

const buildPlatformMemoryLines = (memories = []) => {
  const platformMemories = memories.filter((memory) => {
    const combined = `${memory.subject || ''} ${memory.value || ''}`;
    return PLATFORM_WORDS.some((word) => combined.includes(word));
  });

  if (!platformMemories.length) {
    return [
      'אין לי עדיין נתונים שמורים על אינסטגרם, פייסבוק, גוגל, אתר או טיקטוק.',
      'כדי שאלמד, אפשר לכתוב: תזכור שאינסטגרם הביא השבוע 4 פניות ו-2 סגירות.'
    ];
  }

  return platformMemories.slice(0, 5).map((memory) => `${memory.subject}: ${memory.value}`);
};

const buildAdviceLines = (snapshot, memories = []) => {
  const advice = [];

  if (snapshot.lateCustomers > 0) {
    advice.push(
      `להתחיל מהלקוחות באיחור: יש ${snapshot.lateCustomers}. זה כסף שכבר קרוב לסגירה, לפני שמעלים עוד פרסום.`
    );
  }

  if (snapshot.soonCustomers > 0) {
    advice.push(
      `לשלוח הודעת חזרה ל-${snapshot.soonCustomers} לקוחות שמתקרבים למועד. זה מתאים לקמפיין וואטסאפ קצר.`
    );
  }

  if (snapshot.cancellationRate >= 10) {
    advice.push(
      `אחוז הביטולים ב${snapshot.periodLabel} הוא ${snapshot.cancellationRate}%. כדאי לחזק אישור הגעה יום לפני ולשקול דמי ביטול ברורים.`
    );
  }

  if (snapshot.openTasks > 5) {
    advice.push(
      `יש ${snapshot.openTasks} משימות פתוחות. לפני קמפיין חדש, לסגור את המשימות שמונעות כסף או שירות לקוחות.`
    );
  }

  if (snapshot.monthlyRevenue > 0) {
    advice.push(
      `הכנסות ב${snapshot.periodLabel}: ${formatCurrency(snapshot.monthlyRevenue)}. כדאי להשוות כל שבוע מאיפה הגיעו הפניות: וואטסאפ, אינסטגרם, פייסבוק, גוגל ואתר.`
    );
  }

  const hasPlatformMemory = memories.some((memory) =>
    PLATFORM_WORDS.some((word) => `${memory.subject || ''} ${memory.value || ''}`.includes(word))
  );
  if (!hasPlatformMemory) {
    advice.push(
      'כדי שאהיה חכם יותר בפלטפורמות, שמור לי בכל סוף יום כמה פניות, כמה סגירות ומאיזה מקור הן הגיעו.'
    );
  }

  if (!advice.length) {
    advice.push('השלב הבא הוא לצבור נתונים: פניות לפי מקור, סגירות, ביטולים ותורים חוזרים.');
  }

  return advice.slice(0, 5);
};

const buildLearningLines = (events = []) => {
  if (!events.length) {
    return ['עוד אין לי מספיק יומן למידה. תכתוב לי תוצאות יומיות לפי פלטפורמה כדי שאזהה דפוסים.'];
  }

  return events.slice(0, 5).map((event) => event.text);
};

export const getBusinessAdviceReply = async ({ phone }) => {
  const [snapshot, memories, learningEvents] = await Promise.all([
    getStatsSnapshot(),
    listMemoriesForPhone(phone, 25).catch(() => []),
    listRecentLearningEvents(phone, 20).catch(() => [])
  ]);

  const platformLines = buildPlatformMemoryLines(memories);
  const adviceLines = buildAdviceLines(snapshot, memories);
  const learningLines = buildLearningLines(learningEvents);

  return {
    snapshot,
    memories,
    learningEvents,
    text:
      'תובנות לשיפור העסק:\n' +
      adviceLines.map((line, index) => `${index + 1}. ${line}`).join('\n') +
      '\n\nמה שאני יודע כרגע על פלטפורמות:\n' +
      platformLines.map((line) => `- ${line}`).join('\n') +
      '\n\nמה שלמדתי לאחרונה מהשיחות:\n' +
      learningLines.map((line) => `- ${line}`).join('\n')
  };
};
