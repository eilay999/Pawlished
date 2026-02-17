import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Palette, X } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { NotificationsPanel } from './components/NotificationsPanel';
import { Calendar } from './components/Calendar';
import { CustomersView } from './components/CustomersView';
import { CustomerModal } from './components/CustomerModal';
import { AppointmentModal } from './components/AppointmentModal';
import { StatsView } from './components/StatsView';
import { PublicBooking } from './components/PublicBooking';
import { ThemePanel } from './components/ThemePanel';
import { ViewType, Appointment, Customer, AppointmentStatus, Task, TaskStatus } from './types';
import { CANCELLATION_FEE_AMOUNT, CANCELLATION_FEE_WINDOW_HOURS } from './constants';
import { supabase } from './services/supabaseClient';
import { applyTheme, loadTheme } from './theme';

type DbCustomer = {
  id: string;
  name: string;
  phone: string;
  pet_name: string;
  pet_type: string;
  last_visit: string;
  visit_frequency_weeks: number;
  default_price: number | null;
  notes?: string | null;
};

type DbAppointment = {
  id: string;
  customer_id: string;
  date: string;
  service: string;
  status: AppointmentStatus;
  notes: string | null;
  price: number;
  cancellation_fee?: number | null;
};

type DbTask = {
  id: string;
  title: string;
  status: TaskStatus;
  created_at: string;
  start_date: string | null;
};

const mapCustomerFromDb = (row: DbCustomer): Customer => ({
  id: row.id,
  name: row.name,
  phone: row.phone,
  petName: row.pet_name,
  petType: row.pet_type,
  lastVisit: new Date(row.last_visit),
  visitFrequencyWeeks: row.visit_frequency_weeks,
  defaultPrice: row.default_price ?? undefined,
  notes: row.notes ?? undefined,
});

const mapAppointmentFromDb = (row: DbAppointment): Appointment => ({
  id: row.id,
  customerId: row.customer_id,
  date: new Date(row.date),
  service: row.service,
  status: row.status,
  notes: row.notes ?? undefined,
  price: row.price,
  cancellationFee: row.cancellation_fee ?? undefined
});

const mapCustomerToDb = (customer: Customer): DbCustomer => ({
  id: customer.id,
  name: customer.name,
  phone: customer.phone,
  pet_name: customer.petName,
  pet_type: customer.petType,
  last_visit: customer.lastVisit.toISOString(),
  visit_frequency_weeks: customer.visitFrequencyWeeks,
  default_price: customer.defaultPrice ?? null,
  notes: customer.notes ?? null,
});

