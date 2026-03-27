import { createClient } from '@supabase/supabase-js';

const ISRAEL_TIME_ZONE = 'Asia/Jerusalem';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

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

const detectMetric = (text) => {
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
  if (/הכנסות.*החודש|כמה.*הכנס.*החודש|כמה כסף.*החודש/.test(text)) return 'monthly_revenue';
  if (/אובדן.*ביטול|הפסד.*ביטול|כמה הפסד/.test(text)) return 'cancellation_loss';
  if (/הפסד.*פוטנציאלי|סיכון.*איחור|כמה.*סיכון/.test(text)) return 'potential_loss';
  if (/כמה.*משימות|מה מצב המשימות|סטטוס המשימות/.test(text)) return 'tasks_summary';
  if (/כל.*הסטטיסטיק|כל.*הנתונ|סטטיסטיקה מלאה|דשבורד|נתונים|מצב העסק|סיכום|סטטיסטיקה/.test(text)) return 'summary';
  return null;
};

export const parseStatsQuery = (message) => {
  const text = normalizeText(message);
  const metric = detectMetric(text);
  if (!metric) return null;

  return {
    kind: 'stats_query',
    metric,
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

const buildStatsSnapshot = ({ customers, appointments, tasks = [] }) => {
  const { month: currentMonth, year: currentYear } = getCurrentMonthYear();
  const thisMonthAppointments = appointments.filter((appointment) => {
    const parts = getDateMonthYear(appointment.date);
    return parts.month === currentMonth && parts.year === currentYear;
  });

  const activeAppointments = thisMonthAppointments.filter((appointment) => appointment.status !== 'CANCELLED');
  const cancelledAppointments = thisMonthAppointments.filter((appointment) => appointment.status === 'CANCELLED');
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

  const totalAppointmentsCount = thisMonthAppointments.length;
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
    doneTasks
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
      return `אחוז הביטולים החודש הוא ${snapshot.cancellationRate}%.`;
    case 'cancelled_appointments':
      return `החודש בוטלו ${snapshot.cancelledAppointments} תורים.`;
    case 'active_appointments':
      return `החודש יש ${snapshot.activeAppointments} תורים לא מבוטלים.`;
    case 'monthly_revenue':
      return `ההכנסות החודש הן ${formatCurrency(snapshot.monthlyRevenue)}.`;
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
        `הכנסות החודש: ${formatCurrency(snapshot.monthlyRevenue)}\n` +
        `הכנסות השנה: ${formatCurrency(snapshot.yearlyRevenue)}\n` +
        `הפסד פוטנציאלי מלקוחות באיחור: ${formatCurrency(snapshot.potentialLoss)}\n` +
        `תורים לא מבוטלים החודש: ${snapshot.activeAppointments}\n` +
        `ביטולים החודש: ${snapshot.cancelledAppointments} (${snapshot.cancellationRate}%)\n` +
        `אובדן מביטולים החודש: ${formatCurrency(snapshot.cancellationLoss)}\n` +
        `לקוחות באיחור: ${snapshot.lateCustomers}\n` +
        `לקוחות מתקרבים: ${snapshot.soonCustomers}\n` +
        `לקוחות עם תור עתידי: ${snapshot.scheduledCustomers}\n` +
        `לקוחות תקינים: ${snapshot.okCustomers}\n` +
        `לקוחות בהמתנה: ${snapshot.onHoldCustomers}\n` +
        `משימות פתוחות: ${snapshot.openTasks}\n` +
        `משימות שבוצעו: ${snapshot.doneTasks}`
      );
  }
};

export const getStatsReply = async (metric = 'summary') => {
  const data = await loadStatsData();
  const snapshot = buildStatsSnapshot(data);

  return {
    metric,
    snapshot,
    text: buildMetricReply(metric, snapshot)
  };
};
