import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Palette, X } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { NotificationsPanel } from './components/NotificationsPanel';
import { Calendar } from './components/Calendar';
import { CustomersView } from './components/CustomersView';
import { CustomerModal } from './components/CustomerModal';
import { AppointmentModal } from './components/AppointmentModal';
import { CalendarEventModal } from './components/CalendarEventModal';
import { StatsView } from './components/StatsView';
import { MessagesView } from './components/MessagesView';
import { AdminLogin } from './components/AdminLogin';
import { ScheduleSettingsView } from './components/ScheduleSettingsView';
import { ThemePanel } from './components/ThemePanel';
import { ViewType, Appointment, CalendarEvent, Customer, Dog, GroomingRecord, AppointmentStatus, Task, TaskStatus, WhatsAppMessage } from './types';
import { CANCELLATION_FEE_AMOUNT, CANCELLATION_FEE_WINDOW_HOURS } from './constants';
import { applyTheme, loadTheme } from './theme';
import { normalizePhoneForCompare } from './utils';
import { HomeDashboard } from './components/HomeDashboard';
import { DogCardModal } from './components/DogCardModal';
import { GroomingRecordModal } from './components/GroomingRecordModal';
import { WhatsAppQuickSendModal } from './components/WhatsAppQuickSendModal';
import { SmartSearchModal } from './components/SmartSearchModal';

type DbCustomer = {
  id: string;
  name: string;
  phone: string;
  pet_name: string;
  pet_type: string;
  last_visit: string;
  visit_frequency_weeks: number;
  lifecycle_status: 'ACTIVE' | 'ON_HOLD' | null;
  default_price: number | null;
  notes?: string | null;
};

type DbAppointment = {
  id: string;
  customer_id: string;
  dog_id?: string | null;
  date: string;
  service: string;
  status: AppointmentStatus;
  notes: string | null;
  price: number;
  cancellation_fee?: number | null;
};

type DbDog = {
  id: string;
  customer_id: string;
  name: string;
  breed: string | null;
  sex: 'MALE' | 'FEMALE' | null;
  size: 'SMALL' | 'MEDIUM' | 'LARGE' | null;
  weight_kg: number | null;
  allergies: string | null;
  medical_notes: string | null;
  behavior_notes: string | null;
  notes: string | null;
  photo_url: string | null;
  last_visit: string;
  visit_frequency_weeks: number;
  default_price: number | null;
  lifecycle_status: 'ACTIVE' | 'ON_HOLD' | null;
};

type DbGroomingRecord = {
  id: string;
  dog_id: string;
  appointment_id: string | null;
  visit_date: string;
  body_note: string | null;
  legs_note: string | null;
  face_note: string | null;
  head_note: string | null;
  tail_note: string | null;
  nails_done: boolean;
  ears_cleaned: boolean;
  note: string | null;
};

type DbTask = {
  id: string;
  title: string;
  status: TaskStatus;
  created_at: string;
  start_date: string | null;
};

type DbCalendarEvent = {
  id: string;
  title: string;
  starts_at: string;
  kind: 'EVENT';
  color_key: string;
  show_in_calendar: boolean;
  blocks_time: boolean;
  notes?: string | null;
};

type DbWhatsAppMessage = {
  id: string;
  phone: string;
  direction: 'INCOMING' | 'OUTGOING' | 'SYSTEM';
  body: string;
  message_type: string;
  intent_kind: string | null;
  needs_human: boolean;
  created_at: string;
};

const mapCustomerFromDb = (row: DbCustomer): Customer => ({
  id: row.id,
  name: row.name,
  phone: row.phone,
  petName: row.pet_name,
  petType: row.pet_type,
  lastVisit: new Date(row.last_visit),
  visitFrequencyWeeks: row.visit_frequency_weeks,
  lifecycleStatus: row.lifecycle_status ?? 'ACTIVE',
  defaultPrice: row.default_price ?? undefined,
  notes: row.notes ?? undefined,
});

const mapAppointmentFromDb = (row: DbAppointment): Appointment => ({
  id: row.id,
  customerId: row.customer_id,
  dogId: row.dog_id ?? undefined,
  date: new Date(row.date),
  service: row.service,
  status: row.status,
  notes: row.notes ?? undefined,
  price: row.price,
  cancellationFee: row.cancellation_fee ?? undefined
});

const mapDogFromDb = (row: DbDog): Dog => ({
  id: row.id,
  customerId: row.customer_id,
  name: row.name,
  breed: row.breed ?? undefined,
  sex: row.sex ?? undefined,
  sizeCategory: row.size ?? undefined,
  weightKg: row.weight_kg ?? undefined,
  allergies: row.allergies ?? undefined,
  medicalNotes: row.medical_notes ?? undefined,
  behaviorNotes: row.behavior_notes ?? undefined,
  notes: row.notes ?? undefined,
  photoUrl: row.photo_url ?? undefined,
  lastVisit: new Date(row.last_visit),
  visitFrequencyWeeks: row.visit_frequency_weeks,
  defaultPrice: row.default_price ?? undefined,
  lifecycleStatus: row.lifecycle_status ?? 'ACTIVE',
});

const mapDogToDb = (dog: Dog): DbDog => ({
  id: dog.id,
  customer_id: dog.customerId,
  name: dog.name,
  breed: dog.breed ?? null,
  sex: dog.sex ?? null,
  size: dog.sizeCategory ?? null,
  weight_kg: dog.weightKg ?? null,
  allergies: dog.allergies ?? null,
  medical_notes: dog.medicalNotes ?? null,
  behavior_notes: dog.behaviorNotes ?? null,
  notes: dog.notes ?? null,
  photo_url: dog.photoUrl ?? null,
  last_visit: dog.lastVisit.toISOString(),
  visit_frequency_weeks: dog.visitFrequencyWeeks,
  default_price: dog.defaultPrice ?? null,
  lifecycle_status: dog.lifecycleStatus,
});

const mapGroomingRecordFromDb = (row: DbGroomingRecord): GroomingRecord => ({
  id: row.id,
  dogId: row.dog_id,
  appointmentId: row.appointment_id ?? undefined,
  visitDate: new Date(row.visit_date),
  bodyNote: row.body_note ?? undefined,
  legsNote: row.legs_note ?? undefined,
  faceNote: row.face_note ?? undefined,
  headNote: row.head_note ?? undefined,
  tailNote: row.tail_note ?? undefined,
  nailsDone: row.nails_done,
  earsCleaned: row.ears_cleaned,
  note: row.note ?? undefined,
});

const mapGroomingRecordToDb = (record: GroomingRecord): DbGroomingRecord => ({
  id: record.id,
  dog_id: record.dogId,
  appointment_id: record.appointmentId ?? null,
  visit_date: record.visitDate.toISOString(),
  body_note: record.bodyNote ?? null,
  legs_note: record.legsNote ?? null,
  face_note: record.faceNote ?? null,
  head_note: record.headNote ?? null,
  tail_note: record.tailNote ?? null,
  nails_done: record.nailsDone,
  ears_cleaned: record.earsCleaned,
  note: record.note ?? null,
});

const mapCustomerToDb = (customer: Customer): DbCustomer => ({
  id: customer.id,
  name: customer.name,
  phone: customer.phone,
  pet_name: customer.petName,
  pet_type: customer.petType,
  last_visit: customer.lastVisit.toISOString(),
  visit_frequency_weeks: customer.visitFrequencyWeeks,
  lifecycle_status: customer.lifecycleStatus,
  default_price: customer.defaultPrice ?? null,
  notes: customer.notes ?? null,
});

const mapAppointmentToDb = (appointment: Appointment): DbAppointment => ({
  id: appointment.id,
  customer_id: appointment.customerId,
  dog_id: appointment.dogId ?? null,
  date: appointment.date.toISOString(),
  service: appointment.service,
  status: appointment.status,
  notes: appointment.notes ?? null,
  price: appointment.price,
  cancellation_fee: appointment.cancellationFee ?? null
});

const mapTaskFromDb = (row: DbTask): Task => ({
  id: row.id,
  title: row.title,
  status: row.status,
  createdAt: new Date(row.created_at),
  startDate: new Date(row.start_date || row.created_at),
});

const mapCalendarEventFromDb = (row: DbCalendarEvent): CalendarEvent => ({
  id: row.id,
  title: row.title,
  date: new Date(row.starts_at),
  kind: row.kind,
  colorKey: row.color_key,
  showInCalendar: row.show_in_calendar,
  blocksTime: row.blocks_time,
  notes: row.notes ?? undefined,
});

