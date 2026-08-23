import { createClient } from '@supabase/supabase-js';

const ISRAEL_TIME_ZONE = 'Asia/Jerusalem';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });

  return formatter
    .formatToParts(date)
    .filter((part) => part.type !== 'literal')
    .reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});
};

const getIsraelToday = () => {
  const nowParts = getFormatterParts(new Date());
  return new Date(
    Number(nowParts.year),
    Number(nowParts.month) - 1,
    Number(nowParts.day),
    0,
    0,
    0,
    0
  );
};

const getCurrentMonthYear = () => {
  const parts = getFormatterParts(new Date());
  return {
    month: Number(parts.month),
    year: Number(parts.year)
  };
};

const getDateMonthYear = (value) => {
  const parts = getFormatterParts(new Date(value));
  return {
    month: Number(parts.month),
    year: Number(parts.year)
  };
};

const getIsraelDateKey = (value = new Date()) => {
  const parts = getFormatterParts(new Date(value));
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const dateKeyToUtcDate = (dateKey) => {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
};

const addDaysToDateKey = (dateKey, days) => {
  const date = dateKeyToUtcDate(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
    date.getUTCDate()
  ).padStart(2, '0')}`;
};

const getIsraelDateParts = () => {
  const parts = getFormatterParts(new Date());
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day)
  };
};

const normalizeDateToken = (value, fallbackYear = getIsraelDateParts().year) => {
  const token = String(value || '').trim();
  const isoMatch = token.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${year}-${String(Number(month)).padStart(2, '0')}-${String(Number(day)).padStart(2, '0')}`;
  }

  const shortMatch = token.match(/^(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?$/);
  if (!shortMatch) return null;

  const [, dayRaw, monthRaw, yearRaw] = shortMatch;
  const year = yearRaw ? Number(yearRaw.length === 2 ? `20${yearRaw}` : yearRaw) : fallbackYear;
  const month = Number(monthRaw);
  const day = Number(dayRaw);

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const formatDateLabel = (dateKey) =>
  new Intl.DateTimeFormat('he-IL', {
    timeZone: ISRAEL_TIME_ZONE,
    day: 'numeric',
    month: 'numeric',
    year: 'numeric'
  }).format(dateKeyToUtcDate(dateKey));

const formatTimeLabel = (minutes) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

const extractTimeWindow = (text) => {
  const hasTimeIntent = /שעה|שעות|\d{1,2}:\d{2}/.test(text);
  if (!hasTimeIntent) return null;

  const match = text.match(
    /(?:בין|משעה|מהשעה|מ-?|מה-?)\s*(\d{1,2})(?::([0-5]\d))?\s*(?:עד|ל-|ל|לבין)\s*(\d{1,2})(?::([0-5]\d))?/
  );
  if (!match) return null;

  const startHour = Number(match[1]);
  const startMinute = Number(match[2] || 0);
  const endHour = Number(match[3]);
  const endMinute = Number(match[4] || 0);

  if (startHour > 23 || endHour > 23) return null;

  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;
  if (endMinutes <= startMinutes) return null;

  return {
    startMinutes,
    endMinutes
  };
};

const withTimeWindow = (period, text) => {
  const timeWindow = extractTimeWindow(text);
  if (!period || !timeWindow) return period;
  return {
    ...period,
    timeStartMinutes: timeWindow.startMinutes,
    timeEndMinutes: timeWindow.endMinutes
  };
};

const buildRangePeriod = (startDate, endDate, type = 'range') => {
  if (!startDate || !endDate) return null;
  const orderedStart = startDate <= endDate ? startDate : endDate;
  const orderedEnd = startDate <= endDate ? endDate : startDate;
  return {
    type,
    startDate: orderedStart,
    endDate: orderedEnd
  };
};

const extractExplicitDateRange = (text) => {
  const datePattern = '(\\d{4}-\\d{1,2}-\\d{1,2}|\\d{1,2}[./-]\\d{1,2}(?:[./-]\\d{2,4})?)';
  const rangeRegex = new RegExp(
    `(?:בין|מ-|מה-|מתאריך|מ)\\s*${datePattern}\\s*(?:עד|ועד|ל-|ל|לבין)\\s*${datePattern}`
  );
  const match = text.match(rangeRegex);
  if (!match) return null;

  const currentYear = getIsraelDateParts().year;
  return buildRangePeriod(
    normalizeDateToken(match[1], currentYear),
    normalizeDateToken(match[2], currentYear)
  );
};

const extractSingleExplicitDate = (text) => {
  const match = text.match(/\b(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?)\b/);
  const date = match ? normalizeDateToken(match[1]) : null;
  return date ? { type: 'day', startDate: date, endDate: date } : null;
};

const getWeekPeriod = (weekOffset = 0) => {
  const today = getIsraelDateKey();
  const day = dateKeyToUtcDate(today).getUTCDay();
  const start = addDaysToDateKey(today, -day + weekOffset * 7);
  return buildRangePeriod(start, addDaysToDateKey(start, 6), 'week');
};

const MONTH_ALIASES = [
  { month: 1, labels: ['ינואר', 'ינור'] },
  { month: 2, labels: ['פברואר', 'פבואר', 'פברר', 'פבר'] },
  { month: 3, labels: ['מרץ', 'מארס'] },
  { month: 4, labels: ['אפריל'] },
  { month: 5, labels: ['מאי'] },
  { month: 6, labels: ['יוני'] },
  { month: 7, labels: ['יולי'] },
  { month: 8, labels: ['אוגוסט'] },
  { month: 9, labels: ['ספטמבר', 'ספטמ'] },
  { month: 10, labels: ['אוקטובר'] },
  { month: 11, labels: ['נובמבר'] },
  { month: 12, labels: ['דצמבר'] }
];

const extractYear = (text) => {
  const match = text.match(/\b(20\d{2})\b/);
  return match ? Number(match[1]) : null;
};

const getPreviousMonthYear = () => {
  const current = getCurrentMonthYear();
  const date = new Date(current.year, current.month - 2, 1);
  return {
    month: date.getMonth() + 1,
    year: date.getFullYear()
  };
};

const parseStatsPeriod = (text) => {
  const explicitYear = extractYear(text);
  const current = getCurrentMonthYear();

  const explicitRange = extractExplicitDateRange(text);
  if (explicitRange) {
    return withTimeWindow(explicitRange, text);
  }

  if (text.includes('שלשום')) {
    const date = addDaysToDateKey(getIsraelDateKey(), -2);
    return withTimeWindow({ type: 'day', startDate: date, endDate: date }, text);
  }

  if (text.includes('אתמול')) {
    const date = addDaysToDateKey(getIsraelDateKey(), -1);
    return withTimeWindow({ type: 'day', startDate: date, endDate: date }, text);
  }

  if (text.includes('היום')) {
    const date = getIsraelDateKey();
    return withTimeWindow({ type: 'day', startDate: date, endDate: date }, text);
  }

  if (/שבוע שעבר|השבוע שעבר/.test(text)) {
    return withTimeWindow(getWeekPeriod(-1), text);
  }

  if (/השבוע|שבוע נוכחי|שבוע הזה/.test(text)) {
    return withTimeWindow(getWeekPeriod(0), text);
  }

  const explicitDate = extractSingleExplicitDate(text);
  if (explicitDate) {
    return withTimeWindow(explicitDate, text);
  }

  for (const item of MONTH_ALIASES) {
    if (item.labels.some((label) => text.includes(label))) {
      return withTimeWindow({
        type: 'month',
        month: item.month,
        year: explicitYear || current.year
      }, text);
    }
  }

  if (/חודש שעבר|החודש שעבר/.test(text)) {
    return withTimeWindow({
      type: 'month',
      ...getPreviousMonthYear()
    }, text);
  }

  if (/החודש|חודש נוכחי|חודש הזה/.test(text)) {
    return withTimeWindow({
      type: 'month',
      month: current.month,
      year: current.year
    }, text);
  }

  if (/השנה|שנתי|שנה/.test(text)) {
    return withTimeWindow({
      type: 'year',
      year: explicitYear || current.year
    }, text);
  }

  return null;
};

const getMonthPeriodLabel = ({ month, year }) =>
  new Intl.DateTimeFormat('he-IL', {
    timeZone: ISRAEL_TIME_ZONE,
    month: 'long',
    year: 'numeric'
  }).format(new Date(Date.UTC(year, month - 1, 1, 12, 0, 0)));

const appendTimeLabel = (label, period) => {
  if (period?.timeStartMinutes == null || period?.timeEndMinutes == null) return label;
  return `${label} בין ${formatTimeLabel(period.timeStartMinutes)} ל-${formatTimeLabel(period.timeEndMinutes)}`;
};

const getStatsPeriodLabel = (period, fallbackMonth) => {
  if (!period) return getMonthPeriodLabel(fallbackMonth);

  if (period.type === 'month') {
    return appendTimeLabel(getMonthPeriodLabel(period), period);
  }

  if (period.type === 'year') {
    return appendTimeLabel(`שנת ${period.year}`, period);
  }

  if (period.type === 'day') {
    return appendTimeLabel(formatDateLabel(period.startDate), period);
  }

  if (period.startDate && period.endDate) {
    const label =
      period.startDate === period.endDate
        ? formatDateLabel(period.startDate)
        : `${formatDateLabel(period.startDate)} עד ${formatDateLabel(period.endDate)}`;
    return appendTimeLabel(label, period);
  }

  return getMonthPeriodLabel(fallbackMonth);
};

const appointmentMatchesPeriod = (appointment, period, fallbackMonth) => {
  const parts = getFormatterParts(appointment.date);
  const matchesTimeWindow = () => {
    if (period?.timeStartMinutes == null || period?.timeEndMinutes == null) return true;
    const minutes = Number(parts.hour) * 60 + Number(parts.minute);
    return minutes >= period.timeStartMinutes && minutes < period.timeEndMinutes;
  };

  if (!period) {
    return Number(parts.month) === fallbackMonth.month && Number(parts.year) === fallbackMonth.year;
  }

  if (period.type === 'month') {
    return Number(parts.month) === period.month && Number(parts.year) === period.year && matchesTimeWindow();
  }

  if (period.type === 'year') {
    return Number(parts.year) === period.year && matchesTimeWindow();
  }

  if (period.startDate && period.endDate) {
    const dateKey = `${parts.year}-${parts.month}-${parts.day}`;
    if (dateKey < period.startDate || dateKey > period.endDate) return false;

    return matchesTimeWindow();
  }

  return Number(parts.month) === fallbackMonth.month && Number(parts.year) === fallbackMonth.year;
};

const mapCustomer = (row) => ({
  id: row.id,
  name: row.name,
  phone: row.phone,
  petName: row.pet_name,
  petType: row.pet_type,
  lastVisit: new Date(row.last_visit),
  visitFrequencyWeeks: Number(row.visit_frequency_weeks || 4),
  lifecycleStatus: row.lifecycle_status || 'ACTIVE'
});

const mapAppointment = (row) => ({
  id: row.id,
  customerId: row.customer_id,
  date: new Date(row.date),
  status: row.status,
  price: Number(row.price || 0),
  cancellationFee: Number(row.cancellation_fee || 0)
});

const mapTask = (row) => ({
  id: row.id,
  status: row.status || 'OPEN'
});

const isMissingTableError = (message = '') => String(message || '').includes('relation "tasks" does not exist');

const analyzeCustomerStatus = (customer, appointments) => {
  const today = getIsraelToday();

  const safeLastVisit = new Date(customer.lastVisit);
  if (Number.isNaN(safeLastVisit.getTime())) {
    return {
      status: customer.lifecycleStatus === 'ON_HOLD' ? 'ON_HOLD' : 'OK',
      dueDate: today,
      daysDiff: 0,
      lastEffectiveVisit: today
    };
  }

  let effectiveLastVisit = new Date(safeLastVisit);
  effectiveLastVisit.setHours(0, 0, 0, 0);

  const recentCompletedAppointment = appointments
    .filter((appointment) => appointment.customerId === customer.id && appointment.status === 'COMPLETED')
    .map((appointment) => new Date(appointment.date))
    .sort((left, right) => right.getTime() - left.getTime())[0];

  if (recentCompletedAppointment) {
    const completedDate = new Date(recentCompletedAppointment);
    completedDate.setHours(0, 0, 0, 0);
    if (completedDate.getTime() > effectiveLastVisit.getTime()) {
      effectiveLastVisit = completedDate;
    }
  }

  const futureAppointment = appointments
    .filter((appointment) => appointment.customerId === customer.id && appointment.status !== 'CANCELLED')
    .map((appointment) => new Date(appointment.date))
    .sort((left, right) => left.getTime() - right.getTime())
    .find((date) => {
      const localDate = new Date(date);
      localDate.setHours(0, 0, 0, 0);
      return localDate.getTime() >= today.getTime();
    });

  const frequencyDays = (customer.visitFrequencyWeeks || 4) * 7;
  const dueDate = new Date(effectiveLastVisit);
  dueDate.setDate(dueDate.getDate() + frequencyDays);
  dueDate.setHours(0, 0, 0, 0);

  const timeDiff = dueDate.getTime() - today.getTime();
  const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));

  let status = 'OK';
  if (customer.lifecycleStatus === 'ON_HOLD') {
    status = 'ON_HOLD';
  } else if (futureAppointment) {
    status = 'SCHEDULED';
  } else if (daysDiff < 0) {
    status = 'LATE';
  } else if (daysDiff <= 7) {
    status = 'SOON';
  }

  return {
    status,
    dueDate,
    daysDiff,
    nextAppointment: futureAppointment,
    lastEffectiveVisit: effectiveLastVisit
  };
};

