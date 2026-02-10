
import React, { useState, useEffect } from 'react';
import { ChevronRight, ChevronLeft, Sparkles, Plus, Clock } from 'lucide-react';
import { WEEK_DAYS } from '../constants';
import { Appointment, AppointmentStatus, Customer, DayCell } from '../types';
import { analyzeSchedule } from '../services/geminiService';
import { getJewishHoliday } from '../services/holidayService';

interface CalendarProps {
  currentDate: Date;
  onDateChange: (date: Date) => void;
  appointments: Appointment[];
  customers: Customer[];
  onCustomerClick: (customer: Customer) => void;
  onDayClick: (date: Date) => void;
  onDayAddAppointment: (date: Date) => void;
  onAppointmentClick: (appointment: Appointment) => void;
  onAppointmentMove: (appointmentId: string, newDate: Date) => void;
}

export const Calendar: React.FC<CalendarProps> = ({ 
    currentDate, 
    onDateChange, 
    appointments, 
    customers, 
    onCustomerClick,
    onDayClick,
    onDayAddAppointment,
    onAppointmentClick,
    onAppointmentMove
}) => {
  const [calendarGrid, setCalendarGrid] = useState<DayCell[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<string>('');
  const [loadingAi, setLoadingAi] = useState(false);
  const [dragOverDate, setDragOverDate] = useState<Date | null>(null);

  // Today's Date info for Header
  const today = new Date();
  const todayGregorian = today.toLocaleDateString('he-IL', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
  const weeklyGoal = 12;
  const weekStart = new Date(currentDate);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weeklyDogCount = appointments.filter(appt => {
    if (appt.date < weekStart || appt.date >= weekEnd) return false;
    if (appt.status === AppointmentStatus.CANCELLED) return false;
    const customer = customers.find(c => c.id === appt.customerId);
    const petType = (customer?.petType || '').toLowerCase();
    if (!petType) return true;
    if (petType.includes('חתול') || petType.includes('cat')) return false;
    return true;
  }).length;

  // Generate Calendar Grid
  useEffect(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const todayRef = new Date(); 

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    
    // 0 = Sunday, 1 = Monday, etc.
    const startDayOfWeek = firstDayOfMonth.getDay(); 
    
    const daysInMonth = lastDayOfMonth.getDate();
    
    const grid: DayCell[] = [];

    // Helper to check if a date is today
    const isDateToday = (d: Date) => {
        return d.getDate() === todayRef.getDate() &&
               d.getMonth() === todayRef.getMonth() &&
               d.getFullYear() === todayRef.getFullYear();
    };

    // Previous month padding
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const date = new Date(year, month - 1, prevMonthLastDay - i);
      grid.push({
        date,
        isCurrentMonth: false,
        isToday: isDateToday(date),
        events: [],
        holiday: getJewishHoliday(date)
      });
    }

    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(year, month, i);
      
      // Find appointments for this day
      const daysEvents = appointments.filter(app => 
        app.date.getDate() === i && 
        app.date.getMonth() === month &&
        app.date.getFullYear() === year
      ).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      grid.push({
        date,
        isCurrentMonth: true,
        isToday: isDateToday(date),
        events: daysEvents,
        holiday: getJewishHoliday(date)
      });
    }

    // Next month padding to fill grid
    const remainingCells = 42 - grid.length;
    for (let i = 1; i <= remainingCells; i++) {
      const date = new Date(year, month + 1, i);
      grid.push({
        date,
        isCurrentMonth: false,
        isToday: isDateToday(date),
        events: [],
        holiday: getJewishHoliday(date)
      });
    }

    setCalendarGrid(grid);
  }, [currentDate, appointments]);

  const handlePrevMonth = () => {
    onDateChange(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    onDateChange(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const handleToday = () => {
    onDateChange(new Date());
  };

  const handleAiAnalyze = async () => {
    setLoadingAi(true);
    const result = await analyzeSchedule(currentDate, appointments, customers);
    setAiAnalysis(result);
    setLoadingAi(false);
  };

  // --- Drag and Drop Handlers ---
  const handleDragStart = (e: React.DragEvent, appointmentId: string) => {
    e.stopPropagation();
    e.dataTransfer.setData("appointmentId", appointmentId);
    e.dataTransfer.setData("text/plain", appointmentId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setDragImage(e.currentTarget as HTMLElement, 8, 8);
  };

  const handleDragOver = (e: React.DragEvent, date: Date) => {
    e.preventDefault();
    if (dragOverDate?.getTime() !== date.getTime()) {
      setDragOverDate(date);
    }
  };

  const handleDragEnter = (e: React.DragEvent, date: Date) => {
    e.preventDefault();
    if (dragOverDate?.getTime() !== date.getTime()) {
      setDragOverDate(date);
    }
  };

  const handleDragLeave = (e: React.DragEvent, date: Date) => {
    e.preventDefault();
    if (dragOverDate?.getTime() === date.getTime()) {
      setDragOverDate(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetDate: Date) => {
    e.preventDefault();
    const appointmentId = e.dataTransfer.getData("appointmentId");
    if (appointmentId) {
      onAppointmentMove(appointmentId, targetDate);
    }
    setDragOverDate(null);
  };

  const handleDragEnd = () => {
    setDragOverDate(null);
  };


  const monthName = currentDate.toLocaleString('he-IL', { month: 'long', year: 'numeric' });
  const weeks: DayCell[][] = [];
  for (let i = 0; i < calendarGrid.length; i += 7) {
    weeks.push(calendarGrid.slice(i, i + 7));
  }
  const visibleWeeks = weeks.filter(week => week.some(cell => cell.isCurrentMonth));

  return (
    <div className="flex-1 bg-white/90 m-0 md:m-3 rounded-none md:rounded-2xl shadow-sm flex flex-col overflow-hidden border border-gray-100 backdrop-blur-sm">
      {/* Calendar Header */}
      <div className="px-3 md:px-5 py-2 md:py-3 flex items-center justify-between bg-gradient-to-r from-blue-50 via-white to-emerald-50 sticky top-0 z-10 border-b border-gray-100 shrink-0">
        
        <div className="flex items-center gap-4">
             <h2 className="text-xl md:text-2xl font-bold text-gray-800 capitalize tracking-tight">{monthName}</h2>
             
             {/* Today's Date Indicator */}
             <div className="hidden md:flex flex-col border-r-2 border-gray-100 pr-4 mr-2">
                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">היום</span>
                <div className="flex items-center gap-2 text-sm text-gray-600 font-medium">
                     <span>{todayGregorian}</span>
                </div>
            </div>
             
             {/* AI Button */}
             <button 
                onClick={handleAiAnalyze}
                className="flex items-center gap-2 text-sm text-purple-600 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-full transition-colors font-medium"
                disabled={loadingAi}
             >
                <Sparkles className="w-4 h-4" />
                {loadingAi ? 'מנתח...' : 'ניתוח יומי'}
             </button>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1 bg-gray-50 p-1 rounded-xl border border-gray-100">
            <button 
                onClick={handleNextMonth}
                className="p-1.5 hover:bg-white hover:shadow-sm rounded-lg text-gray-500 hover:text-gray-800 transition-all"
            >
                <ChevronRight className="w-5 h-5" />
            </button>
            <button 
                onClick={handleToday}
                className="px-3 py-1 hover:bg-white hover:shadow-sm text-gray-600 hover:text-gray-900 text-sm font-bold rounded-lg transition-all"
            >
                היום
            </button>
            <button 
                onClick={handlePrevMonth}
                className="p-1.5 hover:bg-white hover:shadow-sm rounded-lg text-gray-500 hover:text-gray-800 transition-all"
            >
                <ChevronLeft className="w-5 h-5" />
            </button>
        </div>
      </div>

      {/* AI Analysis Result */}
      <div className="hidden md:flex mx-3 md:mx-4 mt-1.5 md:mt-2 mb-1.5 md:mb-2 bg-green-50 text-green-800 text-[11px] border border-green-100 px-3 py-1.5 rounded-xl items-center justify-between shrink-0">
        <span className="font-bold">סיכום שבועי: {weeklyDogCount}/{weeklyGoal} כלבים</span>
        {weeklyDogCount >= weeklyGoal && (
          <span className="bg-green-600 text-white px-2 py-0.5 rounded-full text-[10px]">מצוין</span>
        )}
      </div>
      {aiAnalysis && (
        <div className="hidden md:flex mx-3 md:mx-4 mb-1.5 md:mb-2 bg-gradient-to-r from-purple-50 to-white px-3 py-1.5 rounded-xl text-purple-900 text-[11px] border border-purple-100 items-start gap-3 shadow-sm animate-in fade-in slide-in-from-top-2 shrink-0">
            <Sparkles className="w-4 h-4 text-purple-600 flex-shrink-0 mt-0.5" />
            <p className="leading-relaxed font-medium">{aiAnalysis}</p>
        </div>
      )}

      {/* Grid Header + Content (Scrollable on Mobile) */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-x-hidden">
          <div className="min-w-0">
        <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_0.7fr] md:grid-cols-7 border-b border-sky-100 px-3 md:px-5 bg-gradient-to-r from-sky-50 via-white to-emerald-50 shrink-0">
          {WEEK_DAYS.map(day => (
            <div key={day} className="py-1.5 text-center text-[11px] font-semibold text-gray-500">
              {day}
            </div>
          ))}
        </div>

        <div className="px-1.5 sm:px-3 md:px-5 pb-3 md:pb-4 pt-1 md:pt-2 overflow-hidden bg-gradient-to-b from-white to-gray-50/40">
          <div className="h-full flex flex-col gap-1.5 sm:gap-2.5">
            {visibleWeeks.map((week, weekIndex) => (
              <div key={`week-${weekIndex}`} className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_0.7fr] md:grid-cols-7 gap-1.5 sm:gap-2.5 flex-1">
                    {week.map((cell) => {
                if (!cell.isCurrentMonth) {
                  return (
                    <div
                      key={cell.date.toISOString()}
                      className="rounded-2xl min-h-[96px] sm:min-h-[115px] md:min-h-[130px] border border-transparent bg-transparent pointer-events-none"
                    />
                  );
                }
                const isDragTarget = dragOverDate &&
                                     dragOverDate.getDate() === cell.date.getDate() &&
                                     dragOverDate.getMonth() === cell.date.getMonth() &&
                                     dragOverDate.getFullYear() === cell.date.getFullYear();
                const eventCustomerIds = new Set(cell.events.map(e => e.customerId));
                const lastVisitsForDay = customers.filter(c => {
                  if (eventCustomerIds.has(c.id)) {
                    return false;
                  }
                  const d = new Date(c.lastVisit);
                  d.setHours(0, 0, 0, 0);
                  const cd = new Date(cell.date);
                  cd.setHours(0, 0, 0, 0);
                  return d.getTime() === cd.getTime();
                });
                const activeEvents = cell.events.filter(e => e.status !== 'CANCELLED');
                const uniqueCustomerCount = new Set(activeEvents.map(e => e.customerId)).size;
                const displayLastVisits = lastVisitsForDay.slice(0, 1);
                const maxVisibleEvents = 4;
                const displayEvents = cell.events.slice(0, maxVisibleEvents);

                return (
                  <div 
                      key={cell.date.toISOString()}
                      onClick={() => onDayClick(cell.date)}
                      onDragOver={(e) => handleDragOver(e, cell.date)}
                      onDragEnter={(e) => handleDragEnter(e, cell.date)}
                      onDragLeave={(e) => handleDragLeave(e, cell.date)}
                      onDrop={(e) => handleDrop(e, cell.date)}
                      className={`
                          relative rounded-2xl p-2 md:p-2 transition-all cursor-pointer group flex flex-col justify-between border min-h-[96px] sm:min-h-[115px] md:min-h-[130px] overflow-hidden
                          ${cell.isCurrentMonth ? 'bg-white border-gray-200 hover:border-blue-200 hover:shadow-md' : 'bg-gray-50/40 border-gray-100 text-gray-300 opacity-60'}
                          ${cell.isToday ? 'bg-blue-50/80 border-blue-300 ring-2 ring-blue-100 shadow-md transform scale-[1.01] z-10' : ''}
                          ${isDragTarget ? 'bg-blue-50 border-blue-300 border-dashed ring-1 ring-blue-200' : ''}
                      `}
                  >
                      {/* Header: Date & Add Icon */}
                      <div className="flex justify-between items-start pointer-events-none mb-1">
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 bg-blue-100 rounded-full text-blue-600 pointer-events-auto">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDayAddAppointment(cell.date);
                                }}
                                className="flex items-center justify-center"
                                aria-label="הוסף תור"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                          </div>
                          
                          <div className="flex items-center gap-1">
                               {/* Holiday Indicator */}
                               {cell.holiday && (
                                  <span className="text-[9px] font-bold text-pink-600 bg-pink-50 px-1 py-0.5 rounded-md truncate max-w-[60px]" title={cell.holiday}>
                                      {cell.holiday}
                                  </span>
                               )}

                              <div className={`
                                  w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold transition-all
                                  ${cell.isToday ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 group-hover:bg-gray-100'}
                              `}>
                                  {cell.date.getDate()}
                              </div>
                          </div>
                      </div>

                      {uniqueCustomerCount > 0 && (
                        <div className="hidden sm:flex justify-end mb-1">
                          <div className="text-[9px] font-bold text-blue-700 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded-full">
                            {uniqueCustomerCount} לקוחות
                          </div>
                        </div>
                      )}

                      {/* Last Visit Markers */}
                      {lastVisitsForDay.length > 0 && (
                        <div className="hidden sm:block space-y-1 mb-1">
                          {displayLastVisits.map(c => {
                            const lastVisitTime = new Date(c.lastVisit).toLocaleTimeString('he-IL', {
                              hour: '2-digit',
                              minute: '2-digit'
                            });

                            return (
                              <div
                                key={`last-${c.id}`}
                                className="flex items-center gap-1 text-[10px] px-1.5 py-1 rounded-md truncate border transition-colors cursor-pointer bg-green-100 border-green-200 text-green-800 shadow-sm hover:brightness-95"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onCustomerClick(c);
                                }}
                              >
                                <div className="w-1 h-1 rounded-full flex-shrink-0 bg-green-600"></div>
                                <span className="font-bold flex-shrink-0">{lastVisitTime}</span>
                                <span className="truncate font-medium">{c.name}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Events - show only first and count */}
                      <div className="space-y-0.5 overflow-hidden flex-1 max-h-[62px] sm:max-h-[85px] md:max-h-[90px]">
                          {displayEvents.map(e => {
                              const customer = customers.find(c => c.id === e.customerId);
                              const isCancelled = e.status === 'CANCELLED';
                              const isCompleted = e.status === 'COMPLETED';
                              const timeLabel = e.date.toLocaleTimeString('he-IL', {
                                hour: '2-digit',
                                minute: '2-digit'
                              });
                              const statusClasses = isCancelled
                                ? 'bg-gray-100 border-gray-200 text-gray-400 line-through'
                                : isCompleted
                                ? 'bg-green-50 border-green-200 text-green-700'
                                : 'bg-blue-50 border-blue-200 text-blue-700';
                              const fullNameLabel = customer ? customer.name : 'לקוח לא ידוע';
                              const shortNameLabel = fullNameLabel.split(' ')[0] || fullNameLabel;

                              const chipClass = `calendar-event flex items-center gap-1 h-4 sm:h-5 text-[8px] sm:text-[8px] leading-tight px-0.5 sm:px-1 rounded-md truncate border transition-colors cursor-grab active:cursor-grabbing shadow-sm hover:brightness-95 select-none ${statusClasses}`;

                              return (
                                <div
                                  key={e.id}
                                  onMouseDown={(evt) => {
                                    evt.stopPropagation();
                                  }}
                                  onClick={(evt) => {
                                    evt.stopPropagation();
                                    onAppointmentClick(e);
                                  }}
                                  className={chipClass}
                                  title={`${timeLabel} - ${fullNameLabel}`}
                                >
                                  <span
                                    className="hidden sm:flex items-center text-[9px] text-gray-500 pr-1 cursor-grab active:cursor-grabbing select-none"
                                    draggable
                                    onDragStart={(evt) => handleDragStart(evt, e.id)}
                                    onDragEnd={handleDragEnd}
                                    title="גרור להזזה"
                                    aria-label="גרור להזזה"
                                  >
                                    ⋮⋮
                                  </span>
                                  <span className="truncate font-medium sm:hidden">{shortNameLabel}</span>
                                  <span className="truncate font-medium hidden sm:inline">{fullNameLabel}</span>
                                </div>
                              );
                          })}
                          {/* Hide extra count indicator */}
                      </div>
                      {/* Tooltip */}
                      {cell.events.length > 0 && (
                          <div className="absolute z-50 bottom-full right-1/2 translate-x-1/2 mb-2 hidden group-hover:block w-64 bg-gray-900 text-white text-xs rounded-xl p-3 shadow-2xl pointer-events-none animate-in fade-in zoom-in-95 duration-150">
                              <div className="font-bold border-b border-gray-700 pb-2 mb-2 flex items-center gap-2">
                                  <Clock className="w-3 h-3 text-gray-400" />
                                  {cell.date.toLocaleDateString('he-IL')}
                              </div>
                              <div className="space-y-2">
                                  {cell.events.map(e => {
                                      const customer = customers.find(c => c.id === e.customerId);
                                      const isCancelled = e.status === 'CANCELLED';
                                      const isCompleted = e.status === 'COMPLETED';
                                      return (
                                          <div key={e.id} className={`flex justify-between items-center gap-2 ${isCancelled ? 'opacity-50 line-through' : ''}`}>
                                              <span className="text-gray-400 font-mono">
                                                  {e.date.toLocaleTimeString('he-IL', {hour: '2-digit', minute:'2-digit'})}
                                              </span>
                                              <div className="text-right truncate flex-1">
                                                  <span className={`font-bold block truncate ${isCompleted ? 'text-green-300' : 'text-white'}`}>
                                                       {customer ? customer.name : 'לקוח לא ידוע'}
                                                      {customer?.petName && <span className="text-gray-400 font-normal mr-1">({customer.petName})</span>}
                                                  </span>
                                                  <span className="text-gray-500 text-[10px] block truncate">{e.service}</span>
                                              </div>
                                          </div>
                                      );
                                  })}
                              </div>
                          </div>
                      )}
                  </div>
                    );
                  })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