const mapAppointmentToDb = (appointment: Appointment): DbAppointment => ({
  id: appointment.id,
  customer_id: appointment.customerId,
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

const mapTaskToDb = (task: Task): DbTask => ({
  id: task.id,
  title: task.title,
  status: task.status,
  created_at: task.createdAt.toISOString(),
  start_date: task.startDate.toISOString(),
});

const isMissingTableError = (message?: string) => {
  if (!message) return false;
  return message.includes('relation "tasks" does not exist');
};

const sortById = <T extends { id: string }>(list: T[]): T[] =>
  [...list].sort((a, b) => a.id.localeCompare(b.id));

const customersSignature = (list: Customer[]) =>
  JSON.stringify(
    sortById(list).map(c => ({
      ...c,
      lastVisit: c.lastVisit.toISOString(),
      defaultPrice: c.defaultPrice ?? null,
      notes: c.notes ?? null
    }))
  );

const appointmentsSignature = (list: Appointment[]) =>
  JSON.stringify(
    sortById(list).map(a => ({
      ...a,
      date: a.date.toISOString(),
      notes: a.notes ?? null,
      cancellationFee: a.cancellationFee ?? null
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

const formatSupabaseError = (
  fallback: string,
  error?: { message?: string | null; code?: string | null } | null
) => {
  const details = error?.message ? error.message : '';
  return details ? `${fallback}: ${details}` : fallback;
};

type CloudSyncStatus = 'connecting' | 'online' | 'syncing' | 'offline' | 'error';

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

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewType>('CALENDAR');
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // Data State
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cloudStatus, setCloudStatus] = useState<CloudSyncStatus>(
    supabase ? 'connecting' : 'offline'
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
  
  // Appointment Modal State
  const [isAppointmentModalOpen, setIsAppointmentModalOpen] = useState(false);
  const [selectedDateForAppointment, setSelectedDateForAppointment] = useState<Date>(new Date());
  const [preSelectedCustomerId, setPreSelectedCustomerId] = useState<string | undefined>(undefined);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [dayPanelDate, setDayPanelDate] = useState<Date | null>(null);
  const [isThemePanelOpen, setIsThemePanelOpen] = useState(false);
  const [isAdminOverride, setIsAdminOverride] = useState(() => {
    try {
      return localStorage.getItem('pawlished_admin') === '1';
    } catch {
      return false;
    }
  });
  const localMutationSuppressUntilRef = useRef(0);
  const realtimeRefreshTimerRef = useRef<number | null>(null);
  const customersRef = useRef<Customer[]>([]);
  const appointmentsRef = useRef<Appointment[]>([]);
  const tasksRef = useRef<Task[]>([]);
  const { isPublicEntry, isForcedPublic } = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const path = window.location.pathname.toLowerCase();
    const hash = window.location.hash.toLowerCase();
    const forced = path.includes('booking');
    return {
      isForcedPublic: forced,
      isPublicEntry:
        forced ||
        params.get('booking') === '1' ||
        params.get('public') === '1' ||
        hash.includes('booking')
    };
  }, []);
  const isPublicBooking = isPublicEntry && (!isAdminOverride || isForcedPublic);

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
    appointmentsRef.current = appointments;
  }, [appointments]);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  const loadDataFromCloud = useCallback(
    async (source: 'initial' | 'manual' | 'realtime' = 'manual') => {
    if (source === 'realtime' && Date.now() < localMutationSuppressUntilRef.current) {
      return true;
    }

    if (!supabase) {
      setCloudStatus('offline');
      setLoadError('אין חיבור Supabase בפרויקט. היומן עובד בענן בלבד עד שתוגדר גישה תקינה.');
      return false;
    }

    const [customersRes, appointmentsRes, tasksRes] = await Promise.all([
      supabase.from('customers').select('*').order('id', { ascending: true }),
      supabase.from('appointments').select('*').order('date', { ascending: true }),
      supabase.from('tasks').select('*').order('created_at', { ascending: false })
    ]);

    const customersError = customersRes.error;
    const appointmentsError = appointmentsRes.error;
    const tasksError = tasksRes.error;

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
    const mappedAppointments = (appointmentsRes.data || []).map(mapAppointmentFromDb);
    const mappedTasks =
      tasksError && isMissingTableError(tasksError.message)
        ? []
        : (tasksRes.data || []).map(mapTaskFromDb);

    if (customersSignature(customersRef.current) !== customersSignature(mappedCustomers)) {
      setCustomers(mappedCustomers);
    }

    if (appointmentsSignature(appointmentsRef.current) !== appointmentsSignature(mappedAppointments)) {
      setAppointments(mappedAppointments);
    }

    if (tasksSignature(tasksRef.current) !== tasksSignature(mappedTasks)) {
      setTasks(mappedTasks);
    }

    if (tasksError && !isMissingTableError(tasksError.message)) {
      console.error('Supabase tasks load error', tasksError);
    }

    setCloudStatus('online');
    setLastCloudSyncAt(new Date());
    setLoadError(null);
    return true;
  }, []);

  useEffect(() => {
    setCloudStatus(supabase ? 'connecting' : 'offline');
    void loadDataFromCloud('initial');
  }, [loadDataFromCloud]);

  useEffect(() => {
    if (!supabase) return;

    const scheduleRefresh = () => {
      if (realtimeRefreshTimerRef.current) {
        window.clearTimeout(realtimeRefreshTimerRef.current);
      }
      const delay = Math.max(
        250,
        localMutationSuppressUntilRef.current > Date.now()
          ? localMutationSuppressUntilRef.current - Date.now() + 120
          : 250
      );
      realtimeRefreshTimerRef.current = window.setTimeout(() => {
        void loadDataFromCloud('realtime');
      }, delay);
    };

    const channel = supabase
      .channel('pawlished-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'customers' },
        scheduleRefresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments' },
        scheduleRefresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        scheduleRefresh
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setCloudStatus('error');
          setLoadError('Realtime בענן נותק. רענן דף אם הסנכרון נעצר.');
        }
      });

    return () => {
      if (realtimeRefreshTimerRef.current) {
        window.clearTimeout(realtimeRefreshTimerRef.current);
      }
      void supabase.removeChannel(channel);
    };
  }, [loadDataFromCloud]);

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

  const persistCloudMutation = (
    fallbackMessage: string,
    writer: () => Promise<{ error: { message?: string | null; code?: string | null } | null }>
  ) => {
    if (!supabase) return;
    void writer()
      .then(({ error }) => {
        if (error) {
          console.error('Supabase mutation error', error);
          setCloudStatus('error');
          setLoadError(formatSupabaseError(fallbackMessage, error));
          return;
        }

        setCloudStatus('online');
        setLastCloudSyncAt(new Date());
        setLoadError(null);
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Supabase mutation exception', error);
        setCloudStatus('error');
        setLoadError(`${fallbackMessage}: ${message}`);
      });
  };

  const ensureCloudWritable = () => {
    if (!supabase || cloudStatus === 'offline') {
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
    setDayPanelDate(date);
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
          supabase!.from('appointments').upsert(mapAppointmentToDb(updatedAppointment))
        );
      }

      if (updatedCustomer) {
        persistCloudMutation('עדכון לקוח בענן נכשל', () =>
          supabase!.from('customers').upsert(mapCustomerToDb(updatedCustomer))
        );
      }
  };

  const handleEditCustomer = (customer: Customer) => {
    setEditingCustomer(customer);
    setIsCustomerModalOpen(true);
  };

  const handleAddCustomer = () => {
    setEditingCustomer(null);
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
        supabase!.from('customers').upsert(mapCustomerToDb(updatedCustomer))
      );
    }
  };

  const handleSaveCustomer = (updatedCustomer: Customer) => {
    if (!ensureCloudWritable()) return;
    setCustomers(prev => {
      const exists = prev.find(c => c.id === updatedCustomer.id);
      if (exists) {
        return prev.map(c => c.id === updatedCustomer.id ? updatedCustomer : c);
      }
      return [...prev, updatedCustomer];
    });
    setIsCustomerModalOpen(false);

    persistCloudMutation('שמירת לקוח בענן נכשלה', () =>
      supabase!.from('customers').upsert(mapCustomerToDb(updatedCustomer))
    );
  };

  const handleDeleteCustomer = (customerId: string) => {
    if (!ensureCloudWritable()) return;
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
      supabase!.from('appointments').delete().eq('customer_id', customerId)
    );

    persistCloudMutation('מחיקת לקוח בענן נכשלה', () =>
      supabase!.from('customers').delete().eq('id', customerId)
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

    setAppointments(prev => {
      const exists = prev.find(a => a.id === normalizedAppointment.id);
      if (exists) {
        return prev.map(a => a.id === normalizedAppointment.id ? normalizedAppointment : a);
      }
      return [...prev, normalizedAppointment];
    });

    let updatedCustomer: Customer | null = null;
    if (normalizedAppointment.status === AppointmentStatus.COMPLETED) {
      const existingCustomer = customers.find(c => c.id === normalizedAppointment.customerId);
      if (existingCustomer) {
        const newDate = new Date(normalizedAppointment.date);
        const currentLastVisit = new Date(existingCustomer.lastVisit);
        if (newDate > currentLastVisit) {
          updatedCustomer = { ...existingCustomer, lastVisit: newDate };
        }
      }
      setCustomers(prev => prev.map(c => {
        if (updatedCustomer && c.id === updatedCustomer.id) {
          return updatedCustomer;
        }
        return c;
      }));
    }

    setIsAppointmentModalOpen(false);
    setEditingAppointment(null);

    persistCloudMutation('שמירת תור בענן נכשלה', () =>
      supabase!.from('appointments').upsert(mapAppointmentToDb(normalizedAppointment))
    );

    if (updatedCustomer) {
      persistCloudMutation('עדכון לקוח בענן נכשל', () =>
        supabase!.from('customers').upsert(mapCustomerToDb(updatedCustomer))
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
      supabase!.from('appointments').delete().eq('id', appointmentId)
    );
  };

  const handleAddTask = (title: string, startDate: Date) => {
    if (!ensureCloudWritable()) return;
    const newTask: Task = {
      id: Math.random().toString(36).substr(2, 9),
      title,
      status: 'OPEN',
      createdAt: new Date(),
      startDate
    };
    setTasks(prev => [newTask, ...prev]);

    persistCloudMutation('יצירת משימה בענן נכשלה', () =>
      supabase!.from('tasks').insert(mapTaskToDb(newTask))
    );
  };

  const handleToggleTask = (taskId: string) => {
    if (!ensureCloudWritable()) return;
    let updatedTask: Task | null = null;
    setTasks(prev => prev.map(t => {
      if (t.id === taskId) {
        updatedTask = { ...t, status: t.status === 'OPEN' ? 'DONE' : 'OPEN' };
        return updatedTask;
      }
      return t;
    }));

    if (updatedTask) {
      persistCloudMutation('עדכון משימה בענן נכשל', () =>
        supabase!.from('tasks').upsert(mapTaskToDb(updatedTask))
      );
    }
  };

  const handleDeleteTask = (taskId: string) => {
    if (!ensureCloudWritable()) return;
    setTasks(prev => prev.filter(t => t.id !== taskId));
    persistCloudMutation('מחיקת משימה בענן נכשלה', () =>
      supabase!.from('tasks').delete().eq('id', taskId)
    );
  };

  const handleAdminAccess = (phone: string) => {
    try {
      localStorage.setItem('pawlished_admin', '1');
      localStorage.setItem('pawlished_admin_phone', phone);
    } catch {
      // ignore storage errors
    }
    setIsAdminOverride(true);
    setCurrentView('CALENDAR');
  };

  const cloudStatusBadge = (
    <button
      type="button"
      onClick={() => {
        if (cloudStatus === 'error' || cloudStatus === 'offline') {
          void loadDataFromCloud();
        }
      }}
      className={`fixed top-3 right-3 z-[210] border text-xs px-3 py-1.5 rounded-full shadow-sm backdrop-blur ${CLOUD_STATUS_UI[cloudStatus].className}`}
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

  if (isPublicBooking) {
    return (
      <>
        {cloudStatusBadge}
        <PublicBooking
          appointments={appointments}
          customers={customers}
          onSaveCustomer={handleSaveCustomer}
          onSaveAppointment={handleSaveAppointment}
          onAdminAccess={handleAdminAccess}
        />
      </>
    );
  }

  return (
    <div className="flex h-screen w-full bg-gradient-to-br from-blue-50 via-white to-emerald-100/60 text-gray-800 font-sans overflow-hidden flex-col md:flex-row">
      {cloudStatusBadge}
      {loadError && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[200] bg-amber-50 text-amber-900 border border-amber-200 text-xs px-3 py-1.5 rounded-full shadow-sm">
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
        onOpenTheme={() => setIsThemePanelOpen(true)}
      />

      {/* Center Content */}
      <main className="flex-1 flex flex-col relative h-full overflow-hidden pb-16 md:pb-0">
        {currentView === 'CALENDAR' ? (
          <Calendar 
            currentDate={currentDate} 
            onDateChange={setCurrentDate} 
            appointments={appointments}
            customers={customers}
            onCustomerClick={handleEditCustomer}
            onDayClick={handleDaySelect}
            onDayAddAppointment={handleDayClick}
            onAppointmentClick={handleAppointmentClick}
            onAppointmentMove={handleMoveAppointment}
          />
        ) : currentView === 'CUSTOMERS' ? (
          <CustomersView 
            customers={customers}
            appointments={appointments}
            onEditCustomer={handleEditCustomer}
            onAddCustomer={handleAddCustomer}
          />
        ) : (
          <StatsView 
            customers={customers}
            appointments={appointments}
            tasks={tasks}
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
              <div className="text-xs text-gray-400">תורים ליום</div>
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
            }).length === 0 && (
              <div className="text-sm text-gray-400 text-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                אין תורים ליום הזה
              </div>
            )}
          </div>
        </div>
      )}

      {/* Customer Modal */}
      <CustomerModal 
        isOpen={isCustomerModalOpen}
        customer={editingCustomer}
        onClose={() => setIsCustomerModalOpen(false)}
        onSave={handleSaveCustomer}
        onDelete={handleDeleteCustomer}
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
        preSelectedCustomerId={preSelectedCustomerId}
        onCreateNewCustomer={handleAddCustomer}
        appointment={editingAppointment}
      />

      <ThemePanel
        isOpen={isThemePanelOpen}
        onClose={() => setIsThemePanelOpen(false)}
      />

      <button
        onClick={() => setIsThemePanelOpen(true)}
        className="md:hidden fixed bottom-20 right-4 z-50 bg-white border border-gray-200 text-gray-700 p-3 rounded-full shadow-lg active:scale-90 transition-transform flex items-center justify-center"
        aria-label="עיצוב"
      >
        <Palette className="w-6 h-6 text-blue-600" />
      </button>

      {pendingCheck && (
        <div className="fixed inset-0 z-[150] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
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