const formatCurrency = (value) => `₪${Number(value || 0).toLocaleString('he-IL')}`;

const detectMetric = (text, period = null) => {
  const hasRevenueWord = /(הכנסות|הכנסה|הכנסתי|הכנסנו|כמה.*הכנס|כמה כסף|מחזור)/.test(text);
  if (hasRevenueWord && period?.type === 'month') return 'monthly_revenue';
  if (hasRevenueWord && period?.type === 'year') return 'yearly_revenue';

  if (/כמה.*לקוחות|סך.*לקוחות|מספר.*לקוחות/.test(text)) return 'total_customers';
  if (/כמה.*באיחור|לקוחות.*באיחור/.test(text)) return 'late_customers';
  if (/כמה.*מתקרבים|לקוחות.*מתקרבים|קרובים/.test(text)) return 'soon_customers';
  if (/כמה.*עם תור|לקוחות.*עם תור|תור עתידי/.test(text)) return 'scheduled_customers';
  if (/כמה.*בהמתנה|לקוחות.*בהמתנה|on hold/.test(text)) return 'on_hold_customers';
  if (/כמה.*תקינים|לקוחות.*תקינים/.test(text)) return 'ok_customers';
  if (/אחוז.*ביטול|אחוז.*ביטולים/.test(text)) return 'cancellation_rate';
  if (/כמה.*ביטולים|כמה.*בוטלו|תורים.*שבוטלו|ביטולים.*החודש/.test(text)) return 'cancelled_appointments';
  if (/כמה.*תורים.*החודש|תורים.*פעילים|תורים.*לא מבוטלים/.test(text)) return 'active_appointments';
  if (/הכנסות.*השנה|כמה.*הכנס.*השנה|כמה כסף.*השנה/.test(text)) return 'yearly_revenue';
  if (/הכנסות.*(?:החודש|חודש)|כמה.*הכנס.*(?:החודש|חודש)|כמה כסף.*(?:החודש|חודש)/.test(text)) return 'monthly_revenue';
  if (hasRevenueWord) return 'monthly_revenue';
  if (/אובדן.*ביטול|הפסד.*ביטול|כמה הפסד/.test(text)) return 'cancellation_loss';
  if (/הפסד.*פוטנציאלי|סיכון.*איחור|כמה.*סיכון/.test(text)) return 'potential_loss';
  if (/כמה.*משימות|מה מצב המשימות|סטטוס המשימות/.test(text)) return 'tasks_summary';
  if (/כל.*הסטטיסטיק|כל.*הנתונ|סטטיסטיקה מלאה|דשבורד|נתונים|מצב העסק|סיכום|סטטיסטיקה/.test(text)) return 'summary';
  return null;
};