const mapWhatsAppMessageFromDb = (row: DbWhatsAppMessage): WhatsAppMessage => ({
  id: row.id,
  phone: row.phone,
  direction: row.direction,
  body: row.body,
  messageType: row.message_type,
  intentKind: row.intent_kind ?? undefined,
  needsHuman: row.needs_human,
  createdAt: new Date(row.created_at),
});

const mapCalendarEventToDb = (event: CalendarEvent): DbCalendarEvent => ({
  id: event.id,
  title: event.title,
  starts_at: event.date.toISOString(),
  kind: event.kind,
  color_key: event.colorKey,
  show_in_calendar: event.showInCalendar,
  blocks_time: event.blocksTime,
  notes: event.notes ?? null
});

const mapTaskToDb = (task: Task): DbTask => ({
  id: task.id,
  title: task.title,
  status: task.status,
  created_at: task.createdAt.toISOString(),
  start_date: task.startDate.toISOString(),
});

const calendarEventSignature = (list: CalendarEvent[]) =>
  JSON.stringify(
    sortById(list).map(event => ({
      ...event,
      date: event.date.toISOString(),
      notes: event.notes ?? null
    }))
  );

const isMissingSpecificTableError = (message: string, tableName: string) => {
  const lower = message.toLowerCase();
  return (
    lower.includes(`relation "${tableName}" does not exist`) ||
    lower.includes(`could not find the table 'public.${tableName}' in the schema cache`) ||
    lower.includes(`could not find the table "public.${tableName}" in the schema cache`)
  );
};

const isMissingTableError = (message?: string) => {
  if (!message) return false;
  return (
    isMissingSpecificTableError(message, 'tasks') ||
    isMissingSpecificTableError(message, 'calendar_events') ||
    isMissingSpecificTableError(message, 'whatsapp_messages')
  );
};

const sortById = <T extends { id: string }>(list: T[]): T[] =>
  [...list].sort((a, b) => a.id.localeCompare(b.id));

const sortCalendarEventsByDate = (list: CalendarEvent[]) =>
  [...list].sort((left, right) => left.date.getTime() - right.date.getTime());

const customersSignature = (list: Customer[]) =>
  JSON.stringify(
    sortById(list).map(c => ({
      ...c,
      lastVisit: c.lastVisit.toISOString(),
      lifecycleStatus: c.lifecycleStatus,
      defaultPrice: c.defaultPrice ?? null,
      notes: c.notes ?? null
    }))
  );

const appointmentsSignature = (list: Appointment[]) =>
  JSON.stringify(
    sortById(list).map(a => ({
      ...a,
      date: a.date.toISOString(),
      dogId: a.dogId ?? null,
      notes: a.notes ?? null,
      cancellationFee: a.cancellationFee ?? null
    }))
  );

const dogsSignature = (list: Dog[]) =>
  JSON.stringify(
    sortById(list).map(d => ({
      ...d,
      lastVisit: d.lastVisit.toISOString(),
    }))
  );

const groomingRecordsSignature = (list: GroomingRecord[]) =>
  JSON.stringify(
    sortById(list).map(r => ({
      ...r,
      visitDate: r.visitDate.toISOString(),
      appointmentId: r.appointmentId ?? null,
    }))
  );

const tasksSignature = (list: Task[]) =>
  JSON.stringify(
    sortById(list).map(t => ({
      ...t,
      createdAt: t.createdAt.toISOString(),
      startDate: t.startDate.toISOString()
    }))
  );

const whatsappMessagesSignature = (list: WhatsAppMessage[]) =>
  JSON.stringify(
    sortById(list).map(message => ({
      ...message,
      createdAt: message.createdAt.toISOString()
    }))
  );

const formatSupabaseError = (
  fallback: string,
  error?: { message?: string | null; code?: string | null } | null
) => {
  const details = error?.message ? error.message : '';
  return details ? `${fallback}: ${details}` : fallback;
};

type CloudSyncStatus = 'connecting' | 'online' | 'syncing' | 'offline' | 'error';
type CloudLoadSource = 'initial' | 'manual' | 'realtime' | 'auto' | 'reconnect';

const CLOUD_STATUS_UI: Record<CloudSyncStatus, { label: string; className: string }> = {
  connecting: {
    label: 'מתחבר לענן...',
    className: 'bg-blue-50 text-blue-700 border-blue-200'
  },
  online: {
    label: 'מחובר לענן',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200'
  },
  syncing: {
    label: 'מסנכרן לענן...',
    className: 'bg-indigo-50 text-indigo-700 border-indigo-200'
  },
  offline: {
    label: 'מנותק מענן',
    className: 'bg-amber-50 text-amber-800 border-amber-200'
  },
  error: {
    label: 'שגיאת סנכרון',
    className: 'bg-rose-50 text-rose-700 border-rose-200'
  }
};

const AUTO_REFRESH_INTERVAL_MS = 2 * 60 * 1000;
const CLOUD_RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000];

