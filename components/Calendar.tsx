import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Clock, MessageCircle, Plus, Sparkles } from 'lucide-react';
import { WEEK_DAYS } from '../constants';
import { Appointment, AppointmentStatus, CalendarEvent, Customer, DayCell } from '../types';
import { analyzeSchedule } from '../services/geminiService';
import { getJewishHoliday } from '../services/holidayService';

interface CalendarProps {
  currentDate: Date;
  summaryReferenceDate: Date;
  onDateChange: (date: Date) => void;
  onOpenMessages?: () => void;
  appointments: Appointment[];
  calendarEvents: CalendarEvent[];
  customers: Customer[];
  onCustomerClick: (customer: Customer) => void;
  onDayClick: (date: Date) => void;
  onDayAddAppointment: (date: Date) => void;
  onCalendarEventClick: (event: CalendarEvent) => void;
  onAppointmentClick: (appointment: Appointment) => void;
  onAppointmentMove: (appointmentId: string, newDate: Date) => void;
}

type SwipeAxisLock = 'horizontal' | 'vertical' | null;

const getMonthStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);

const shiftMonth = (date: Date, offset: number) =>
  new Date(date.getFullYear(), date.getMonth() + offset, 1);

const isSameMonthValue = (left: Date, right: Date) =>
  getMonthStart(left).getTime() === getMonthStart(right).getTime();

const buildCalendarGrid = (
  date: Date,
  appointments: Appointment[],
  calendarEvents: CalendarEvent[]
) => {
  const monthDate = getMonthStart(date);
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const todayRef = new Date();
  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const startDayOfWeek = firstDayOfMonth.getDay();
  const daysInMonth = lastDayOfMonth.getDate();
  const grid: DayCell[] = [];

  const isDateToday = (value: Date) =>
    value.getDate() === todayRef.getDate() &&
    value.getMonth() === todayRef.getMonth() &&
    value.getFullYear() === todayRef.getFullYear();

  const buildCell = (cellDate: Date, isCurrentMonth: boolean): DayCell => {
    const dayEvents = appointments
      .filter(
        (appointment) =>
          appointment.date.getDate() === cellDate.getDate() &&
          appointment.date.getMonth() === cellDate.getMonth() &&
          appointment.date.getFullYear() === cellDate.getFullYear()
      )
      .sort((left, right) => left.date.getTime() - right.date.getTime());

    const daySpecialEvents = calendarEvents
      .filter(
        (event) =>
          event.showInCalendar &&
          event.date.getDate() === cellDate.getDate() &&
          event.date.getMonth() === cellDate.getMonth() &&
          event.date.getFullYear() === cellDate.getFullYear()
      )
      .sort((left, right) => left.date.getTime() - right.date.getTime());

    return {
      date: cellDate,
      isCurrentMonth,
      isToday: isDateToday(cellDate),
      events: dayEvents,
      specialEvents: daySpecialEvents,
      holiday: getJewishHoliday(cellDate)
    };
  };

  const prevMonthLastDay = new Date(year, month, 0).getDate();
  for (let index = startDayOfWeek - 1; index >= 0; index -= 1) {
    const cellDate = new Date(year, month - 1, prevMonthLastDay - index);
    grid.push(buildCell(cellDate, false));
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const cellDate = new Date(year, month, day);
    grid.push(buildCell(cellDate, true));
  }

  const remainingCells = 42 - grid.length;
  for (let day = 1; day <= remainingCells; day += 1) {
    const cellDate = new Date(year, month + 1, day);
    grid.push(buildCell(cellDate, false));
  }

  return grid;
};

