import React, { useMemo, useState } from 'react';
import {
  Search,
  Edit2,
  Plus,
  Dog,
  Calendar,
  AlertCircle,
  Clock,
  CheckCircle2,
  Phone,
  PauseCircle
} from 'lucide-react';
import { Appointment, Customer } from '../types';
import { analyzeCustomerStatus } from '../utils';

interface CustomersViewProps {
  customers: Customer[];
  appointments: Appointment[];
  onEditCustomer: (customer: Customer) => void;
  onAddCustomer: () => void;
}

type CustomerFilter = 'ACTIVE' | 'ON_HOLD' | 'ALL';

export const CustomersView: React.FC<CustomersViewProps> = ({
  customers,
  appointments,
  onEditCustomer,
  onAddCustomer
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<CustomerFilter>('ACTIVE');

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const activeCount = customers.filter(customer => customer.lifecycleStatus !== 'ON_HOLD').length;
  const onHoldCount = customers.filter(customer => customer.lifecycleStatus === 'ON_HOLD').length;

  const filteredCustomers = useMemo(() => {
    const matchesSearch = (customer: Customer) => {
      if (!normalizedSearch) return true;
      return [customer.name, customer.petName, customer.phone]
        .some(value => value.toLowerCase().includes(normalizedSearch));
    };

    return customers
      .filter(customer => {
        if (filter === 'ACTIVE') return customer.lifecycleStatus !== 'ON_HOLD';
        if (filter === 'ON_HOLD') return customer.lifecycleStatus === 'ON_HOLD';
        return true;
      })
      .filter(matchesSearch)
      .sort((left, right) => left.name.localeCompare(right.name, 'he'));
  }, [customers, filter, normalizedSearch]);

  return (
    <div className="flex-1 bg-white/90 m-3 rounded-2xl shadow-sm flex flex-col overflow-hidden border border-gray-100 backdrop-blur-sm">
      <div className="p-6 border-b border-gray-100 flex justify-between items-center gap-4 shrink-0 bg-gradient-to-r from-blue-50 via-white to-emerald-50">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">לקוחות</h2>
          <p className="text-sm text-gray-500">ניהול כרטיסי לקוחות, מעקב שוטף והפרדה ללקוחות בהמתנה</p>
        </div>

        <button
          onClick={onAddCustomer}
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-medium flex items-center gap-2 shadow-lg shadow-blue-100 transition-all active:scale-95"
        >
          <Plus className="w-5 h-5" />
          לקוח חדש
        </button>
      </div>

      <div className="p-4 bg-blue-50/60 border-b border-gray-100 shrink-0 space-y-4">
        <div className="relative max-w-md">
          <Search className="absolute right-3 top-3 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="חיפוש לפי שם, טלפון או שם הכלב..."
            className="w-full pr-10 pl-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            { id: 'ACTIVE' as CustomerFilter, label: 'פעילים', count: activeCount },
            { id: 'ON_HOLD' as CustomerFilter, label: 'בהמתנה', count: onHoldCount },
            { id: 'ALL' as CustomerFilter, label: 'הכל', count: customers.length }
          ].map(item => {
            const isActive = filter === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={`
                  inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition-colors
                  ${isActive
                    ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-blue-200 hover:text-blue-700'}
                `}
              >
                <span>{item.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] ${isActive ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>
                  {item.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar bg-white">
        {filteredCustomers.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Dog className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p>לא נמצאו לקוחות מתאימים</p>
          </div>
        ) : (
          <table className="w-full text-right border-collapse">
            <thead className="bg-gray-50 sticky top-0 z-10 text-xs text-gray-500 font-medium border-b border-gray-100 shadow-sm">
              <tr>
                <th className="px-6 py-4 font-semibold">לקוח</th>
                <th className="px-6 py-4 font-semibold hidden md:table-cell">טלפון</th>
                <th className="px-6 py-4 font-semibold">סטטוס</th>
                <th className="px-6 py-4 font-semibold hidden sm:table-cell">תור הבא / יעד</th>
                <th className="px-6 py-4 font-semibold hidden lg:table-cell">תדירות</th>
                <th className="px-6 py-4 font-semibold"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 text-sm">
              {filteredCustomers.map(customer => {
                const analysis = analyzeCustomerStatus(customer, appointments);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const lastVisit = new Date(analysis.lastEffectiveVisit);
                lastVisit.setHours(0, 0, 0, 0);
                const daysSinceLastVisit = Math.floor((today.getTime() - lastVisit.getTime()) / (1000 * 3600 * 24));

                let style = {
                  label: 'תקין',
                  subLabel: 'אין תור',
                  color: 'bg-blue-50 text-blue-700 border-blue-100',
                  icon: Calendar,
                  displayDate: analysis.dueDate,
                  isAppt: false
                };

                if (analysis.status === 'ON_HOLD') {
                  style = {
                    label: 'בהמתנה',
                    subLabel: 'לא במעקב',
                    color: 'bg-slate-100 text-slate-700 border-slate-200',
                    icon: PauseCircle,
                    displayDate: analysis.lastEffectiveVisit,
                    isAppt: false
                  };
                } else if (analysis.status === 'SCHEDULED') {
                  style = {
                    label: 'יש תור',
                    subLabel: 'תור קבוע',
                    color: 'bg-emerald-100 text-emerald-700 border-emerald-200',
                    icon: CheckCircle2,
                    displayDate: analysis.nextAppointment,
                    isAppt: true
                  };
                } else if (analysis.status === 'LATE') {
                  style = {
                    label: 'מאחר',
                    subLabel: 'עבר המועד',
                    color: 'bg-red-100 text-red-700 border-red-200',
                    icon: AlertCircle,
                    displayDate: analysis.dueDate,
                    isAppt: false
                  };
                } else if (analysis.status === 'SOON') {
                  style = {
                    label: 'בקרוב',
                    subLabel: 'תזכורת קרובה',
                    color: 'bg-orange-100 text-orange-700 border-orange-200',
                    icon: Clock,
                    displayDate: analysis.dueDate,
                    isAppt: false
                  };
                }

                let displayDaysDiff = analysis.daysDiff;
                let isOverdue = analysis.status === 'LATE';

                if (style.isAppt && style.displayDate) {
                  const normalizedToday = new Date();
                  normalizedToday.setHours(0, 0, 0, 0);
                  const normalizedDate = new Date(style.displayDate);
                  normalizedDate.setHours(0, 0, 0, 0);
                  displayDaysDiff = Math.ceil((normalizedDate.getTime() - normalizedToday.getTime()) / (1000 * 3600 * 24));
                  isOverdue = false;
                }

                const getRelativeTimeText = () => {
                  if (analysis.status === 'ON_HOLD') return 'מושהה ממעקב';
                  if (displayDaysDiff === 0) return 'היום';
                  if (displayDaysDiff === 1) return 'מחר';
                  if (isOverdue || displayDaysDiff < 0) return `עברו ${Math.abs(displayDaysDiff)} ימים`;
                  return `בעוד ${displayDaysDiff} ימים`;
                };

                const getDaysPassedText = (days: number) => {
                  if (Number.isNaN(days)) return '';
                  if (days === 0) return 'היום';
                  if (days === 1) return 'אתמול';
                  if (days === 2) return 'לפני יומיים';
                  return `לפני ${days} ימים`;
                };

                return (
                  <tr
                    key={customer.id}
                    className="hover:bg-blue-50/30 transition-colors group cursor-pointer"
                    onClick={() => onEditCustomer(customer)}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg shrink-0 ${style.color.split(' ')[0]} ${style.color.split(' ')[1]}`}>
                          {customer.name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-bold text-gray-800">{customer.name}</div>
                          <div className="text-gray-500 text-xs flex items-center gap-1">
                            <Dog className="w-3 h-3" />
                            {customer.petName}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 hidden md:table-cell">
                      <div className="text-gray-600 flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-gray-400" />
                        {customer.phone}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${style.color}`}>
                        <style.icon className="w-3.5 h-3.5" />
                        {style.label}
                        <span className="opacity-40 font-light px-0.5">|</span>
                        <span className="opacity-90 font-normal">{style.subLabel}</span>
                      </span>
                    </td>
                    <td className="px-6 py-4 hidden sm:table-cell">
                      {analysis.status === 'ON_HOLD' ? (
                        <div className="flex flex-col text-slate-500">
                          <span className="font-bold">לא במעקב</span>
                          <span className="text-[11px] mt-0.5">ביקור אחרון: {analysis.lastEffectiveVisit.toLocaleDateString('he-IL')}</span>
                        </div>
                      ) : (
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className={`font-bold ${style.isAppt ? 'text-emerald-700' : isOverdue ? 'text-red-600' : 'text-gray-700'}`}>
                              {style.displayDate?.toLocaleDateString('he-IL')}
                            </span>
                            {style.isAppt && (
                              <span className="text-[10px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded-md font-medium">
                                {style.displayDate?.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                          </div>
                          <span className={`text-[11px] font-medium mt-0.5 ${
                            style.isAppt ? 'text-emerald-600/80' : isOverdue ? 'text-red-500 font-bold' : 'text-gray-400'
                          }`}>
                            {getRelativeTimeText()}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 hidden lg:table-cell">
                      <div className="text-gray-500 flex flex-col text-xs">
                        <span className="mb-1 block font-medium">
                          {analysis.status === 'ON_HOLD' ? 'בהמתנה' : `כל ${customer.visitFrequencyWeeks} שבועות`}
                        </span>
                        <span className="text-gray-400 flex items-center gap-1">
                          ביקור אחרון: {analysis.lastEffectiveVisit.toLocaleDateString('he-IL')}
                        </span>
                        <span className={`text-[10px] font-bold mt-0.5 ${analysis.status === 'ON_HOLD' ? 'text-slate-500' : 'text-blue-500/80'}`}>
                          {analysis.status === 'ON_HOLD' ? 'ללא תזכורות אוטומטיות' : getDaysPassedText(daysSinceLastVisit)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-left">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditCustomer(customer);
                        }}
                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