const isBrowserOffline = () =>
  typeof navigator !== 'undefined' && navigator.onLine === false;

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewType>('HOME');
  const [currentDate, setCurrentDate] = useState(new Date());

  // Data State
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [dogs, setDogs] = useState<Dog[]>([]);
  const [groomingRecords, setGroomingRecords] = useState<GroomingRecord[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [whatsappMessages, setWhatsAppMessages] = useState<WhatsAppMessage[]>([]);
  const [whatsappMessagesTableMissing, setWhatsappMessagesTableMissing] = useState(false);
  const [businessSchedule, setBusinessSchedule] = useState<{
    weeklySlots: Record<string, string[]>;
    maxBookingDaysAhead: number;
  }>(() => ({
    weeklySlots: {
      '0': ['07:00', '08:00'],
      '1': ['09:00', '12:00', '15:00'],
      '2': ['09:00', '12:00', '15:00'],
      '3': ['08:00', '11:00', '14:00'],
      '4': ['07:00', '08:00'],
      '5': ['07:00', '08:00'],
      '6': []
    },
    maxBookingDaysAhead: 30
  }));
  const [syncingTaskIds, setSyncingTaskIds] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [adminSessionToken, setAdminSessionToken] = useState(() => {
    try {
      return localStorage.getItem('pawlished_admin_session') || '';
    } catch {
      return '';
    }
  });
  const [adminPhone, setAdminPhone] = useState(() => {
    try {
      return localStorage.getItem('pawlished_admin_phone') || '';
    } catch {
      return '';
    }
  });
  const [cloudStatus, setCloudStatus] = useState<CloudSyncStatus>(
    adminSessionToken && !isBrowserOffline() ? 'connecting' : 'offline'
  );
  const [lastCloudSyncAt, setLastCloudSyncAt] = useState<Date | null>(null);
  const [askedAppointmentIds, setAskedAppointmentIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('pawlished_asked_appt_ids');
      const parsed = raw ? (JSON.parse(raw) as string[]) : [];
      return new Set(parsed);
    } catch {
      return new Set();
    }
  });
  const [pendingCheck, setPendingCheck] = useState<{
    appointment: Appointment;
    customer: Customer;
  } | null>(null);
  
  // Modal State
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [prefillCustomerPhone, setPrefillCustomerPhone] = useState<string>('');
  const [selectedDogId, setSelectedDogId] = useState<string | null>(null);
  const [newDogForCustomerId, setNewDogForCustomerId] = useState<string | null>(null);
  const [groomingRecordAppointmentId, setGroomingRecordAppointmentId] = useState<string | null>(null);
  const [whatsAppTarget, setWhatsAppTarget] = useState<{ customerId: string; dogId?: string } | null>(null);
  const [isSmartSearchOpen, setIsSmartSearchOpen] = useState(false);

  // Appointment Modal State
  const [isAppointmentModalOpen, setIsAppointmentModalOpen] = useState(false);
  const [selectedDateForAppointment, setSelectedDateForAppointment] = useState<Date>(new Date());
  const [preSelectedCustomerId, setPreSelectedCustomerId] = useState<string | undefined>(undefined);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [isCalendarEventModalOpen, setIsCalendarEventModalOpen] = useState(false);
  const [selectedDateForEvent, setSelectedDateForEvent] = useState<Date>(new Date());
  const [editingCalendarEvent, setEditingCalendarEvent] = useState<CalendarEvent | null>(null);
  const [dayPanelDate, setDayPanelDate] = useState<Date | null>(null);
  const [isThemePanelOpen, setIsThemePanelOpen] = useState(false);
  const localMutationSuppressUntilRef = useRef(0);
  const cloudLoadInFlightRef = useRef(false);
  const cloudRetryTimerRef = useRef<number | null>(null);
  const cloudRetryAttemptRef = useRef(0);
  const customersRef = useRef<Customer[]>([]);
  const dogsRef = useRef<Dog[]>([]);
  const groomingRecordsRef = useRef<GroomingRecord[]>([]);
  const appointmentsRef = useRef<Appointment[]>([]);
  const calendarEventsRef = useRef<CalendarEvent[]>([]);
  const tasksRef = useRef<Task[]>([]);
  const whatsappMessagesRef = useRef<WhatsAppMessage[]>([]);

  useEffect(() => {
    applyTheme(loadTheme());
  }, []);

  useEffect(() => {
    localStorage.setItem(
      'pawlished_asked_appt_ids',
      JSON.stringify(Array.from(askedAppointmentIds))
    );
  }, [askedAppointmentIds]);

  useEffect(() => {
    customersRef.current = customers;
  }, [customers]);

  useEffect(() => {
    dogsRef.current = dogs;
  }, [dogs]);

  useEffect(() => {
    groomingRecordsRef.current = groomingRecords;
  }, [groomingRecords]);

  useEffect(() => {
    appointmentsRef.current = appointments;
  }, [appointments]);

  useEffect(() => {
    calendarEventsRef.current = calendarEvents;
  }, [calendarEvents]);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    whatsappMessagesRef.current = whatsappMessages;
  }, [whatsappMessages]);

  const clearAdminSession = useCallback((message?: string) => {
    setAdminSessionToken('');
    setAdminPhone('');

    try {
      localStorage.removeItem('pawlished_admin_session');
      localStorage.removeItem('pawlished_admin_phone');
    } catch {
      // ignore storage errors
    }

    setCloudStatus('offline');
    setWhatsappMessagesTableMissing(false);
    if (message) {
      setLoadError(message);
    }
  }, []);

  const loadDataFromCloud = useCallback(
    async (source: CloudLoadSource = 'manual') => {
      if (source === 'auto' && Date.now() < localMutationSuppressUntilRef.current) {
        return true;
      }

    if (cloudLoadInFlightRef.current) {
      return source === 'manual' || source === 'initial';
    }

    cloudLoadInFlightRef.current = true;

    try {
    if (!adminSessionToken) {
      setCloudStatus('offline');
      setWhatsappMessagesTableMissing(false);
      setLoadError('נדרשת התחברות כדי לטעון את היומן מהענן.');
      return false;
    }

    if (isBrowserOffline()) {
      setCloudStatus('offline');
      setLoadError('\u05D0\u05D9\u05DF \u05D7\u05D9\u05D1\u05D5\u05E8 \u05D0\u05D9\u05E0\u05D8\u05E8\u05E0\u05D8 \u05DB\u05E8\u05D2\u05E2. \u05D4\u05E0\u05EA\u05D5\u05E0\u05D9\u05DD \u05D9\u05D8\u05E2\u05E0\u05D5 \u05DE\u05D4\u05E2\u05E0\u05DF \u05DB\u05E9\u05D4\u05E8\u05E9\u05EA \u05EA\u05D7\u05D6\u05D5\u05E8.');
      return false;
    }

    if (source === 'initial' || source === 'manual' || source === 'reconnect') {
      setCloudStatus('connecting');
    }

    const response = await fetch('/api/admin/data', {
      method: 'GET',
      headers: {
        'X-OTP-Token': adminSessionToken
      }
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.ok) {
      if (response.status === 401 || response.status === 403) {
        clearAdminSession(payload?.error || 'נדרשת התחברות מחדש.');
        return false;
      }

      setCloudStatus('error');
      setLoadError(payload?.error || 'טעינת היומן מהענן נכשלה.');
      return false;
    }

    setWhatsappMessagesTableMissing(Boolean(payload.whatsappMessagesMissing));
    {
      const scheduleRow =
        payload.businessSchedule && typeof payload.businessSchedule === 'object'
          ? (payload.businessSchedule as Record<string, unknown>)
          : null;

      const weeklySlotsRaw =
        (scheduleRow?.weekly_slots as unknown) ?? (scheduleRow?.weeklySlots as unknown);
      const weeklySlots =
        weeklySlotsRaw && typeof weeklySlotsRaw === 'object'
          ? (weeklySlotsRaw as Record<string, unknown>)
          : null;

      const normalizeTime = (value: unknown) => {
        const trimmed = typeof value === 'string' ? value.trim() : '';
        const match = trimmed.match(/^([01]?\d|2[0-3])(?::([0-5]\d))?$/);
        if (!match) return null;
        const hours = Number(match[1]);
        const minutes = Number(match[2] || '0');
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
      };

      const normalizedWeeklySlots: Record<string, string[]> = {};
      for (let day = 0; day <= 6; day += 1) {
        const raw = weeklySlots?.[String(day)];
        const list = Array.isArray(raw) ? raw : [];
        const seen = new Set<string>();
        list.forEach((time) => {
          const normalized = normalizeTime(time);
          if (normalized) {
            seen.add(normalized);
          }
        });
        normalizedWeeklySlots[String(day)] = Array.from(seen).sort();
      }

      const maxDaysRaw =
        (scheduleRow?.max_booking_days_ahead as unknown) ?? (scheduleRow?.maxBookingDaysAhead as unknown);
      const numeric = Number(maxDaysRaw);
      const maxBookingDaysAhead = Math.min(30, Math.max(1, Number.isFinite(numeric) ? Math.round(numeric) : 30));

      if (scheduleRow) {
        setBusinessSchedule({ weeklySlots: normalizedWeeklySlots, maxBookingDaysAhead });
      }
    }

    const customersRes = { data: payload.customers || [], error: null as any };
    const dogsRes = { data: payload.dogs || [], error: null as any };
    const dogsMissing = Boolean(payload.dogsMissing);
    const groomingRecordsRes = { data: payload.groomingRecords || [], error: null as any };
    const groomingRecordsMissing = Boolean(payload.groomingRecordsMissing);
    const appointmentsRes = { data: payload.appointments || [], error: null as any };
    const calendarEventsRes = { data: payload.calendarEvents || [], error: null as any };
    const tasksRes = { data: payload.tasks || [], error: null as any };
    const whatsappMessagesRes = { data: payload.whatsappMessages || [], error: null as any };

    const customersError = null as any;
    const appointmentsError = null as any;
    const calendarEventsError = null as any;
    const tasksError = null as any;
    const whatsappMessagesError = null as any;
    const whatsappMessagesMissing = Boolean(payload.whatsappMessagesMissing);

    if (customersError || appointmentsError) {
      console.error('Supabase load error', customersError || appointmentsError);
      setCloudStatus('error');
      setLoadError(
        formatSupabaseError(
          'טעינת היומן מהענן נכשלה. בדוק הרשאות/חיבור Supabase',
          customersError || appointmentsError
        )
      );
      return false;
    }

    const mappedCustomers = (customersRes.data || []).map(mapCustomerFromDb);
    const mappedDogs = dogsMissing ? [] : (dogsRes.data || []).map(mapDogFromDb);
    const mappedGroomingRecords = groomingRecordsMissing ? [] : (groomingRecordsRes.data || []).map(mapGroomingRecordFromDb);
    const mappedAppointments = (appointmentsRes.data || []).map(mapAppointmentFromDb);
    const mappedCalendarEvents =
      calendarEventsError && isMissingTableError(calendarEventsError.message)
        ? []
        : (calendarEventsRes.data || []).map(mapCalendarEventFromDb);
    const mappedWhatsAppMessages =
      whatsappMessagesMissing
        ? []
        : (whatsappMessagesRes.data || []).map(mapWhatsAppMessageFromDb);

    if (customersSignature(customersRef.current) !== customersSignature(mappedCustomers)) {
      setCustomers(mappedCustomers);
    }

    if (dogsSignature(dogsRef.current) !== dogsSignature(mappedDogs)) {
      setDogs(mappedDogs);
    }

    if (groomingRecordsSignature(groomingRecordsRef.current) !== groomingRecordsSignature(mappedGroomingRecords)) {
      setGroomingRecords(mappedGroomingRecords);
    }

    if (appointmentsSignature(appointmentsRef.current) !== appointmentsSignature(mappedAppointments)) {
      setAppointments(mappedAppointments);
    }

    if (calendarEventsError && !isMissingTableError(calendarEventsError.message)) {
      console.error('Supabase calendar events load error', calendarEventsError);
      setCloudStatus('error');
      setLoadError(formatSupabaseError('טעינת האירועים מהענן נכשלה. בדוק הרשאות/חיבור Supabase', calendarEventsError));
      return false;
    }

    if (
      calendarEventSignature(calendarEventsRef.current) !==
      calendarEventSignature(mappedCalendarEvents)
    ) {
      setCalendarEvents(mappedCalendarEvents);
    }

    if (tasksError) {
      if (isMissingTableError(tasksError.message)) {
        setCloudStatus('error');
        setLoadError('טבלת המשימות לא נמצאה בענן. יש לבצע מיגרציה או לבדוק את הבסיס.');
        return false;
      }

      console.error('Supabase tasks load error', tasksError);
      setCloudStatus('error');
      setLoadError(formatSupabaseError('טעינת המשימות מהענן נכשלה. בדוק הרשאות/חיבור Supabase', tasksError));
      return false;
    }

    const mappedTasks =
      tasksError && isMissingTableError(tasksError.message)
        ? []
        : (tasksRes.data || []).map(mapTaskFromDb);

    if (tasksSignature(tasksRef.current) !== tasksSignature(mappedTasks)) {
      setTasks(mappedTasks);
    }

    if (whatsappMessagesError && !whatsappMessagesMissing) {
      console.error('Supabase WhatsApp messages load error', whatsappMessagesError);
      setCloudStatus('error');
      setLoadError(formatSupabaseError('טעינת הודעות WhatsApp מהענן נכשלה. בדוק הרשאות/חיבור Supabase', whatsappMessagesError));
      return false;
    }

    if (whatsappMessagesSignature(whatsappMessagesRef.current) !== whatsappMessagesSignature(mappedWhatsAppMessages)) {
      setWhatsAppMessages(mappedWhatsAppMessages);
    }

    setCloudStatus('online');
    setLastCloudSyncAt(new Date());
    setLoadError(null);
    return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Supabase load exception', error);
      setCloudStatus(isBrowserOffline() ? 'offline' : 'error');
      setLoadError(`\u05D8\u05E2\u05D9\u05E0\u05EA \u05D4\u05D9\u05D5\u05DE\u05DF \u05DE\u05D4\u05E2\u05E0\u05DF \u05E0\u05DB\u05E9\u05DC\u05D4: ${message}`);
      return false;
    } finally {
      cloudLoadInFlightRef.current = false;
    }
  }, [adminSessionToken, clearAdminSession]);

  useEffect(() => {
    if (!adminSessionToken) {
      setCloudStatus('offline');
      return;
    }

    if (isBrowserOffline()) {
      setCloudStatus('offline');
      return;
    }

    setCloudStatus('connecting');
    void loadDataFromCloud('initial');
  }, [adminSessionToken, loadDataFromCloud]);

  useEffect(() => {
    // Realtime sync disabled (admin API mode).
  }, []);

  useEffect(() => {
    if (!adminSessionToken) return;

    const runAutoRefresh = () => {
      if (document.visibilityState !== 'visible') return;
      void loadDataFromCloud('auto');
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        runAutoRefresh();
      }
    };

    const timer = window.setInterval(runAutoRefresh, AUTO_REFRESH_INTERVAL_MS);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [adminSessionToken, loadDataFromCloud]);

  useEffect(() => {
    if (!adminSessionToken) return;

    const handleOffline = () => {
      setCloudStatus('offline');
      setLoadError('\u05D0\u05D9\u05DF \u05D7\u05D9\u05D1\u05D5\u05E8 \u05D0\u05D9\u05E0\u05D8\u05E8\u05E0\u05D8 \u05DB\u05E8\u05D2\u05E2. \u05D4\u05E0\u05EA\u05D5\u05E0\u05D9\u05DD \u05D9\u05EA\u05E2\u05D3\u05DB\u05E0\u05D5 \u05DB\u05E9\u05D4\u05E8\u05E9\u05EA \u05EA\u05D7\u05D6\u05D5\u05E8.');
    };

    const handleOnline = () => {
      cloudRetryAttemptRef.current = 0;
      setCloudStatus('connecting');
      void loadDataFromCloud('manual');
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    if (isBrowserOffline()) {
      handleOffline();
    }

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [adminSessionToken, loadDataFromCloud]);

  useEffect(() => {
    if (!adminSessionToken) return;

    if (cloudStatus !== 'error') {
      cloudRetryAttemptRef.current = 0;
      if (cloudRetryTimerRef.current) {
        window.clearTimeout(cloudRetryTimerRef.current);
        cloudRetryTimerRef.current = null;
      }
      return;
    }

    if (isBrowserOffline()) return;

    let cancelled = false;

    const scheduleRetry = () => {
      const delay = CLOUD_RETRY_DELAYS_MS[
        Math.min(cloudRetryAttemptRef.current, CLOUD_RETRY_DELAYS_MS.length - 1)
      ];

      cloudRetryTimerRef.current = window.setTimeout(async () => {
        cloudRetryTimerRef.current = null;
        const isConnected = await loadDataFromCloud('auto');

        if (!isConnected && !cancelled && !isBrowserOffline()) {
          cloudRetryAttemptRef.current += 1;
          scheduleRetry();
        }
      }, delay);
    };

    scheduleRetry();

    return () => {
      cancelled = true;
      if (cloudRetryTimerRef.current) {
        window.clearTimeout(cloudRetryTimerRef.current);
        cloudRetryTimerRef.current = null;
      }
    };
  }, [cloudStatus, adminSessionToken, loadDataFromCloud]);

  useEffect(() => {
    if (pendingCheck) return;

    const checkDueAppointments = () => {
      const now = Date.now();
      const nextDue = appointments
        .filter(a => a.status === AppointmentStatus.SCHEDULED)
        .filter(a => now >= new Date(a.date).getTime() + 30 * 60 * 1000)
        .filter(a => !askedAppointmentIds.has(a.id))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];

      if (!nextDue) return;
      const customer = customers.find(c => c.id === nextDue.customerId);
      if (!customer) return;

      setPendingCheck({ appointment: nextDue, customer });
    };

    checkDueAppointments();
    const timer = setInterval(checkDueAppointments, 60 * 1000);
    return () => clearInterval(timer);
  }, [appointments, customers, askedAppointmentIds, pendingCheck]);

  const adminMutate = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!adminSessionToken) {
        throw new Error('נדרשת התחברות הנהלה.');
      }

      const response = await fetch('/api/admin/mutate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-OTP-Token': adminSessionToken
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) {
        const message = typeof data?.error === 'string' ? data.error : 'שגיאה בביצוע פעולה בענן.';
        if (response.status === 401 || response.status === 403) {
          clearAdminSession(message || 'נדרשת התחברות מחדש.');
        }
        throw new Error(message);
      }

      return data as Record<string, unknown>;
    },
    [adminSessionToken, clearAdminSession]
  );

  const handleSendWhatsAppMessage = useCallback(
    async (phone: string, body: string) => {
      const response = await fetch('/api/whatsapp-send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(adminSessionToken ? { 'X-OTP-Token': adminSessionToken } : {})
        },
        body: JSON.stringify({ phone, body })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || 'שליחת הודעה נכשלה.');
      }
    },
    [adminSessionToken]
  );

  const persistCloudMutation = (
    fallbackMessage: string,
    writer: () => PromiseLike<unknown>,
    refreshAfterSuccess = false
  ) => {
    void Promise.resolve(writer())
      .then(() => {
        markCloudMutationSuccess(refreshAfterSuccess);
      })
      .catch((error) => {
        reportCloudMutationError(fallbackMessage, error);
      });
  };

  const markCloudMutationSuccess = (refreshAfterSuccess = false) => {
    setCloudStatus('online');
    setLastCloudSyncAt(new Date());
    setLoadError(null);
    if (refreshAfterSuccess) {
      void loadDataFromCloud('manual');
    }
  };

  const reportCloudMutationError = (fallbackMessage: string, error: unknown) => {
    const normalizedError =
      error && typeof error === 'object' && 'message' in error
        ? { message: String((error as { message?: unknown }).message || '') }
        : { message: error instanceof Error ? error.message : String(error) };

    console.error('Cloud mutation error', error);
    setCloudStatus('error');
    setLoadError(formatSupabaseError(fallbackMessage, normalizedError));
  };

  const setTaskSyncing = (taskId: string, isSyncing: boolean) => {
    setSyncingTaskIds(prev => {
      const next = new Set(prev);
      if (isSyncing) {
        next.add(taskId);
      } else {
        next.delete(taskId);
      }
      return next;
    });
  };

  const ensureCloudWritable = () => {
    if (!adminSessionToken || cloudStatus === 'offline' || isBrowserOffline()) {
      setCloudStatus('offline');
      setLoadError('אין חיבור לענן כרגע. שינויים נחסמו עד שחיבור Supabase יחזור.');
      return false;
    }
    localMutationSuppressUntilRef.current = Date.now() + 1500;
    setCloudStatus('syncing');
    return true;
  };

  const handleDayClick = (date: Date) => {
    setSelectedDateForAppointment(date);
    setPreSelectedCustomerId(undefined); 
    setEditingAppointment(null); 
    setIsAppointmentModalOpen(true);
  };

  const handleDaySelect = (date: Date) => {
    setCurrentDate(date);
    setDayPanelDate(date);
  };

  const openCalendarEventModal = (date = new Date()) => {
    setEditingCalendarEvent(null);
    setSelectedDateForEvent(date);
    setIsCalendarEventModalOpen(true);
  };

  const handleCalendarEventClick = (calendarEvent: CalendarEvent) => {
    setEditingCalendarEvent(calendarEvent);
    setSelectedDateForEvent(new Date(calendarEvent.date));
    setIsCalendarEventModalOpen(true);
  };
   
  const handleAppointmentClick = (appointment: Appointment) => {
    setEditingAppointment(appointment);
    setIsAppointmentModalOpen(true);
  };

  const handleMoveAppointment = (appointmentId: string, newDate: Date) => {
      if (!ensureCloudWritable()) return;
      let updatedAppointment: Appointment | null = null;
      let updatedCustomer: Customer | null = null;
      setAppointments(prev => prev.map(appt => {
          if (appt.id === appointmentId) {
              const updatedDate = new Date(newDate);
              const originalTime = new Date(appt.date);
              
              // Preserve the original time (hour/minute), only update the calendar date
              updatedDate.setHours(originalTime.getHours(), originalTime.getMinutes());
              
              // Smart Logic: Reset status if moving to future
              // If you drag a 'Late' or 'Completed' appointment to a future date, it implies rescheduling.
              let newStatus = appt.status;
              const now = new Date();
              
              // Check if moved to future (and wasn't already just scheduled)
              if (updatedDate > now) {
                  if (appt.status === AppointmentStatus.LATE || 
                      appt.status === AppointmentStatus.CANCELLED || 
                      appt.status === AppointmentStatus.COMPLETED) {
                      newStatus = AppointmentStatus.SCHEDULED;
                  }
              }

              updatedAppointment = { 
                  ...appt, 
                  date: updatedDate,
                  status: newStatus 
              };
              return updatedAppointment;
          }
          return appt;
      }));

      if (updatedAppointment) {
        setCustomers(prev => prev.map(c => {
          if (c.id === updatedAppointment!.customerId) {
            updatedCustomer = { ...c, lastVisit: new Date(updatedAppointment!.date) };
            return updatedCustomer;
          }
          return c;
        }));
      }

      if (updatedAppointment) {
        persistCloudMutation('עדכון תור בענן נכשל', () =>
          adminMutate({ action: 'upsert_appointment', appointment: mapAppointmentToDb(updatedAppointment) })
        );
      }

      if (updatedCustomer) {
        persistCloudMutation('עדכון לקוח בענן נכשל', () =>
          adminMutate({ action: 'upsert_customer', customer: mapCustomerToDb(updatedCustomer) })
        );
      }
  };

  const handleEditCustomer = (customer: Customer) => {
    setPrefillCustomerPhone('');
    setEditingCustomer(customer);
    setIsCustomerModalOpen(true);
  };

  const handleAddCustomer = (phone?: string) => {
    setEditingCustomer(null);
    setPrefillCustomerPhone(phone ? normalizePhoneForCompare(phone) : '');
    setIsCustomerModalOpen(true);
  };

  const handleUpdateCustomerNotes = (customerId: string, notes: string) => {
    if (!ensureCloudWritable()) return;
    let updatedCustomer: Customer | null = null;
    setCustomers(prev => prev.map(c => {
      if (c.id !== customerId) return c;
      updatedCustomer = { ...c, notes: notes || undefined };
      return updatedCustomer;
    }));

    if (updatedCustomer) {
      persistCloudMutation('עדכון הערות לקוח בענן נכשל', () =>
        adminMutate({ action: 'upsert_customer', customer: mapCustomerToDb(updatedCustomer) })
      );
    }
  };

  const handleSaveCustomer = (updatedCustomer: Customer) => {
    if (!ensureCloudWritable()) return;
    setPrefillCustomerPhone('');
    setCustomers(prev => {
      const exists = prev.find(c => c.id === updatedCustomer.id);
      if (exists) {
        return prev.map(c => c.id === updatedCustomer.id ? updatedCustomer : c);
      }
      return [...prev, updatedCustomer];
    });
    setIsCustomerModalOpen(false);

    persistCloudMutation('שמירת לקוח בענן נכשלה', () =>
      adminMutate({ action: 'upsert_customer', customer: mapCustomerToDb(updatedCustomer) })
    );
  };

  const handleDeleteCustomer = (customerId: string) => {
    if (!ensureCloudWritable()) return;
    setPrefillCustomerPhone('');
    setCustomers(prev => prev.filter(c => c.id !== customerId));
    setAppointments(prev => prev.filter(a => a.customerId !== customerId));
    setIsCustomerModalOpen(false);
    setEditingCustomer(null);
    setAskedAppointmentIds(prev => {
      const next = new Set(prev);
      appointments
        .filter(a => a.customerId === customerId)
        .forEach(a => next.delete(a.id));
      return next;
    });

    persistCloudMutation('מחיקת תורים בענן נכשלה', () =>
      adminMutate({ action: 'delete_customer', customerId })
    );

  };

  const handleOpenDog = (dogId: string) => {
    setSelectedDogId(dogId);
  };

  const handleAddDogForCustomer = (customerId: string) => {
    setSelectedDogId(null);
    setNewDogForCustomerId(customerId);
  };

  const handleSaveDog = (updatedDog: Dog) => {
    if (!ensureCloudWritable()) return;
    setDogs(prev => {
      const exists = prev.find(d => d.id === updatedDog.id);
      if (exists) {
        return prev.map(d => d.id === updatedDog.id ? updatedDog : d);
      }
      return [...prev, updatedDog];
    });
    setNewDogForCustomerId(null);
    setSelectedDogId(updatedDog.id);

    persistCloudMutation('שמירת כרטיס הכלב בענן נכשלה', () =>
      adminMutate({ action: 'upsert_dog', dog: mapDogToDb(updatedDog) })
    );
  };

  const handleDeleteDog = (dogId: string) => {
    if (!ensureCloudWritable()) return;
    setDogs(prev => prev.filter(d => d.id !== dogId));
    setAppointments(prev => prev.filter(a => a.dogId !== dogId));
    setSelectedDogId(null);

    persistCloudMutation('מחיקת כרטיס הכלב בענן נכשלה', () =>
      adminMutate({ action: 'delete_dog', dogId })
    );
  };

  const handleOpenGroomingRecord = (appointmentId: string) => {
    setGroomingRecordAppointmentId(appointmentId);
  };

  const handleOpenWhatsAppForCustomer = (customerId: string) => {
    setWhatsAppTarget({ customerId });
  };

  const handleOpenWhatsAppForDog = (customerId: string, dogId: string) => {
    setWhatsAppTarget({ customerId, dogId });
  };

  const handleSaveGroomingRecord = (record: GroomingRecord) => {
    if (!ensureCloudWritable()) return;
    setGroomingRecords(prev => {
      const exists = prev.find(r => r.id === record.id);
      if (exists) {
        return prev.map(r => r.id === record.id ? record : r);
      }
      return [...prev, record];
    });
    setGroomingRecordAppointmentId(null);

    persistCloudMutation('שמירת פרטי התספורת בענן נכשלה', () =>
      adminMutate({ action: 'upsert_grooming_record', record: mapGroomingRecordToDb(record) })
    );
  };

  const handleDeleteGroomingRecord = (recordId: string) => {
    if (!ensureCloudWritable()) return;
    setGroomingRecords(prev => prev.filter(r => r.id !== recordId));
    setGroomingRecordAppointmentId(null);

    persistCloudMutation('מחיקת פרטי התספורת בענן נכשלה', () =>
      adminMutate({ action: 'delete_grooming_record', recordId })
    );
  };

  const handleSaveAppointment = (savedAppointment: Appointment) => {
    if (!ensureCloudWritable()) return;
    const existingAppointment = appointments.find(a => a.id === savedAppointment.id);
    let normalizedAppointment: Appointment = { ...savedAppointment };

    if (normalizedAppointment.status === AppointmentStatus.CANCELLED) {
      if (!existingAppointment || existingAppointment.status !== AppointmentStatus.CANCELLED) {
        const hoursDiff =
          (normalizedAppointment.date.getTime() - Date.now()) / (1000 * 60 * 60);
        const fee =
          hoursDiff >= 0 && hoursDiff <= CANCELLATION_FEE_WINDOW_HOURS
            ? CANCELLATION_FEE_AMOUNT
            : 0;
        normalizedAppointment = { ...normalizedAppointment, cancellationFee: fee };
      } else {
        normalizedAppointment = {
          ...normalizedAppointment,
          cancellationFee: existingAppointment.cancellationFee ?? normalizedAppointment.cancellationFee
        };
      }
    } else if (existingAppointment?.status === AppointmentStatus.CANCELLED && existingAppointment.cancellationFee) {
      normalizedAppointment = { ...normalizedAppointment, cancellationFee: 0 };
    }

    // Appointments target a specific dog; default to the customer's (first/only) dog
    // when one wasn't explicitly chosen, since booking UI doesn't offer a dog picker yet.
    if (!normalizedAppointment.dogId) {
      const defaultDog = dogs.find(d => d.customerId === normalizedAppointment.customerId);
      if (defaultDog) {
        normalizedAppointment = { ...normalizedAppointment, dogId: defaultDog.id };
      }
    }

    setAppointments(prev => {
      const exists = prev.find(a => a.id === normalizedAppointment.id);
      if (exists) {
        return prev.map(a => a.id === normalizedAppointment.id ? normalizedAppointment : a);
      }
      return [...prev, normalizedAppointment];
    });

    if (normalizedAppointment.status === AppointmentStatus.COMPLETED && normalizedAppointment.dogId) {
      const dogIdForVisit = normalizedAppointment.dogId;
      const appointmentDate = new Date(normalizedAppointment.date);
      setDogs(prev => prev.map(d => {
        if (d.id !== dogIdForVisit) return d;
        if (appointmentDate <= new Date(d.lastVisit)) return d;
        const updatedDog = { ...d, lastVisit: appointmentDate };
        persistCloudMutation('עדכון כרטיס הכלב בענן נכשל', () =>
          adminMutate({ action: 'upsert_dog', dog: mapDogToDb(updatedDog) })
        );
        return updatedDog;
      }));
    }

    let updatedCustomer: Customer | null = null;
    const existingCustomer = customers.find(c => c.id === normalizedAppointment.customerId);
    if (existingCustomer) {
      let nextCustomer = existingCustomer;
      let customerChanged = false;

      if (
        existingCustomer.lifecycleStatus === 'ON_HOLD' &&
        normalizedAppointment.status !== AppointmentStatus.CANCELLED
      ) {
        nextCustomer = { ...nextCustomer, lifecycleStatus: 'ACTIVE' };
        customerChanged = true;
      }

      if (normalizedAppointment.status === AppointmentStatus.COMPLETED) {
        const newDate = new Date(normalizedAppointment.date);
        const currentLastVisit = new Date(existingCustomer.lastVisit);
        if (newDate > currentLastVisit) {
          nextCustomer = { ...nextCustomer, lastVisit: newDate };
          customerChanged = true;
        }
      }

      updatedCustomer = customerChanged ? nextCustomer : null;
      if (updatedCustomer) {
        setCustomers(prev => prev.map(c => (c.id === updatedCustomer!.id ? updatedCustomer! : c)));
      }
    }

    setIsAppointmentModalOpen(false);
    setEditingAppointment(null);

    persistCloudMutation('שמירת תור בענן נכשלה', () =>
      adminMutate({ action: 'upsert_appointment', appointment: mapAppointmentToDb(normalizedAppointment) })
    );

    if (updatedCustomer) {
      persistCloudMutation('עדכון לקוח בענן נכשל', () =>
        adminMutate({ action: 'upsert_customer', customer: mapCustomerToDb(updatedCustomer) })
      );
    }
  };

  const handleDeleteAppointment = (appointmentId: string) => {
    if (!ensureCloudWritable()) return;
    setAppointments(prev => prev.filter(a => a.id !== appointmentId));
    setIsAppointmentModalOpen(false);
    setEditingAppointment(null);
    setAskedAppointmentIds(prev => {
      const next = new Set(prev);
      next.delete(appointmentId);
      return next;
    });
    if (pendingCheck?.appointment.id === appointmentId) {
      setPendingCheck(null);
    }

    persistCloudMutation('מחיקת תור בענן נכשלה', () =>
      adminMutate({ action: 'delete_appointment', appointmentId })
    );
  };

  const handleSaveCalendarEvent = (savedEvent: CalendarEvent) => {
    if (!ensureCloudWritable()) return;

    setCalendarEvents(prev =>
      sortCalendarEventsByDate([
        ...prev.filter((event) => event.id !== savedEvent.id),
        savedEvent
      ])
    );
    setIsCalendarEventModalOpen(false);
    setEditingCalendarEvent(null);

    persistCloudMutation(
      'שמירת אירוע בענן נכשלה',
      () => adminMutate({ action: 'upsert_calendar_event', event: mapCalendarEventToDb(savedEvent) }),
      true
    );
  };

  const handleDeleteCalendarEvent = (eventId: string) => {
    if (!ensureCloudWritable()) return;

    setCalendarEvents(prev => prev.filter(event => event.id !== eventId));
    setIsCalendarEventModalOpen(false);
    setEditingCalendarEvent(null);

    persistCloudMutation(
      'מחיקת אירוע בענן נכשלה',
      () => adminMutate({ action: 'delete_calendar_event', eventId }),
      true
    );
  };

  const handleAddTask = (title: string, startDate: Date) => {
    if (!ensureCloudWritable()) return;
    const newTask: Task = {
      id: crypto.randomUUID(),
      title,
      status: 'OPEN',
      createdAt: new Date(),
      startDate
    };
    setTasks(prev => [newTask, ...prev]);
    setTaskSyncing(newTask.id, true);

    void Promise.resolve(
      adminMutate({ action: 'insert_task', task: mapTaskToDb(newTask) })
    )
      .then((payload) => {
        const taskRow = payload && typeof payload === 'object' ? (payload as { task?: unknown }).task : undefined;
        if (!taskRow) {
          throw new Error('Task insert returned no row');
        }

        setTasks(prev => prev.map(task => (task.id === newTask.id ? mapTaskFromDb(taskRow as DbTask) : task)));
        markCloudMutationSuccess(true);
      })
      .catch((error) => {
        setTasks(prev => prev.filter(task => task.id !== newTask.id));
        reportCloudMutationError('\u05D9\u05E6\u05D9\u05E8\u05EA \u05DE\u05E9\u05D9\u05DE\u05D4 \u05D1\u05E2\u05E0\u05DF \u05E0\u05DB\u05E9\u05DC\u05D4', error);
      })
      .finally(() => {
        setTaskSyncing(newTask.id, false);
      });
  };

  const handleToggleTask = (taskId: string) => {
    if (!ensureCloudWritable()) return;
    if (syncingTaskIds.has(taskId)) return;
    const currentTask = tasks.find(t => t.id === taskId);
    if (!currentTask) return;

    const updatedTask: Task = {
      ...currentTask,
      status: currentTask.status === 'OPEN' ? 'DONE' : 'OPEN'
    };

    setTasks(prev => prev.map(t => (t.id === taskId ? updatedTask : t)));
    setTaskSyncing(taskId, true);

    void Promise.resolve(
      adminMutate({ action: 'update_task_status', taskId: updatedTask.id, status: updatedTask.status })
    )
      .then((payload) => {
        const taskRow = payload && typeof payload === 'object' ? (payload as { task?: unknown }).task : undefined;
        if (!taskRow) {
          throw new Error('Task update returned no row');
        }

        setTasks(prev => prev.map(task => (task.id === taskId ? mapTaskFromDb(taskRow as DbTask) : task)));
        markCloudMutationSuccess(true);
      })
      .catch((error) => {
        setTasks(prev => prev.map(task => (task.id === taskId ? currentTask : task)));
        reportCloudMutationError('\u05E2\u05D3\u05DB\u05D5\u05DF \u05DE\u05E9\u05D9\u05DE\u05D4 \u05D1\u05E2\u05E0\u05DF \u05E0\u05DB\u05E9\u05DC', error);
      })
      .finally(() => {
        setTaskSyncing(taskId, false);
      });
  };

  const handleDeleteTask = (taskId: string) => {
    if (!ensureCloudWritable()) return;
    if (syncingTaskIds.has(taskId)) return;
    const deletedTask = tasks.find(task => task.id === taskId);
    const deletedTaskIndex = tasks.findIndex(task => task.id === taskId);
    if (!deletedTask) return;

    setTasks(prev => prev.filter(t => t.id !== taskId));
    setTaskSyncing(taskId, true);

    void Promise.resolve(
      adminMutate({ action: 'delete_task', taskId })
    )
      .then(() => {
        markCloudMutationSuccess(true);
      })
      .catch((error) => {
        setTasks(prev => {
          if (prev.some(task => task.id === taskId)) {
            return prev;
          }

          const next = [...prev];
          const insertAt = deletedTaskIndex >= 0 ? Math.min(deletedTaskIndex, next.length) : next.length;
          next.splice(insertAt, 0, deletedTask);
          return next;
        });
        reportCloudMutationError('\u05DE\u05D7\u05D9\u05E7\u05EA \u05DE\u05E9\u05D9\u05DE\u05D4 \u05D1\u05E2\u05E0\u05DF \u05E0\u05DB\u05E9\u05DC\u05D4', error);
      })
      .finally(() => {
        setTaskSyncing(taskId, false);
      });
  };

  const saveBusinessSchedule = useCallback(
    async (payload: { weeklySlots: Record<string, string[]>; maxBookingDaysAhead: number }) => {
      if (!adminSessionToken || isBrowserOffline()) {
        throw new Error('אין חיבור אינטרנט כרגע.');
      }

      localMutationSuppressUntilRef.current = Date.now() + 1500;
      setCloudStatus('syncing');

      await adminMutate({
        action: 'set_business_schedule',
        weeklySlots: payload.weeklySlots,
        maxBookingDaysAhead: payload.maxBookingDaysAhead
      });

      await loadDataFromCloud('manual');
    },
    [adminMutate, adminSessionToken, loadDataFromCloud]
  );

  if (!adminSessionToken) {
    return (
      <div className="min-h-[100dvh] w-full bg-gradient-to-br from-pink-100 via-pink-50 to-rose-100 text-gray-800 font-sans">
        {loadError && (
          <div className="mx-auto max-w-md pt-10 px-4">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 text-amber-900 text-sm px-4 py-3 shadow-sm text-center">
              {loadError}
            </div>
          </div>
        )}

        <AdminLogin
          onAuthenticated={({ phone, sessionToken }) => {
            setAdminPhone(phone);
            setAdminSessionToken(sessionToken);
            setLoadError(null);
            setCloudStatus('connecting');
            try {
              localStorage.setItem('pawlished_admin_phone', phone);
              localStorage.setItem('pawlished_admin_session', sessionToken);
            } catch {
              // ignore storage errors
            }
          }}
        />
      </div>
    );
  }

  const cloudStatusBadge = (
    <button
      type="button"
      onClick={() => {
        if (cloudStatus === 'error' || cloudStatus === 'offline') {
          void loadDataFromCloud();
        }
      }}
      className={`fixed right-24 bottom-[4.75rem] sm:right-4 md:right-3 md:bottom-auto md:top-3 z-[210] border text-xs px-3 py-1.5 rounded-full shadow-sm backdrop-blur ${CLOUD_STATUS_UI[cloudStatus].className}`}
      title={
        cloudStatus === 'error' || cloudStatus === 'offline'
          ? 'לחץ לניסיון חיבור מחדש'
          : lastCloudSyncAt
            ? `עודכן לאחרונה: ${lastCloudSyncAt.toLocaleTimeString('he-IL')}`
            : undefined
      }
    >
      {CLOUD_STATUS_UI[cloudStatus].label}
      {lastCloudSyncAt && cloudStatus === 'online' ? ` • ${lastCloudSyncAt.toLocaleTimeString('he-IL')}` : ''}
    </button>
  );

  return (
    <div className="flex h-[100dvh] min-h-[100dvh] w-full bg-gradient-to-br from-pink-100 via-pink-50 to-rose-100 text-gray-800 font-sans overflow-hidden flex-col md:flex-row">
      {cloudStatusBadge}
      {loadError && (
        <div className="fixed left-3 right-3 bottom-[8.75rem] md:left-1/2 md:right-auto md:bottom-auto md:top-3 md:-translate-x-1/2 z-[200] bg-amber-50 text-amber-900 border border-amber-200 text-xs px-3 py-1.5 rounded-full shadow-sm text-center">
          {loadError}
        </div>
      )}
      
      {/* Navigation */}
      <Sidebar 
        currentView={currentView} 
        onChangeView={setCurrentView} 
        onQuickAdd={() => {
            setSelectedDateForAppointment(new Date());
            setPreSelectedCustomerId(undefined);
            setEditingAppointment(null);
            setIsAppointmentModalOpen(true);
        }}
        onQuickAddEvent={() => openCalendarEventModal(dayPanelDate || new Date())}
        onOpenTheme={() => setIsThemePanelOpen(true)}
        onOpenSearch={() => setIsSmartSearchOpen(true)}
      />

      {/* Center Content */}
      <main className="flex-1 min-w-0 min-h-0 flex flex-col relative h-full overflow-hidden pb-16 md:pb-0">
        {currentView === 'HOME' ? (
          <HomeDashboard
            appointments={appointments}
            dogs={dogs}
            customers={customers}
            tasks={tasks}
            onOpenDog={handleOpenDog}
          />
        ) : currentView === 'CALENDAR' ? (
          <Calendar
            currentDate={currentDate}
            summaryReferenceDate={dayPanelDate ?? currentDate}
            onDateChange={setCurrentDate}
            onOpenMessages={() => setCurrentView('MESSAGES')}
            appointments={appointments}
            calendarEvents={calendarEvents}
            customers={customers}
            onCustomerClick={handleEditCustomer}
            onDayClick={handleDaySelect}
            onDayAddAppointment={handleDayClick}
            onCalendarEventClick={handleCalendarEventClick}
            onAppointmentClick={handleAppointmentClick}
            onAppointmentMove={handleMoveAppointment}
          />
        ) : currentView === 'CUSTOMERS' ? (
          <CustomersView
            customers={customers}
            dogs={dogs}
            appointments={appointments}
            onEditCustomer={handleEditCustomer}
            onAddCustomer={handleAddCustomer}
            onOpenDog={handleOpenDog}
          />
        ) : currentView === 'MESSAGES' ? (
        <MessagesView
          messages={whatsappMessages}
          customers={customers}
          isTableMissing={whatsappMessagesTableMissing}
          onRefresh={() => void loadDataFromCloud('manual')}
          onAddCustomer={(phone) => handleAddCustomer(phone)}
          onOpenCustomer={handleEditCustomer}
          onSendMessage={handleSendWhatsAppMessage}
        />
      ) : currentView === 'SETTINGS' ? (
        <ScheduleSettingsView
          weeklySlots={businessSchedule.weeklySlots}
          maxBookingDaysAhead={businessSchedule.maxBookingDaysAhead}
          onSave={saveBusinessSchedule}
        />
      ) : (
        <StatsView
          customers={customers}
            dogs={dogs}
            appointments={appointments}
            tasks={tasks}
            syncingTaskIds={syncingTaskIds}
            onOpenCalendar={() => setCurrentView('CALENDAR')}
            onOpenCustomers={() => setCurrentView('CUSTOMERS')}
            onOpenMessages={() => setCurrentView('MESSAGES')}
            onOpenSettings={() => setCurrentView('SETTINGS')}
            onAddTask={handleAddTask}
            onToggleTask={handleToggleTask}
            onDeleteTask={handleDeleteTask}
          />
        )}
      </main>

      {/* Notifications Panel - Only visible on Large screens to avoid squashing the calendar */}
      {currentView === 'CALENDAR' && (
        <NotificationsPanel 
          appointments={appointments} 
          customers={customers} 
          onAppointmentCreate={handleSaveAppointment}
          onCreateNewCustomer={handleAddCustomer}
          onCustomerClick={handleEditCustomer}
          onAppointmentUpdate={handleSaveAppointment}
        />
      )}

      {currentView === 'CALENDAR' && dayPanelDate && (
        <div className="fixed right-0 top-0 h-full w-full sm:w-96 bg-white border-l border-gray-200 shadow-2xl z-[160] flex flex-col">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
            <div>
              <div className="text-xs text-gray-400">יומן ליום</div>
              <div className="text-lg font-bold text-gray-800">
                {dayPanelDate.toLocaleDateString('he-IL')}
              </div>
            </div>
            <button
              onClick={() => setDayPanelDate(null)}
              className="p-2 hover:bg-gray-200 rounded-full text-gray-500 transition-colors"
              aria-label="סגור"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {calendarEvents
              .filter(event => {
                const d = new Date(event.date);
                d.setHours(0, 0, 0, 0);
                const target = new Date(dayPanelDate);
                target.setHours(0, 0, 0, 0);
                return d.getTime() === target.getTime() && event.showInCalendar;
              })
              .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
              .map(event => (
                <button
                  type="button"
                  key={event.id}
                  onClick={() => handleCalendarEventClick(event)}
                  className="w-full text-right p-3 rounded-2xl border border-orange-200 bg-gradient-to-l from-orange-50 to-amber-50 shadow-sm hover:brightness-95 transition cursor-pointer"
                  aria-label={`עריכת אירוע: ${event.title}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-orange-900">{event.title}</span>
                    <span className="text-xs text-orange-700">
                      {new Date(event.date).toLocaleTimeString('he-IL', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                  <div className="text-xs text-orange-700 mt-1">אירוע אישי</div>
                </button>
              ))}
            {appointments
              .filter(a => {
                const d = new Date(a.date);
                d.setHours(0, 0, 0, 0);
                const target = new Date(dayPanelDate);
                target.setHours(0, 0, 0, 0);
                return d.getTime() === target.getTime() && a.status !== AppointmentStatus.CANCELLED;
              })
              .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
              .map(a => {
                const customer = customers.find(c => c.id === a.customerId);
                return (
                  <button
                    key={a.id}
                    onClick={() => handleAppointmentClick(a)}
                    className="w-full text-right p-3 rounded-xl border border-gray-100 bg-white hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-gray-800">
                        {customer ? customer.name : 'לקוח'}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(a.date).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {a.service && (
                      <div className="text-xs text-gray-500 mt-1 truncate">{a.service}</div>
                    )}
                  </button>
                );
              })}
            {appointments.filter(a => {
              const d = new Date(a.date);
              d.setHours(0, 0, 0, 0);
              const target = new Date(dayPanelDate);
              target.setHours(0, 0, 0, 0);
              return d.getTime() === target.getTime() && a.status !== AppointmentStatus.CANCELLED;
            }).length === 0 && calendarEvents.filter(event => {
              const d = new Date(event.date);
              d.setHours(0, 0, 0, 0);
              const target = new Date(dayPanelDate);
              target.setHours(0, 0, 0, 0);
              return d.getTime() === target.getTime() && event.showInCalendar;
            }).length === 0 && (
              <div className="text-sm text-gray-400 text-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                אין תורים או אירועים ליום הזה
              </div>
            )}
          </div>
        </div>
      )}

      {/* Customer Modal */}
      <CustomerModal
        isOpen={isCustomerModalOpen}
        customer={editingCustomer}
        dogs={editingCustomer ? dogs.filter(d => d.customerId === editingCustomer.id) : []}
        prefillPhone={prefillCustomerPhone}
        onClose={() => {
          setIsCustomerModalOpen(false);
          setPrefillCustomerPhone('');
        }}
        onSave={handleSaveCustomer}
        onDelete={handleDeleteCustomer}
        onOpenDog={handleOpenDog}
        onAddDog={handleAddDogForCustomer}
        onOpenWhatsApp={handleOpenWhatsAppForCustomer}
      />

      {/* Dog Card Modal */}
      <DogCardModal
        isOpen={Boolean(selectedDogId) || Boolean(newDogForCustomerId)}
        dog={selectedDogId ? dogs.find(d => d.id === selectedDogId) || null : null}
        customerId={newDogForCustomerId || dogs.find(d => d.id === selectedDogId)?.customerId || ''}
        customer={customers.find(c => c.id === (newDogForCustomerId || dogs.find(d => d.id === selectedDogId)?.customerId)) || null}
        appointments={appointments}
        groomingRecords={groomingRecords}
        onClose={() => {
          setSelectedDogId(null);
          setNewDogForCustomerId(null);
        }}
        onSave={handleSaveDog}
        onDelete={handleDeleteDog}
        onOpenGroomingRecord={handleOpenGroomingRecord}
        onOpenWhatsApp={handleOpenWhatsAppForDog}
      />

      {/* Grooming Record Modal */}
      <GroomingRecordModal
        isOpen={Boolean(groomingRecordAppointmentId)}
        appointment={appointments.find(a => a.id === groomingRecordAppointmentId) || null}
        dog={dogs.find(d => d.id === appointments.find(a => a.id === groomingRecordAppointmentId)?.dogId) || null}
        record={groomingRecords.find(r => r.appointmentId === groomingRecordAppointmentId) || null}
        groomingRecords={groomingRecords}
        onClose={() => setGroomingRecordAppointmentId(null)}
        onSave={handleSaveGroomingRecord}
        onDelete={handleDeleteGroomingRecord}
      />

      {/* WhatsApp Quick Send Modal */}
      <WhatsAppQuickSendModal
        isOpen={Boolean(whatsAppTarget)}
        customer={customers.find(c => c.id === whatsAppTarget?.customerId) || null}
        dog={whatsAppTarget?.dogId ? dogs.find(d => d.id === whatsAppTarget.dogId) || null : null}
        nextAppointment={
          appointments
            .filter(a =>
              a.status !== AppointmentStatus.CANCELLED &&
              new Date(a.date).getTime() >= Date.now() &&
              (whatsAppTarget?.dogId ? a.dogId === whatsAppTarget.dogId : a.customerId === whatsAppTarget?.customerId)
            )
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0] || null
        }
        onClose={() => setWhatsAppTarget(null)}
        onSend={handleSendWhatsAppMessage}
      />

      {/* Smart Search Modal */}
      <SmartSearchModal
        isOpen={isSmartSearchOpen}
        dogs={dogs}
        customers={customers}
        appointments={appointments}
        onClose={() => setIsSmartSearchOpen(false)}
        onOpenDog={handleOpenDog}
      />

      {/* Appointment Modal */}
      <AppointmentModal
        isOpen={isAppointmentModalOpen}
        onClose={() => {
            setIsAppointmentModalOpen(false);
            setEditingAppointment(null);
        }}
        onSave={handleSaveAppointment}
        onUpdateCustomerNotes={handleUpdateCustomerNotes}
        onDelete={handleDeleteAppointment}
        initialDate={selectedDateForAppointment}
        customers={customers}
        dogs={dogs}
        appointments={appointments}
        preSelectedCustomerId={preSelectedCustomerId}
        onCreateNewCustomer={handleAddCustomer}
        appointment={editingAppointment}
      />

      <CalendarEventModal
        isOpen={isCalendarEventModalOpen}
        initialDate={selectedDateForEvent}
        calendarEvent={editingCalendarEvent}
        onClose={() => {
          setIsCalendarEventModalOpen(false);
          setEditingCalendarEvent(null);
        }}
        onSave={handleSaveCalendarEvent}
        onDelete={handleDeleteCalendarEvent}
      />

      <ThemePanel
        isOpen={isThemePanelOpen}
        onClose={() => setIsThemePanelOpen(false)}
      />

      <button
        onClick={() => setIsThemePanelOpen(true)}
        className="md:hidden fixed bottom-20 left-4 z-50 bg-white border border-gray-200 text-gray-700 p-3 rounded-full shadow-lg active:scale-90 transition-transform flex items-center justify-center"
        aria-label="עיצוב"
      >
        <Palette className="w-6 h-6 text-blue-600" />
      </button>

      {pendingCheck && (
        <div className="fixed inset-0 z-[150] bg-pink-500/20 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-5 border-b border-gray-100 bg-gray-50">
              <h3 className="text-lg font-bold text-gray-800">הלקוח הגיע?</h3>
              <p className="text-sm text-gray-500 mt-1">
                {pendingCheck.customer.name} - {pendingCheck.customer.petName} -{' '}
                {new Date(pendingCheck.appointment.date).toLocaleTimeString('he-IL', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </p>
            </div>
            <div className="p-5 flex flex-col gap-3">
              <button
                onClick={() => {
                  const updated = { ...pendingCheck.appointment, status: AppointmentStatus.COMPLETED };
                  handleSaveAppointment(updated);
                  setAskedAppointmentIds(prev => new Set(prev).add(pendingCheck.appointment.id));
                  setPendingCheck(null);
                }}
                className="w-full py-2.5 rounded-xl bg-green-600 text-white font-medium hover:bg-green-700 transition-colors"
              >
                הגיע
              </button>
              <button
                onClick={() => {
                  const updated = { ...pendingCheck.appointment, status: AppointmentStatus.CANCELLED };
                  handleSaveAppointment(updated);
                  setAskedAppointmentIds(prev => new Set(prev).add(pendingCheck.appointment.id));
                  setPendingCheck(null);
                }}
                className="w-full py-2.5 rounded-xl bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 transition-colors"
              >
                לא הגיע
              </button>
              <button
                onClick={() => {
                  const updated = { ...pendingCheck.appointment, status: AppointmentStatus.LATE };
                  handleSaveAppointment(updated);
                  setAskedAppointmentIds(prev => new Set(prev).add(pendingCheck.appointment.id));
                  setPendingCheck(null);
                }}
                className="w-full py-2.5 rounded-xl bg-orange-500 text-white font-medium hover:bg-orange-600 transition-colors"
              >
                מאחר
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