export const Calendar: React.FC<CalendarProps> = ({
  currentDate,
  summaryReferenceDate,
  onDateChange,
  onOpenMessages,
  appointments,
  calendarEvents,
  customers,
  onCustomerClick: _onCustomerClick,
  onDayClick,
  onDayAddAppointment,
  onCalendarEventClick,
  onAppointmentClick,
  onAppointmentMove
}) => {
  const [displayDate, setDisplayDate] = useState(() => getMonthStart(currentDate));
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [loadingAi, setLoadingAi] = useState(false);
  const [dragOverDate, setDragOverDate] = useState<Date | null>(null);
  const [monthAnimation, setMonthAnimation] = useState<'next' | 'prev' | null>(null);
  const [swipeOffsetX, setSwipeOffsetX] = useState(0);
  const [isSwipeDragging, setIsSwipeDragging] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewportWidth, setViewportWidth] = useState(1);
  const swipeSessionRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    axisLock: SwipeAxisLock;
  }>({
    active: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    axisLock: null
  });

  const today = new Date();
  const todayGregorian = today.toLocaleDateString('he-IL', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
  const weeklyGoal = 12;
  const weekStart = new Date(summaryReferenceDate);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weeklyDogCount = appointments.filter((appointment) => {
    if (appointment.date < weekStart || appointment.date >= weekEnd) return false;
    if (appointment.status === AppointmentStatus.CANCELLED) return false;
    const customer = customers.find((item) => item.id === appointment.customerId);
    const petType = (customer?.petType || '').toLowerCase();
    if (!petType) return true;
    if (petType.includes('חתול') || petType.includes('cat')) return false;
    return true;
  }).length;

  const monthCells = useMemo(
    () => buildCalendarGrid(displayDate, appointments, calendarEvents),
    [appointments, calendarEvents, displayDate]
  );

  useEffect(() => {
    const nextWidth = viewportRef.current?.clientWidth ?? 1;
    setViewportWidth(Math.max(nextWidth, 1));

    if (typeof ResizeObserver !== 'undefined' && viewportRef.current) {
      const observer = new ResizeObserver((entries) => {
        const width = entries[0]?.contentRect.width ?? viewportRef.current?.clientWidth ?? 1;
        setViewportWidth(Math.max(width, 1));
      });
      observer.observe(viewportRef.current);
      return () => observer.disconnect();
    }

    const handleResize = () => {
      const width = viewportRef.current?.clientWidth ?? 1;
      setViewportWidth(Math.max(width, 1));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const nextCurrentMonth = getMonthStart(currentDate);
    if (!isSameMonthValue(displayDate, nextCurrentMonth)) {
      setDisplayDate(nextCurrentMonth);
    }
  }, [currentDate, displayDate]);

  useEffect(() => {
    if (!monthAnimation) return;
    const timer = window.setTimeout(() => setMonthAnimation(null), 260);
    return () => window.clearTimeout(timer);
  }, [monthAnimation]);

  const isMobileViewport = () => typeof window !== 'undefined' && window.innerWidth < 768;

  const shouldIgnoreSwipeTarget = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return false;
    return Boolean(
      target.closest(
        'button, a, input, textarea, select, [role="button"], [draggable="true"], [data-swipe-ignore="true"]'
      )
    );
  };

  const resetSwipeTracking = () => {
    swipeSessionRef.current = {
      active: false,
      startX: 0,
      startY: 0,
      lastX: 0,
      lastY: 0,
      axisLock: null
    };
  };

  const navigateToMonth = (nextDate: Date, direction: 'next' | 'prev' | null = null) => {
    const nextMonth = getMonthStart(nextDate);
    setSwipeOffsetX(0);
    setIsSwipeDragging(false);
    setMonthAnimation(direction);
    setDisplayDate(nextMonth);
    onDateChange(nextMonth);
  };

  const handlePrevMonth = () => navigateToMonth(shiftMonth(displayDate, -1), 'prev');

  const handleNextMonth = () => navigateToMonth(shiftMonth(displayDate, 1), 'next');

  const handleToday = () => {
    const targetMonth = getMonthStart(new Date());
    const monthDistance =
      (targetMonth.getFullYear() - displayDate.getFullYear()) * 12 +
      (targetMonth.getMonth() - displayDate.getMonth());

    const direction = monthDistance > 0 ? 'next' : monthDistance < 0 ? 'prev' : null;
    navigateToMonth(targetMonth, direction);
  };

  const handleTouchStart = (event: React.TouchEvent) => {
    if (!isMobileViewport()) return;
    if (shouldIgnoreSwipeTarget(event.target)) return;
    if (event.touches.length === 0) return;

    const touch = event.touches[0];
    swipeSessionRef.current = {
      active: true,
      startX: touch.clientX,
      startY: touch.clientY,
      lastX: touch.clientX,
      lastY: touch.clientY,
      axisLock: null
    };
    setIsSwipeDragging(false);
  };

  const handleTouchMove = (event: React.TouchEvent) => {
    if (!isMobileViewport()) return;
    if (!swipeSessionRef.current.active || event.touches.length === 0) return;

    const touch = event.touches[0];
    swipeSessionRef.current.lastX = touch.clientX;
    swipeSessionRef.current.lastY = touch.clientY;

    const deltaX = swipeSessionRef.current.lastX - swipeSessionRef.current.startX;
    const deltaY = swipeSessionRef.current.lastY - swipeSessionRef.current.startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (swipeSessionRef.current.axisLock === null) {
      if (absX < 8 && absY < 8) return;
      if (absX > absY + 10) {
        swipeSessionRef.current.axisLock = 'horizontal';
      } else if (absY > absX + 10) {
        swipeSessionRef.current.axisLock = 'vertical';
      } else {
        return;
      }
    }

    if (swipeSessionRef.current.axisLock !== 'horizontal') return;
    const resistanceThreshold = Math.min(96, viewportWidth * 0.18);
    const resistedDelta =
      absX <= resistanceThreshold
        ? deltaX
        : Math.sign(deltaX) * (resistanceThreshold + (absX - resistanceThreshold) * 0.42);

    setSwipeOffsetX(resistedDelta);
    setIsSwipeDragging(true);
    event.preventDefault();
  };

  const handleTouchEnd = (event: React.TouchEvent) => {
    if (!isMobileViewport()) return;
    if (!swipeSessionRef.current.active) return;

    const touch = event.changedTouches[0];
    if (touch) {
      swipeSessionRef.current.lastX = touch.clientX;
      swipeSessionRef.current.lastY = touch.clientY;
    }

    const deltaX = swipeSessionRef.current.lastX - swipeSessionRef.current.startX;
    const horizontalSwipe = swipeSessionRef.current.axisLock === 'horizontal';
    const shouldChangeMonth =
      horizontalSwipe && Math.abs(deltaX) >= Math.max(72, viewportWidth * 0.18);

    if (shouldChangeMonth) {
      navigateToMonth(
        shiftMonth(displayDate, deltaX < 0 ? 1 : -1),
        deltaX < 0 ? 'next' : 'prev'
      );
      resetSwipeTracking();
      return;
    }

    setIsSwipeDragging(false);
    setSwipeOffsetX(0);
    resetSwipeTracking();
  };

  const handleTouchCancel = () => {
    if (!swipeSessionRef.current.active) return;
    setIsSwipeDragging(false);
    setSwipeOffsetX(0);
    resetSwipeTracking();
  };

  const handleAiAnalyze = async () => {
    setLoadingAi(true);
    const result = await analyzeSchedule(displayDate, appointments, customers);
    setAiAnalysis(result);
    setLoadingAi(false);
  };

  const handleDragStart = (event: React.DragEvent, appointmentId: string) => {
    event.stopPropagation();
    event.dataTransfer.setData('appointmentId', appointmentId);
    event.dataTransfer.setData('text/plain', appointmentId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setDragImage(event.currentTarget as HTMLElement, 8, 8);
  };

  const handleDragOver = (event: React.DragEvent, date: Date) => {
    event.preventDefault();
    if (dragOverDate?.getTime() !== date.getTime()) {
      setDragOverDate(date);
    }
  };

  const handleDragEnter = (event: React.DragEvent, date: Date) => {
    event.preventDefault();
    if (dragOverDate?.getTime() !== date.getTime()) {
      setDragOverDate(date);
    }
  };

  const handleDragLeave = (event: React.DragEvent, date: Date) => {
    event.preventDefault();
    if (dragOverDate?.getTime() === date.getTime()) {
      setDragOverDate(null);
    }
  };

  const handleDrop = (event: React.DragEvent, targetDate: Date) => {
    event.preventDefault();
    const appointmentId = event.dataTransfer.getData('appointmentId');
    if (appointmentId) {
      onAppointmentMove(appointmentId, targetDate);
    }
    setDragOverDate(null);
  };

  const handleDragEnd = () => {
    setDragOverDate(null);
  };

  const monthName = displayDate.toLocaleString('he-IL', { month: 'long', year: 'numeric' });
  const monthAnimationClass =
    monthAnimation === 'next'
      ? 'calendar-month-slide-next'
      : monthAnimation === 'prev'
        ? 'calendar-month-slide-prev'
        : '';
  const swipeProgress = Math.min(Math.abs(swipeOffsetX) / Math.max(viewportWidth, 1), 1);
  const monthPanelStyle =
    isSwipeDragging || swipeOffsetX !== 0
      ? {
          transform: `translate3d(${swipeOffsetX}px, 0, 0) scale(${1 - swipeProgress * 0.015})`,
          opacity: 1 - swipeProgress * 0.18,
          transition: isSwipeDragging
            ? 'none'
            : 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms cubic-bezier(0.22, 1, 0.36, 1)',
          willChange: 'transform, opacity'
        }
      : undefined;

  const renderMonthGrid = (cells: DayCell[]) => {
    return (
      <div
        className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_0.7fr] md:grid-cols-7 gap-px bg-slate-200/80"
        style={{
          gridTemplateRows: 'repeat(6, minmax(112px, 1fr))',
          minHeight: '672px'
        }}
      >
        {cells.map((cell) => {
          const isDragTarget =
            dragOverDate &&
            dragOverDate.getDate() === cell.date.getDate() &&
            dragOverDate.getMonth() === cell.date.getMonth() &&
            dragOverDate.getFullYear() === cell.date.getFullYear();
          const activeEvents = cell.events.filter((event) => event.status !== 'CANCELLED');
          const uniqueCustomerCount = new Set(activeEvents.map((event) => event.customerId)).size;
          const displayEvents = cell.events.slice(0, 4);
          const displaySpecialEvents = cell.specialEvents.slice(0, 2);

          return (
            <div
              key={cell.date.toISOString()}
              onClick={() => onDayClick(cell.date)}
              onDragOver={(event) => handleDragOver(event, cell.date)}
              onDragEnter={(event) => handleDragEnter(event, cell.date)}
              onDragLeave={(event) => handleDragLeave(event, cell.date)}
              onDrop={(event) => handleDrop(event, cell.date)}
              className={`
                relative bg-white p-1.5 md:p-2 transition-colors cursor-pointer group flex flex-col justify-between min-h-[82px] sm:min-h-[96px] md:min-h-[112px] overflow-hidden
                ${cell.isToday ? 'bg-blue-50/95 ring-2 ring-inset ring-blue-300 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.15)] z-10' : 'hover:bg-slate-50'}
                ${isDragTarget ? 'bg-blue-50 ring-2 ring-inset ring-blue-300' : ''}
              `}
            >
              <div className="flex justify-between items-start pointer-events-none mb-1">
                <div className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 bg-blue-100 rounded-full text-blue-600 pointer-events-auto">
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      onDayAddAppointment(cell.date);
                    }}
                    className="flex items-center justify-center"
                    aria-label="הוסף תור"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  {cell.holiday && (
                    <span
                      className="text-[8px] md:text-[9px] font-bold text-pink-600 bg-pink-50 px-1 py-0.5 rounded-md truncate max-w-[54px] md:max-w-[60px]"
                      title={cell.holiday}
                    >
                      {cell.holiday}
                    </span>
                  )}

                  <div
                    className={`
                      w-6 h-6 md:w-7 md:h-7 flex items-center justify-center rounded-full text-[12px] md:text-sm font-extrabold tracking-[-0.02em] transition-all
                      ${
                        cell.isToday
                          ? 'bg-blue-600 text-white shadow-sm'
                          : cell.isCurrentMonth
                            ? 'text-gray-600 group-hover:bg-gray-100'
                            : 'text-slate-400 group-hover:bg-slate-100'
                      }
                    `}
                  >
                    {cell.date.getDate()}
                  </div>
                </div>
              </div>

              {uniqueCustomerCount > 0 && (
                <div className="hidden sm:flex justify-end mb-1">
                  <div className="text-[9px] md:text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded-full tracking-[0.01em]">
                    {uniqueCustomerCount} לקוחות
                  </div>
                </div>
              )}

              <div className="space-y-0.5 overflow-hidden flex-1 max-h-[56px] sm:max-h-[68px] md:max-h-[82px]">
                {displaySpecialEvents.map((event) => (
                  <div
                    key={event.id}
                    onMouseDown={(clickEvent) => {
                      clickEvent.stopPropagation();
                    }}
                    onClick={(clickEvent) => {
                      clickEvent.stopPropagation();
                      onCalendarEventClick(event);
                    }}
                    className="flex items-center gap-1 h-4 sm:h-[18px] text-[9px] sm:text-[10px] leading-[1.15] px-1 sm:px-1.5 rounded-md truncate border border-orange-200 bg-gradient-to-l from-orange-50 to-amber-50 text-orange-800 font-semibold tracking-[-0.01em] hover:brightness-95 transition cursor-pointer"
                    title={event.title}
                    aria-label={`עריכת אירוע: ${event.title}`}
                  >
                    <span className="truncate">אירוע: {event.title}</span>
                  </div>
                ))}

                {displayEvents.map((appointment) => {
                  const customer = customers.find((item) => item.id === appointment.customerId);
                  const isCancelled = appointment.status === 'CANCELLED';
                  const isCompleted = appointment.status === 'COMPLETED';
                  const timeLabel = appointment.date.toLocaleTimeString('he-IL', {
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

                  return (
                    <div
                      key={appointment.id}
                      onMouseDown={(event) => {
                        event.stopPropagation();
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                        onAppointmentClick(appointment);
                      }}
                      className={`calendar-event flex items-center gap-1 h-4 sm:h-[18px] text-[9px] sm:text-[10px] leading-[1.15] px-1 sm:px-1.5 rounded-md truncate border transition-colors cursor-grab active:cursor-grabbing shadow-sm hover:brightness-95 select-none font-semibold tracking-[-0.01em] ${statusClasses}`}
                      title={`${timeLabel} - ${fullNameLabel}`}
                    >
                      <span
                        className="hidden sm:flex items-center text-[9px] text-gray-500 pr-1 cursor-grab active:cursor-grabbing select-none"
                        draggable
                        onDragStart={(event) => handleDragStart(event, appointment.id)}
                        onDragEnd={handleDragEnd}
                        title="גרור להזזה"
                        aria-label="גרור להזזה"
                      >
                        ::
                      </span>
                      <span className="truncate font-medium sm:hidden">{shortNameLabel}</span>
                      <span className="truncate font-medium hidden sm:inline">{fullNameLabel}</span>
                    </div>
                  );
                })}
              </div>

              {(cell.events.length > 0 || cell.specialEvents.length > 0) && (
                <div className="absolute z-50 bottom-full right-1/2 translate-x-1/2 mb-2 hidden group-hover:block w-64 bg-pink-100 text-fuchsia-950 text-xs rounded-xl p-3 shadow-2xl border border-pink-200 pointer-events-none animate-in fade-in zoom-in-95 duration-150">
                  <div className="font-bold border-b border-pink-200 pb-2 mb-2 flex items-center gap-2">
                    <Clock className="w-3 h-3 text-gray-400" />
                    {cell.date.toLocaleDateString('he-IL')}
                  </div>
                  <div className="space-y-2">
                    {cell.specialEvents.map((event) => (
                      <div key={event.id} className="flex justify-between items-center gap-2">
                        <span className="text-orange-700 font-mono">
                          {event.date.toLocaleTimeString('he-IL', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                        <div className="text-right truncate flex-1">
                          <span className="font-bold block truncate text-orange-900">{event.title}</span>
                          <span className="text-orange-700 text-[10px] block truncate">אירוע אישי</span>
                        </div>
                      </div>
                    ))}

                    {cell.events.map((appointment) => {
                      const customer = customers.find((item) => item.id === appointment.customerId);
                      const isCancelled = appointment.status === 'CANCELLED';
                      const isCompleted = appointment.status === 'COMPLETED';
                      return (
                        <div
                          key={appointment.id}
                          className={`flex justify-between items-center gap-2 ${
                            isCancelled ? 'opacity-50 line-through' : ''
                          }`}
                        >
                          <span className="text-gray-400 font-mono">
                            {appointment.date.toLocaleTimeString('he-IL', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                          <div className="text-right truncate flex-1">
                            <span className={`font-bold block truncate ${isCompleted ? 'text-green-700' : 'text-gray-800'}`}>
                              {customer ? customer.name : 'לקוח לא ידוע'}
                              {customer?.petName && (
                                <span className="text-gray-400 font-normal mr-1">({customer.petName})</span>
                              )}
                            </span>
                            <span className="text-gray-500 text-[10px] block truncate">{appointment.service}</span>
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
    );
  };

  return (
    <div className="calendar-swipe-surface flex-1 min-h-0 min-w-0 bg-white/92 m-0 md:m-2 rounded-none md:rounded-[28px] shadow-sm flex flex-col overflow-hidden border border-gray-100 backdrop-blur-sm antialiased [text-rendering:optimizeLegibility]">
      <div className="px-3 md:px-5 py-2.5 flex items-center justify-between gap-2 bg-gradient-to-r from-pink-100 via-pink-50 to-rose-100 sticky top-0 z-10 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2 md:gap-4 min-w-0">
          <h2 className="text-lg sm:text-xl md:text-2xl font-extrabold text-gray-800 capitalize tracking-normal whitespace-nowrap shrink-0">
            {monthName}
          </h2>

          <div className="hidden md:flex flex-col border-r-2 border-gray-100 pr-4 mr-2">
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">היום</span>
            <div className="flex items-center gap-2 text-sm text-gray-600 font-medium">
              <span>{todayGregorian}</span>
            </div>
          </div>

            <button
              onClick={handleAiAnalyze}
            className="flex items-center gap-1.5 text-xs sm:text-sm text-purple-800 bg-purple-100 hover:bg-purple-200 border border-purple-200 px-2 sm:px-3 py-1.5 rounded-full transition-colors font-medium shrink-0"
              disabled={loadingAi}
            >
            <Sparkles className="w-4 h-4" />
            <span className="hidden sm:inline">{loadingAi ? 'מנתח...' : 'ניתוח יומי'}</span>
          </button>

          {onOpenMessages && (
            <button
              type="button"
              onClick={onOpenMessages}
              className="flex items-center gap-1.5 text-xs sm:text-sm text-emerald-800 bg-emerald-100 hover:bg-emerald-200 border border-emerald-200 px-2 sm:px-3 py-1.5 rounded-full transition-colors font-medium shrink-0"
              aria-label="WhatsApp messages"
            >
              <MessageCircle className="w-4 h-4" />
              <span className="hidden sm:inline">הודעות</span>
            </button>
          )}
        </div>

          <div className="flex items-center gap-1 bg-white p-1 rounded-2xl border border-gray-200 shadow-sm shrink-0">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 hover:bg-slate-50 rounded-xl text-gray-500 hover:text-gray-800 transition-all"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <button
              onClick={handleToday}
              className="px-2 sm:px-3 py-1 hover:bg-slate-50 text-gray-700 text-sm font-bold rounded-xl transition-all"
            >
              היום
            </button>
            <button
              onClick={handleNextMonth}
              className="p-1.5 hover:bg-slate-50 rounded-xl text-gray-500 hover:text-gray-800 transition-all"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          </div>
        </div>

      <div className="hidden md:flex mx-3 mt-1.5 mb-1.5 bg-green-50 text-green-800 text-[11px] border border-green-100 px-3 py-1 rounded-xl items-center justify-between shrink-0">
        <span className="font-bold">סיכום שבועי: {weeklyDogCount}/{weeklyGoal} כלבים</span>
        {weeklyDogCount >= weeklyGoal && (
          <span className="bg-green-600 text-white px-2 py-0.5 rounded-full text-[10px]">מצוין</span>
        )}
      </div>

      {aiAnalysis && (
        <div className="hidden md:flex mx-3 mb-1.5 bg-gradient-to-r from-purple-100 via-pink-50 to-rose-100 px-3 py-1 rounded-xl text-purple-950 text-[11px] border border-purple-200 items-start gap-3 shadow-sm animate-in fade-in slide-in-from-top-2 shrink-0">
          <Sparkles className="w-4 h-4 text-purple-600 flex-shrink-0 mt-0.5" />
          <p className="leading-relaxed font-medium">{aiAnalysis}</p>
        </div>
      )}

      <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_0.7fr] md:grid-cols-7 border-b border-slate-200 px-2 md:px-3 bg-gradient-to-r from-pink-100 via-pink-50 to-rose-100 shrink-0">
        {WEEK_DAYS.map((day) => (
          <div
            key={day}
            className="py-1.5 text-center text-[11px] md:text-xs font-bold tracking-[0.02em] text-gray-500"
          >
            {day}
          </div>
        ))}
      </div>

      <div
        ref={viewportRef}
        onTouchStartCapture={handleTouchStart}
        onTouchMoveCapture={handleTouchMove}
        onTouchEndCapture={handleTouchEnd}
        onTouchCancelCapture={handleTouchCancel}
        className="flex-1 min-h-0 overflow-hidden bg-gradient-to-b from-pink-50 via-pink-50 to-rose-100"
      >
        <div className="h-full px-1 md:px-2 pb-2 pt-1.5">
          <div className="h-full rounded-[24px] overflow-hidden border border-slate-200 bg-slate-200/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
            <div
              className={`h-full overflow-y-auto overflow-x-hidden ${monthAnimationClass}`}
              style={monthPanelStyle}
            >
              {renderMonthGrid(monthCells)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
