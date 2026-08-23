import React, { useMemo } from 'react';
import { CalendarClock, AlertTriangle, Wallet, ListTodo, Dog as DogIcon, Clock, User } from 'lucide-react';
import { Appointment, AppointmentStatus, Customer, Dog, Task } from '../types';

interface HomeDashboardProps {
  appointments: Appointment[];
  dogs: Dog[];
  customers: Customer[];
  tasks: Task[];
  onOpenDog: (dogId: string) => void;
}

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  [AppointmentStatus.SCHEDULED]: 'נקבע',
  [AppointmentStatus.COMPLETED]: 'הסתיים',
  [AppointmentStatus.CANCELLED]: 'בוטל',
  [AppointmentStatus.LATE]: 'באיחור',
};

const isSameDay = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

const hasRedFlag = (dog?: Dog) =>
  Boolean(dog && (dog.allergies?.trim() || dog.medicalNotes?.trim() || dog.behaviorNotes?.trim()));

export const HomeDashboard: React.FC<HomeDashboardProps> = ({ appointments, dogs, customers, tasks, onOpenDog }) => {
  const today = new Date();

  const todaysAppointments = useMemo(
    () =>
      appointments
        .filter(a => isSameDay(new Date(a.date), today) && a.status !== AppointmentStatus.CANCELLED)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [appointments]
  );

  const remainingToday = todaysAppointments.filter(
    a => new Date(a.date).getTime() >= Date.now() && a.status !== AppointmentStatus.COMPLETED
  ).length;

  const expectedRevenueToday = todaysAppointments.reduce((sum, a) => sum + (a.price || 0), 0);
  const openTasksCount = tasks.filter(t => t.status === 'OPEN').length;

  return (
    <div className="flex-1 bg-white/90 m-3 rounded-2xl shadow-sm flex flex-col overflow-hidden border border-gray-100 backdrop-blur-sm">
      <div className="p-6 border-b border-gray-100 shrink-0 bg-gradient-to-r from-blue-50 via-pink-50 to-emerald-50">
        <h2 className="text-2xl font-bold text-gray-800">היום</h2>
        <p className="text-sm text-gray-500">
          {today.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      <div className="p-6 overflow-y-auto custom-scrollbar space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white border border-gray-100 p-5 rounded-2xl flex flex-col justify-between">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-50 rounded-full text-blue-600">
                <CalendarClock className="w-5 h-5" />
              </div>
              <span className="font-bold text-gray-600">תורים שנשארו היום</span>
            </div>
            <div className="text-3xl font-bold text-gray-800">{remainingToday}</div>
          </div>

          <div className="bg-white border border-gray-100 p-5 rounded-2xl flex flex-col justify-between">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-emerald-50 rounded-full text-emerald-600">
                <Wallet className="w-5 h-5" />
              </div>
              <span className="font-bold text-gray-600">הכנסות צפויות היום</span>
            </div>
            <div className="text-3xl font-bold text-gray-800">₪{expectedRevenueToday.toLocaleString()}</div>
          </div>

          <div className="bg-white border border-gray-100 p-5 rounded-2xl flex flex-col justify-between">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-orange-50 rounded-full text-orange-600">
                <ListTodo className="w-5 h-5" />
              </div>
              <span className="font-bold text-gray-600">משימות פתוחות</span>
            </div>
            <div className="text-3xl font-bold text-gray-800">{openTasksCount}</div>
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm">
          <div className="p-5 border-b border-gray-100">
            <h3 className="font-bold text-gray-800">התורים של היום</h3>
          </div>

          {todaysAppointments.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <DogIcon className="w-14 h-14 mx-auto mb-3 opacity-20" />
              <p>אין תורים היום</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {todaysAppointments.map(appointment => {
                const dog = dogs.find(d => d.id === appointment.dogId);
                const customer = customers.find(c => c.id === appointment.customerId);
                const flagged = hasRedFlag(dog);

                return (
                  <button
                    key={appointment.id}
                    type="button"
                    onClick={() => dog && onOpenDog(dog.id)}
                    disabled={!dog}
                    className="w-full text-right p-4 flex items-center gap-4 hover:bg-blue-50/30 transition-colors disabled:cursor-default disabled:hover:bg-transparent"
                  >
                    <div className="shrink-0 w-16 text-center">
                      <div className="flex items-center justify-center gap-1 text-gray-700 font-bold text-sm">
                        <Clock className="w-3.5 h-3.5 text-gray-400" />
                        {new Date(appointment.date).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-gray-800 flex items-center gap-1">
                          <DogIcon className="w-3.5 h-3.5 text-gray-400" />
                          {dog?.name || 'כלב לא ידוע'}
                          {dog?.breed ? ` · ${dog.breed}` : ''}
                        </span>
                        <span className="text-gray-400 text-xs flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {customer?.name || ''}
                        </span>
                      </div>
                      {appointment.service && (
                        <div className="text-xs text-gray-500 mt-0.5 truncate">{appointment.service}</div>
                      )}
                    </div>

                    {flagged && (
                      <span className="relative shrink-0 inline-flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-50 px-2 py-1 rounded-lg border border-red-100 overflow-hidden">
                        <span className="absolute top-0 right-0 w-1 h-full bg-red-500" />
                        <AlertTriangle className="w-3.5 h-3.5" />
                        שים לב
                      </span>
                    )}

                    <span className="shrink-0 text-xs font-medium text-gray-500 bg-gray-50 border border-gray-100 px-2 py-1 rounded-lg">
                      {STATUS_LABEL[appointment.status]}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