export const parseStatsQuery = (message) => {
  const text = normalizeText(message);
  const period = parseStatsPeriod(text);
  const metric = detectMetric(text, period);
  if (!metric) return null;

  return {
    kind: 'stats_query',
    metric,
    period,
    text
  };
};

const loadStatsData = async () => {
  const supabase = getSupabaseClient();
  const [
    { data: customersData, error: customersError },
    { data: appointmentsData, error: appointmentsError },
    { data: tasksData, error: tasksError }
  ] =
    await Promise.all([
      supabase
        .from('customers')
        .select('id, name, phone, pet_name, pet_type, last_visit, visit_frequency_weeks, lifecycle_status'),
      supabase
        .from('appointments')
        .select('id, customer_id, date, status, price, cancellation_fee'),
      supabase
        .from('tasks')
        .select('id, status')
    ]);

  if (customersError) {
    throw createHttpError(500, `Failed to load customers stats: ${customersError.message}`);
  }

  if (appointmentsError) {
    throw createHttpError(500, `Failed to load appointments stats: ${appointmentsError.message}`);
  }

  if (tasksError && !isMissingTableError(tasksError.message)) {
    throw createHttpError(500, `Failed to load tasks stats: ${tasksError.message}`);
  }

  return {
    customers: (customersData || []).map(mapCustomer),
    appointments: (appointmentsData || []).map(mapAppointment),
    tasks: (tasksData || []).map(mapTask)
  };
};

