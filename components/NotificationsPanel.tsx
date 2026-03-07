import React, { useState } from 'react';
import { AlertCircle, BellRing, ListChecks, Send, Sparkles, CalendarDays, CheckCircle2, Check, Hourglass } from 'lucide-react';
import { Appointment, Customer, AppointmentStatus } from '../types';
import { AppointmentModal } from './AppointmentModal';
import { analyzeCustomerStatus, CustomerAnalysis } from '../utils';

interface NotificationsPanelProps {
  appointments: Appointment[];
  customers: Customer[];
  onAppointmentCreate: (appointment: Appointment) => void;
  onCreateNewCustomer: () => void;
  onCustomerClick: (customer: Customer) => void;
  onAppointmentUpdate?: (appointment: Appointment) => void;
}

type AnalyzedCustomer = Customer & CustomerAnalysis;

export const NotificationsPanel: React.FC<NotificationsPanelProps> = ({
  customers,
  appointments,
  onAppointmentCreate,
  onCreateNewCustomer,
  onCustomerClick,
  onAppointmentUpdate,
}) => {
  const [selectedCustomerForAppt, setSelectedCustomerForAppt] = useState<{ customer: Customer; dueDate: Date } | null>(null);
  const [sendingBatch, setSendingBatch] = useState(false);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const analyzedCustomers: AnalyzedCustomer[] = customers.map(c => {
    const analysis = analyzeCustomerStatus(c, appointments);
    return { ...c, ...analysis };
  });

  const trackedCustomers = analyzedCustomers.filter(c => c.status !== 'ON_HOLD');

  const soonCustomers = trackedCustomers
    .filter(c => c.status === 'SOON')
    .sort((a, b) => a.daysDiff - b.daysDiff);

  const lateCustomers = trackedCustomers
    .filter(c => c.status === 'LATE')
    .sort((a, b) => a.daysDiff - b.daysDiff);

  const todaysAppointments = appointments
    .filter(a => {
      const d = new Date(a.date);
      d.setHours(0, 0, 0, 0);
      return d.getTime() === today.getTime() && a.status !== AppointmentStatus.CANCELLED;
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const sendReminder = (customer: AnalyzedCustomer) => {
    const isLate = customer.status === 'LATE';
    const days = Math.abs(customer.daysDiff);

    let message = '';
    if (isLate) {
      message = `שלום ${customer.name}, שמנו לב שהתור האחרון של ${customer.petName} התעכב. נשמח לקבוע תור חדש.`;
    } else {
      message = `שלום ${customer.name}, הגיע הזמן לקבוע תור ל-${customer.petName} (עברו ${days} ימים). נשמח לקבוע תור.`;
    }

    let phone = customer.phone.replace(/\D/g, '');
    if (phone.startsWith('0')) phone = '972' + phone.substring(1);

    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, 'whatsapp');
  };

  const handleRunAutomation = () => {
    setSendingBatch(true);
    setTimeout(() => setSendingBatch(false), 1500);
  };

  const markAsCompleted = (e: React.MouseEvent, app: Appointment) => {
    e.stopPropagation();
    if (onAppointmentUpdate) {
      onAppointmentUpdate({
        ...app,
        status: AppointmentStatus.COMPLETED,
      });
    }
  };

  // Hidden on md to prevent layout squashing
  return (
    <>
      <div className="w-80 bg-white h-screen flex flex-col border-r border-gray-200 shadow-sm hidden lg:flex font-sans shrink-0">
        {/* Header */}
        <div className="h-20 flex items-center justify-between px-6 border-b border-gray-100 bg-white shrink-0">
          <div className="flex items-center gap-3 text-gray-800 font-bold">
            <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
              <BellRing className="w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-base">התראות וניהול</span>
              <span className="text-xs text-gray-400 font-normal">תזכורות ועדכונים</span>
              <span className="text-[10px] text-gray-400 font-normal">יעדים: 12 לקוחות | 13-15 לקוחות | 15+ לקוחות</span>
            </div>
          </div>
        </div>

        {/* Automation Trigger */}
        <div className="px-5 pt-4 shrink-0">
          {lateCustomers.length > 0 || soonCustomers.length > 0 ? (
            <button
              onClick={handleRunAutomation}
              disabled={sendingBatch}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white text-sm py-2.5 rounded-xl shadow-md shadow-indigo-200 transition-all active:scale-95 disabled:opacity-70"
            >
              {sendingBatch ? (
                <>
                  <Sparkles className="w-4 h-4 animate-spin" />
                  שולח תזכורות...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  הפעל תזכורת אוטומטית
                </>
              )}
            </button>
          ) : (
            <div className="w-full flex items-center justify-center gap-2 bg-green-50 text-green-700 text-sm py-2.5 rounded-xl border border-green-100 font-medium">
              <CheckCircle2 className="w-4 h-4" />
              הכול מעודכן! אין מה לשלוח
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar bg-gray-50/30">
          {/* Section 1: Today's Schedule */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ListChecks className="w-5 h-5 text-green-600" />
                <h3 className="text-sm font-extrabold text-green-700">תורים להיום</h3>
              </div>
              <span className="text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded-full font-bold">{todaysAppointments.length}</span>
            </div>

            <div className="space-y-2">
              {todaysAppointments.length === 0 && (
                <div className="text-center py-6 bg-white rounded-xl border border-dashed border-gray-200">
                  <p className="text-xs text-gray-400">אין תורים להיום</p>
                </div>
              )}
              {todaysAppointments.map(app => {
                const customer = customers.find(c => c.id === app.customerId);
                const isCompleted = app.status === AppointmentStatus.COMPLETED;

                return (
                  <div
                    key={app.id}
                    onClick={() => customer && onCustomerClick(customer)}
                    className={`px-3 py-3 rounded-xl border shadow-sm flex items-center justify-between transition-all cursor-pointer group
                        ${isCompleted ? 'bg-gray-50 border-gray-100 opacity-70' : 'bg-emerald-50 border-emerald-200 hover:border-emerald-300 hover:shadow-md'}
                      `}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${isCompleted ? 'bg-gray-400' : 'bg-green-500'}`}></div>
                      <div>
                        <p className={`text-sm font-bold ${isCompleted ? 'text-gray-500 line-through' : 'text-gray-800'}`}>{customer?.name}</p>
                        <p className="text-xs text-gray-400">{customer?.petName} - {app.service}</p>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xs font-bold text-gray-800">
                        {app.date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {!isCompleted && onAppointmentUpdate && (
                        <button
                          onClick={e => markAsCompleted(e, app)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity bg-green-50 hover:bg-green-500 hover:text-white text-green-600 p-1 rounded-full"
                          title="סמן כהושלם"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 2: Soon */}
          <div>
            <div className="flex items-center justify-between mb-1 pt-4 border-t border-gray-200">
              <div className="flex items-center gap-2">
                <Hourglass className="w-4 h-4 text-orange-500" />
                <h3 className="text-sm font-bold text-gray-800">מתקרבים (שבוע קרוב)</h3>
              </div>
              {soonCustomers.length > 0 && <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-bold">{soonCustomers.length}</span>}
            </div>
            <p className="text-[10px] text-gray-400 mb-3 pr-6">לקוחות שצריכים תזכורת בשבוע הקרוב</p>

            <div className="space-y-3">
              {soonCustomers.length === 0 && <p className="text-xs text-gray-400 text-center py-2 bg-white rounded-xl border border-dashed border-gray-200">אין לקוחות שצריכים תזכורת בקרוב</p>}
              {soonCustomers.map(c => {
                const todayTime = new Date().setHours(0, 0, 0, 0);
                const lastTime = new Date(c.lastEffectiveVisit).setHours(0, 0, 0, 0);
                const daysSince = Math.floor((todayTime - lastTime) / (1000 * 3600 * 24));

                return (
                  <div
                    key={c.id}
                    onClick={() => onCustomerClick(c)}
                    className="p-3 rounded-xl border border-orange-200 bg-orange-50 shadow-sm hover:border-orange-300 transition-all group cursor-pointer hover:shadow-md relative"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-gray-800 group-hover:text-orange-600 transition-colors">{c.name}</span>
                        <span className="text-xs text-gray-400">עברו {daysSince} ימים (כל {c.visitFrequencyWeeks} שבועות)</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-orange-700 bg-orange-100/50 px-2 py-1 rounded-lg font-bold whitespace-nowrap block">
                          {c.daysDiff === 0 ? 'היום!' : `בעוד ${c.daysDiff} ימים`}
                        </span>
                      </div>
                    </div>
                    <div className="text-[10px] text-gray-500 mb-2 flex items-center gap-1">
                      <CalendarDays className="w-3 h-3" />
                      תאריך יעד: {c.dueDate.toLocaleDateString('he-IL')}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          setSelectedCustomerForAppt({ customer: c, dueDate: c.dueDate });
                        }}
                        className="flex-1 text-xs text-orange-600 bg-white hover:bg-orange-100 py-2 rounded-lg font-medium transition-colors border border-orange-100"
                      >
                        קבע תור
                      </button>
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          sendReminder(c);
                        }}
                        className="w-8 flex items-center justify-center bg-white text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors border border-orange-100"
                        title="שלח תזכורת בוואטסאפ"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 3: Late */}
          <div>
            <div className="flex items-center justify-between mb-1 pt-4 border-t border-gray-200">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-500" />
                <h3 className="text-sm font-bold text-gray-800">באיחור (עבר הזמן)</h3>
              </div>
              {lateCustomers.length > 0 && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">{lateCustomers.length}</span>}
            </div>
            <p className="text-[10px] text-gray-400 mb-3 pr-6">לקוחות שעברו את תאריך היעד</p>

            <div className="space-y-3">
              {lateCustomers.length === 0 && <p className="text-xs text-gray-400 text-center py-2 bg-white rounded-xl border border-dashed border-gray-200">אין לקוחות באיחור!</p>}
              {lateCustomers.map(c => (
                <div
                  key={c.id}
                  onClick={() => onCustomerClick(c)}
                  className="bg-white p-3 rounded-xl border border-red-100 shadow-sm hover:shadow-md transition-all relative overflow-hidden group cursor-pointer hover:border-red-300"
                >
                  <div className="absolute top-0 right-0 w-1 h-full bg-red-500 group-hover:w-1.5 transition-all"></div>
                  <div className="flex justify-between items-start pl-1 mb-2">
                    <div>
                      <p className="text-sm font-bold text-gray-800 group-hover:text-red-600 transition-colors">{c.name}</p>
                      <p className="text-xs text-gray-500">{c.petName}</p>
                    </div>
                    <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-1 rounded-lg whitespace-nowrap">
                      באיחור של {Math.abs(c.daysDiff)} ימים
                    </span>
                  </div>
                  <div className="flex gap-2 mt-1">
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setSelectedCustomerForAppt({ customer: c, dueDate: c.dueDate });
                      }}
                      className="flex-1 text-xs bg-red-50 text-red-700 py-2 rounded-lg hover:bg-red-600 hover:text-white transition-all font-bold border border-red-100"
                    >
                      קבע תור דחוף
                    </button>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        sendReminder(c);
                      }}
                      className="w-8 flex items-center justify-center bg-gray-50 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors border border-gray-100"
                      title="שלח תזכורת בוואטסאפ"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <AppointmentModal
        isOpen={!!selectedCustomerForAppt}
        onClose={() => setSelectedCustomerForAppt(null)}
        onSave={newAppt => {
          onAppointmentCreate(newAppt);
          setSelectedCustomerForAppt(null);
        }}
        customers={customers}
        initialDate={selectedCustomerForAppt?.dueDate}
        preSelectedCustomerId={selectedCustomerForAppt?.customer.id}
        onCreateNewCustomer={onCreateNewCustomer}
      />
    </>
  );
};
