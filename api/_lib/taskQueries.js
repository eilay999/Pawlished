import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { buildSlotDateFromLocal } from './appointments.js';

const ISRAEL_TIME_ZONE = 'Asia/Jerusalem';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

const WEEKDAY_MAP = {
  'ראשון': 0,
  'יום ראשון': 0,
  'שני': 1,
  'יום שני': 1,
  'שלישי': 2,
  'יום שלישי': 2,
  'רביעי': 3,
  'יום רביעי': 3,
  'חמישי': 4,
  'יום חמישי': 4,
  'שישי': 5,
  'יום שישי': 5,
  'שבת': 6,
  'יום שבת': 6
};

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

const getFormatterParts = (date, timeZone = ISRAEL_TIME_ZONE) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  return formatter
    .formatToParts(date)
    .filter((part) => part.type !== 'literal')
    .reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});
};

const getTodayDateString = () => {
  const parts = getFormatterParts(new Date());
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const dateFromString = (dateValue) => {
  const [year, month, day] = String(dateValue || '').split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
};

const addDays = (date, days) => {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const formatDateString = (date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
    date.getUTCDate()
  ).padStart(2, '0')}`;

const extractExplicitDate = (text) => {
  const isoMatch = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoMatch) return isoMatch[1];

  const shortMatch = text.match(/\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/);
  if (!shortMatch) return null;

  const [, dayRaw, monthRaw, yearRaw] = shortMatch;
  const currentYear = Number(getTodayDateString().slice(0, 4));
  const year = yearRaw ? Number(yearRaw.length === 2 ? `20${yearRaw}` : yearRaw) : currentYear;
  return `${String(year).padStart(4, '0')}-${String(Number(monthRaw)).padStart(2, '0')}-${String(
    Number(dayRaw)
  ).padStart(2, '0')}`;
};

const extractRelativeDate = (text) => {
  const today = dateFromString(getTodayDateString());

  if (text.includes('מחרתיים')) {
    return formatDateString(addDays(today, 2));
  }

  if (text.includes('מחר')) {
    return formatDateString(addDays(today, 1));
  }

  if (text.includes('היום')) {
    return formatDateString(today);
  }

  const matchedWeekday = Object.keys(WEEKDAY_MAP).find((label) => text.includes(label));
  if (!matchedWeekday) return null;

  const targetDay = WEEKDAY_MAP[matchedWeekday];
  const todayDay = today.getUTCDay();
  let delta = (targetDay - todayDay + 7) % 7;
  if (delta === 0) {
    delta = 7;
  }
  return formatDateString(addDays(today, delta));
};

const extractTaskDate = (text) => extractExplicitDate(text) || extractRelativeDate(text) || getTodayDateString();

const stripDateHints = (text) =>
  normalizeText(text)
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ')
    .replace(/\b\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?\b/g, ' ')
    .replace(/(?:^|\s)(?:היום|מחר|מחרתיים)(?=$|\s)/g, ' ')
    .replace(/(?:^|\s)(?:ל(?:יום)?|ביום|יום)\s+(?:ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)(?=$|\s)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const parseSelectorFromText = (text) => {
  const indexMatch = text.match(/(?:משימה|מספר)\s*(\d{1,2})\b/);
  if (indexMatch) {
    return { index: Number(indexMatch[1]) };
  }

  const cleaned = normalizeText(text)
    .replace(
      /(?:^|\s)(?:מה|מצב|סטטוס|המצב|הסטטוס|סמן|תסמן|עדכן|תעדכן|סגור|תסגור|פתח|תפתח|מחק|תמחק|הסר|תסיר|את|משימה|למצב|בוצע|פתוח|מחוקה|שוב|חדש)(?=$|\s)/g,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned ? { text: cleaned } : null;
};

export const parseTaskQuery = (message) => {
  const text = normalizeText(message);
  if (!text.includes('משימ')) {
    return null;
  }

  const createMatch = text.match(/(?:הוסף|תוסיף|תוסיפי|צור|תיצור)\s+(?:לי\s+)?משימה\s*[:\-]?\s*(.+)$/);
  if (createMatch) {
    const rawTitle = stripDateHints(createMatch[1] || '');
    return {
      kind: 'task_query',
      action: 'create',
      title: rawTitle,
      date: extractTaskDate(text),
      text
    };
  }

  if (/(סמן|תסמן|עדכן|תעדכן|סגור|תסגור).*(משימה).*(בוצע|גמור|סגור)/.test(text)) {
    return {
      kind: 'task_query',
      action: 'complete',
      selector: parseSelectorFromText(text),
      text
    };
  }

  if (/(פתח|תפתח|עדכן|תעדכן).*(משימה).*(פתוח|לא בוצע|חדש)/.test(text)) {
    return {
      kind: 'task_query',
      action: 'reopen',
      selector: parseSelectorFromText(text),
      text
    };
  }

  if (/(מחק|תמחק|הסר|תסיר).*(משימה)/.test(text)) {
    return {
      kind: 'task_query',
      action: 'delete',
      selector: parseSelectorFromText(text),
      text
    };
  }

  const isStatusQuery =
    /^(?:מה|תראה|תציג)\s+.*(?:מצב|סטטוס)\s+.*משימה/.test(text) ||
    /^(?:מצב|סטטוס)\s+.*משימה/.test(text);

  if (isStatusQuery) {
    return {
      kind: 'task_query',
      action: 'status',
      selector: parseSelectorFromText(text),
      text
    };
  }

  const isOpenListQuery =
    /(?:^|\s)משימות פתוחות(?:$|\s)/.test(text) ||
    /^(?:מה|תראה|תציג|רשימת|סטטוס|מצב|איזה|אילו)\s+.*משימות פתוחות/.test(text);

  if (isOpenListQuery) {
    return {
      kind: 'task_query',
      action: 'list_open',
      text
    };
  }

  const isSummaryQuery =
    text === 'משימות' ||
    text === 'מה המשימות' ||
    /^(?:מה|תראה|תציג|רשימת|סטטוס|מצב|איזה|אילו)\s+.*(?:משימות|משימה)/.test(text);

  if (isSummaryQuery) {
    return {
      kind: 'task_query',
      action: 'summary',
      text
    };
  }

  return null;
};

const mapTask = (row) => ({
  id: row.id,
  title: row.title,
  status: row.status,
  createdAt: row.created_at,
  startDate: row.start_date
});

const compareTasks = (left, right) => {
  if (left.status !== right.status) {
    return left.status === 'OPEN' ? -1 : 1;
  }

  const startDiff = new Date(left.startDate).getTime() - new Date(right.startDate).getTime();
  if (startDiff !== 0) {
    return startDiff;
  }

  return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
};

const loadTasks = async () => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('tasks')
    .select('id, title, status, created_at, start_date');

  if (error) {
    throw createHttpError(500, `Failed to load tasks: ${error.message}`);
  }

  return (data || []).map(mapTask).sort(compareTasks);
};

const formatTaskDate = (value) => {
  const date = new Date(value);
  const today = dateFromString(getTodayDateString());
  const tomorrow = addDays(today, 1);
  const taskLocal = new Date(date);
  taskLocal.setHours(0, 0, 0, 0);

  if (taskLocal.getTime() === today.getTime()) return 'היום';
  if (taskLocal.getTime() === tomorrow.getTime()) return 'מחר';

  return new Intl.DateTimeFormat('he-IL', {
    timeZone: ISRAEL_TIME_ZONE,
    day: 'numeric',
    month: 'numeric'
  }).format(date);
};

const formatTaskLine = (task, index) =>
  `${index}. ${task.title} | ${formatTaskDate(task.startDate)} | ${task.status === 'DONE' ? 'בוצע' : 'פתוח'}`;

const resolveTaskBySelector = (tasks, selector, preferredStatus) => {
  if (!selector) {
    throw createHttpError(400, 'לא הבנתי איזו משימה לעדכן.');
  }

  const scopedTasks = preferredStatus
    ? tasks.filter((task) => task.status === preferredStatus)
    : tasks;

  if (selector.index) {
    const target = scopedTasks[selector.index - 1];
    if (!target) {
      throw createHttpError(404, 'לא מצאתי משימה במספר הזה.');
    }
    return target;
  }

  if (selector.text) {
    const lowered = selector.text.toLowerCase();
    const matches = scopedTasks.filter((task) => task.title.toLowerCase().includes(lowered));
    if (matches.length === 0) {
      throw createHttpError(404, 'לא מצאתי משימה שמתאימה לתיאור הזה.');
    }
    if (matches.length > 1) {
      throw createHttpError(409, 'מצאתי כמה משימות דומות. תשלח מספר משימה.');
    }
    return matches[0];
  }

  throw createHttpError(400, 'לא הבנתי איזו משימה לעדכן.');
};

export const getTasksReply = async (mode = 'summary') => {
  const tasks = await loadTasks();
  const openTasks = tasks.filter((task) => task.status === 'OPEN');
  const doneTasks = tasks.filter((task) => task.status === 'DONE');

  if (mode === 'list_open') {
    if (openTasks.length === 0) {
      return {
        text: 'אין כרגע משימות פתוחות.',
        tasks
      };
    }

    return {
      text:
        'המשימות הפתוחות:\n' +
        openTasks.map((task, index) => formatTaskLine(task, index + 1)).join('\n') +
        `\nכדי לעדכן: סמן משימה 1 בוצע`,
      tasks
    };
  }

  const lines = [
    `יש כרגע ${openTasks.length} משימות פתוחות ו-${doneTasks.length} משימות שבוצעו.`
  ];

  if (openTasks.length > 0) {
    lines.push('הפתוחות הקרובות:');
    lines.push(...openTasks.slice(0, 5).map((task, index) => formatTaskLine(task, index + 1)));
  }

  return {
    text: lines.join('\n'),
    tasks
  };
};

export const getTaskStatusReply = async (selector) => {
  const tasks = await loadTasks();
  const task = resolveTaskBySelector(tasks, selector);
  return {
    task,
    text: `מצב המשימה:\n${formatTaskLine(task, tasks.indexOf(task) + 1)}`
  };
};

export const createTaskFromQuery = async ({ title, date }) => {
  const safeTitle = normalizeText(title);
  if (!safeTitle) {
    throw createHttpError(400, 'חסר לי טקסט למשימה.');
  }

  const supabase = getSupabaseClient();
  const task = {
    id: crypto.randomUUID(),
    title: safeTitle,
    status: 'OPEN',
    created_at: new Date().toISOString(),
    start_date: buildSlotDateFromLocal(date || getTodayDateString(), '12:00').toISOString()
  };

  const { data, error } = await supabase
    .from('tasks')
    .insert(task)
    .select('id, title, status, created_at, start_date')
    .single();

  if (error || !data) {
    throw createHttpError(500, error?.message || 'Failed to create task');
  }

  const mapped = mapTask(data);
  return {
    task: mapped,
    text: `הוספתי משימה: ${mapped.title} | ${formatTaskDate(mapped.startDate)} | פתוח`
  };
};

const updateTaskStatus = async (task, status) => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('tasks')
    .update({ status })
    .eq('id', task.id)
    .select('id, title, status, created_at, start_date')
    .single();

  if (error || !data) {
    throw createHttpError(500, error?.message || 'Failed to update task');
  }

  return mapTask(data);
};

export const completeTaskFromQuery = async (selector) => {
  const tasks = await loadTasks();
  const task = resolveTaskBySelector(tasks, selector, 'OPEN');
  const updatedTask = await updateTaskStatus(task, 'DONE');
  return {
    task: updatedTask,
    text: `סימנתי את המשימה "${updatedTask.title}" כבוצעה.`
  };
};

export const reopenTaskFromQuery = async (selector) => {
  const tasks = await loadTasks();
  const task = resolveTaskBySelector(tasks, selector, 'DONE');
  const updatedTask = await updateTaskStatus(task, 'OPEN');
  return {
    task: updatedTask,
    text: `החזרתי את המשימה "${updatedTask.title}" למצב פתוח.`
  };
};

export const deleteTaskFromQuery = async (selector) => {
  const tasks = await loadTasks();
  const task = resolveTaskBySelector(tasks, selector);
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('tasks').delete().eq('id', task.id);

  if (error) {
    throw createHttpError(500, `Failed to delete task: ${error.message}`);
  }

  return {
    task,
    text: `מחקתי את המשימה "${task.title}".`
  };
};