const buildStatsSnapshot = ({ customers, appointments, tasks = [] }, period = null) => {
  const current = getCurrentMonthYear();
  const selectedMonth =
    period?.type === 'month' && period.month ? { month: period.month, year: period.year || current.year } : current;
  const currentMonth = selectedMonth.month;
  const currentYear = period?.type === 'year' && period.year ? period.year : selectedMonth.year;
  const periodAppointments = appointments.filter((appointment) =>
    appointmentMatchesPeriod(appointment, period, selectedMonth)
  );

  const activeAppointments = periodAppointments.filter((appointment) => appointment.status !== 'CANCELLED');
  const cancelledAppointments = periodAppointments.filter((appointment) => appointment.status === 'CANCELLED');
  const cancellationFees = cancelledAppointments.reduce(
    (sum, appointment) => sum + (appointment.cancellationFee || 0),
    0
  );
  const monthlyRevenue =
    activeAppointments.reduce((sum, appointment) => sum + (appointment.price || 0), 0) + cancellationFees;
  const yearlyCancellationFees = appointments
    .filter((appointment) => {
      const parts = getDateMonthYear(appointment.date);
      return parts.year === currentYear && appointment.status === 'CANCELLED';
    })
    .reduce((sum, appointment) => sum + (appointment.cancellationFee || 0), 0);
  const yearlyRevenue =
    appointments
      .filter((appointment) => {
        const parts = getDateMonthYear(appointment.date);
        return parts.year === currentYear && appointment.status !== 'CANCELLED';
      })
      .reduce((sum, appointment) => sum + (appointment.price || 0), 0) + yearlyCancellationFees;

  const cancellationLoss = cancelledAppointments.reduce(
    (sum, appointment) =>
      sum + Math.max(0, (appointment.price || 0) - (appointment.cancellationFee || 0)),
    0
  );

  const totalAppointmentsCount = periodAppointments.length;
  const cancelledCount = cancelledAppointments.length;
  const activeCount = activeAppointments.length;
  const cancellationRate = totalAppointmentsCount > 0 ? Math.round((cancelledCount / totalAppointmentsCount) * 100) : 0;

  const analyzedCustomers = customers.map((customer) => ({
    ...customer,
    ...analyzeCustomerStatus(customer, appointments)
  }));

  const scheduledCustomersCount = analyzedCustomers.filter((customer) => customer.status === 'SCHEDULED').length;
  const lateCustomersCount = analyzedCustomers.filter((customer) => customer.status === 'LATE').length;
  const soonCustomersCount = analyzedCustomers.filter((customer) => customer.status === 'SOON').length;
  const onHoldCustomersCount = analyzedCustomers.filter((customer) => customer.status === 'ON_HOLD').length;
  const okCustomersCount = analyzedCustomers.filter((customer) => customer.status === 'OK').length;
  const potentialLoss = lateCustomersCount * 200;
  const openTasks = tasks.filter((task) => task.status !== 'DONE').length;
  const doneTasks = tasks.filter((task) => task.status === 'DONE').length;

  return {
    totalCustomers: customers.length,
    activeAppointments: activeCount,
    cancelledAppointments: cancelledCount,
    cancellationRate,
    monthlyRevenue,
    yearlyRevenue,
    cancellationLoss,
    potentialLoss,
    scheduledCustomers: scheduledCustomersCount,
    lateCustomers: lateCustomersCount,
    soonCustomers: soonCustomersCount,
    onHoldCustomers: onHoldCustomersCount,
    okCustomers: okCustomersCount,
    totalTasks: tasks.length,
    openTasks,
    doneTasks,
    periodLabel: getStatsPeriodLabel(period, selectedMonth),
    periodMonth: currentMonth,
    periodYear: currentYear
  };
};

const buildMetricReply = (metric, snapshot) => {
  switch (metric) {
    case 'total_customers':
      return `יש כרגע ${snapshot.totalCustomers} לקוחות במערכת.`;
    case 'late_customers':
      return `כרגע יש ${snapshot.lateCustomers} לקוחות באיחור.`;
    case 'soon_customers':
      return `כרגע יש ${snapshot.soonCustomers} לקוחות שמתקרבים למועד.`;
    case 'scheduled_customers':
      return `כרגע יש ${snapshot.scheduledCustomers} לקוחות עם תור עתידי.`;
    case 'on_hold_customers':
      return `כרגע יש ${snapshot.onHoldCustomers} לקוחות בהמתנה.`;
    case 'ok_customers':
      return `כרגע יש ${snapshot.okCustomers} לקוחות תקינים שלא הגיעו למועד היעד.`;
    case 'cancellation_rate':
      return `אחוז הביטולים ב${snapshot.periodLabel} הוא ${snapshot.cancellationRate}%.`;
    case 'cancelled_appointments':
      return `ב${snapshot.periodLabel} בוטלו ${snapshot.cancelledAppointments} תורים.`;
    case 'active_appointments':
      return `ב${snapshot.periodLabel} יש ${snapshot.activeAppointments} תורים לא מבוטלים.`;
    case 'monthly_revenue':
      return `ההכנסות ב${snapshot.periodLabel} הן ${formatCurrency(snapshot.monthlyRevenue)}.`;
    case 'yearly_revenue':
      return `ההכנסות השנה הן ${formatCurrency(snapshot.yearlyRevenue)}.`;
    case 'cancellation_loss':
      return `האובדן מביטולים החודש הוא ${formatCurrency(snapshot.cancellationLoss)}.`;
    case 'potential_loss':
      return `ההפסד הפוטנציאלי מלקוחות באיחור הוא ${formatCurrency(snapshot.potentialLoss)}.`;
    case 'tasks_summary':
      return (
        'מצב המשימות כרגע:\n' +
        `סה"כ משימות: ${snapshot.totalTasks}\n` +
        `משימות פתוחות: ${snapshot.openTasks}\n` +
        `משימות שבוצעו: ${snapshot.doneTasks}`
      );
    case 'summary':
    default:
      return (
        'הסטטיסטיקה כרגע:\n' +
        `לקוחות: ${snapshot.totalCustomers}\n` +
        `הכנסות ב${snapshot.periodLabel}: ${formatCurrency(snapshot.monthlyRevenue)}\n` +
        `הכנסות השנה: ${formatCurrency(snapshot.yearlyRevenue)}\n` +
        `הפסד פוטנציאלי מלקוחות באיחור: ${formatCurrency(snapshot.potentialLoss)}\n` +
        `תורים לא מבוטלים ב${snapshot.periodLabel}: ${snapshot.activeAppointments}\n` +
        `ביטולים ב${snapshot.periodLabel}: ${snapshot.cancelledAppointments} (${snapshot.cancellationRate}%)\n` +
        `אובדן מביטולים ב${snapshot.periodLabel}: ${formatCurrency(snapshot.cancellationLoss)}\n` +
        `לקוחות באיחור: ${snapshot.lateCustomers}\n` +
        `לקוחות מתקרבים: ${snapshot.soonCustomers}\n` +
        `לקוחות עם תור עתידי: ${snapshot.scheduledCustomers}\n` +
        `לקוחות תקינים: ${snapshot.okCustomers}\n` +
        `לקוחות בהמתנה: ${snapshot.onHoldCustomers}\n` +
        `סה"כ משימות: ${snapshot.totalTasks}\n` +
        `משימות פתוחות: ${snapshot.openTasks}\n` +
        `משימות שבוצעו: ${snapshot.doneTasks}`
      );
  }
};

export const getStatsReply = async (queryOrMetric = 'summary') => {
  const metric =
    typeof queryOrMetric === 'string' ? queryOrMetric : queryOrMetric?.metric || 'summary';
  const period =
    typeof queryOrMetric === 'object' && queryOrMetric ? queryOrMetric.period || null : null;
  const data = await loadStatsData();
  const snapshot = buildStatsSnapshot(data, period);

  return {
    metric,
    snapshot,
    text: buildMetricReply(metric, snapshot)
  };
};

export const getStatsSnapshot = async (period = null) => {
  const data = await loadStatsData();
  return buildStatsSnapshot(data, period);
};
