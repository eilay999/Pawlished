import React, { useEffect, useMemo, useRef, useState } from 'react';
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

type SwipeAxisLock = 'horizontal' | 'vertical' | null;
type MonthDelta = -1 | 0 | 1;

const getMonthStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);

const shiftMonth = (date: Date, offset: number) =>
  new Date(date.getFullYear(), date.getMonth() + offset, 1);

const isSameMonthValue = (left: Date, right: Date) =>
  getMonthStart(left).getTime() === getMonthStart(right).getTime();

const buildCalendarGrid = (date: Date, appointments: Appointment[]) => {
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

  const prevMonthLastDay = new Date(year, month, 0).getDate();
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const cellDate = new Date(year, month - 1, prevMonthLastDay - i);
    grid.push({
      date: cellDate,
      isCurrentMonth: false,
      isToday: isDateToday(cellDate),
      events: [],
      holiday: getJewishHoliday(cellDate)
    });
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const cellDate = new Date(year, month, day);
    const dayEvents = appointments
      .filter(app =>
        app.date.getDate() === day &&
        app.date.getMonth() === month &&
        app.date.getFullYear() === year
      )
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    grid.push({
      date: cellDate,
      isCurrentMonth: true,
      isToday: isDateToday(cellDate),
      events: dayEvents,
      holiday: getJewishHoliday(cellDate)
    });
  }

  const remainingCells = 42 - grid.length;
  for (let i = 1; i <= remainingCells; i++) {
    const cellDate = new Date(year, month + 1, i);
    grid.push({
      date: cellDate,
      isCurrentMonth: false,
      isToday: isDateToday(cellDate),
      events: [],
      holiday: getJewishHoliday(cellDate)
    });
  }

  return grid;
};

export const Calendar: React.FC<CalendarProps> = ({
  currentDate,
  onDateChange,
  appointments,
  customers,
  onCustomerClick: _onCustomerClick,
  onDayClick,
  onDayAddAppointment,
  onAppointmentClick,
  onAppointmentMove
}) => {
  const [displayDate, setDisplayDate] = useState(() => getMonthStart(currentDate));
  const [aiAnalysis, setAiAnalysis] = useState<string>('');
  const [loadingAi, setLoadingAi] = useState(false);
  const [dragOverDate, setDragOverDate] = useState<Date | null>(null);
  const [swipeOffsetX, setSwipeOffsetX] = useState(0);
  const [isSwipeDragging, setIsSwipeDragging] = useState(false);
  const [isSwipeAnimating, setIsSwipeAnimating] = useState(false);
  const [pendingMonthDelta, setPendingMonthDelta] = useState<MonthDelta>(0);
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
  const suppressClickRef = useRef(false);

  const today = new Date();
  const todayGregorian = today.toLocaleDateString('he-IL', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
  const weeklyGoal = 12;
  const weekStart = new Date(displayDate);
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

  const calendarGrid = useMemo(
    () => buildCalendarGrid(displayDate, appointments),
    [displayDate, appointments]
  );

  useEffect(() => {
    const nextWidth = viewportRef.current?.clientWidth ?? 1;
    setViewportWidth(Math.max(nextWidth, 1));

    if (typeof ResizeObserver !== 'undefined' && viewportRef.current) {
      const observer = new ResizeObserver(entries => {
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
    if (isSwipeDragging || isSwipeAnimating) return;
    if (!isSameMonthValue(displayDate, nextCurrentMonth)) {
      setDisplayDate(nextCurrentMonth);
    }
  }, [currentDate, displayDate, isSwipeAnimating, isSwipeDragging]);

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

  const applySwipeResistance = (deltaX: number) => {
    const maxOffset = viewportWidth * 0.9;
    const clamped = Math.max(-maxOffset, Math.min(maxOffset, deltaX));
    const overflow = Math.max(0, Math.abs(clamped) - viewportWidth * 0.72);
    return Math.sign(clamped) * (Math.abs(clamped) - overflow * 0.5);
  };

  const navigateToMonth = (nextDate: Date) => {
    const nextMonth = getMonthStart(nextDate);
    setDisplayDate(nextMonth);
    onDateChange(nextMonth);
  };

  const handlePrevMonth = () => {
    if (isSwipeAnimating) return;
    navigateToMonth(shiftMonth(displayDate, -1));
  };

  const handleNextMonth = () => {
    if (isSwipeAnimating) return;
    navigateToMonth(shiftMonth(displayDate, 1));
  };

  const handleToday = () => {
    if (isSwipeAnimating) return;
    navigateToMonth(new Date());
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!isMobileViewport() || isSwipeAnimating) return;
    if (shouldIgnoreSwipeTarget(e.target)) return;
    if (e.touches.length === 0) return;

    const touch = e.touches[0];
    suppressClickRef.current = false;
    swipeSessionRef.current = {
      active: true,
      startX: touch.clientX,
      startY: touch.clientY,
      lastX: touch.clientX,
      lastY: touch.clientY,
      axisLock: null
    };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isMobileViewport() || isSwipeAnimating) return;
    if (!swipeSessionRef.current.active || e.touches.length === 0) return;

    const touch = e.touches[0];
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

    setIsSwipeDragging(true);
    setSwipeOffsetX(applySwipeResistance(deltaX));
    e.preventDefault();
  };

  const animateMonthBack = () => {
    if (Math.abs(swipeOffsetX) < 1) {
      setPendingMonthDelta(0);
      setIsSwipeDragging(false);
      setIsSwipeAnimating(false);
      setSwipeOffsetX(0);
      return;
    }

    setPendingMonthDelta(0);
    setIsSwipeDragging(false);
    setIsSwipeAnimating(true);
    setSwipeOffsetX(0);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!isMobileViewport() || isSwipeAnimating) return;
    if (!swipeSessionRef.current.active) return;

    const touch = e.changedTouches[0];
    if (touch) {
      swipeSessionRef.current.lastX = touch.clientX;
      swipeSessionRef.current.lastY = touch.clientY;
    }

    const deltaX = swipeSessionRef.current.lastX - swipeSessionRef.current.startX;
    const horizontalSwipe = swipeSessionRef.current.axisLock === 'horizontal';
    const shouldSuppressClick = horizontalSwipe && Math.abs(deltaX) >= 18;
    const shouldChangeMonth =
      horizontalSwipe &&
      Math.abs(deltaX) >= Math.max(72, viewportWidth * 0.18);

    if (shouldSuppressClick) {
      suppressClickRef.current = true;
    }

    if (shouldChangeMonth) {
      const monthDelta: MonthDelta = deltaX < 0 ? 1 : -1;
      setPendingMonthDelta(monthDelta);
      setIsSwipeDragging(false);
      setIsSwipeAnimating(true);
      setSwipeOffsetX(monthDelta === 1 ? -viewportWidth : viewportWidth);
      resetSwipeTracking();
      return;
    }

    animateMonthBack();
    resetSwipeTracking();
  };

  const handleTouchCancel = () => {
    if (!swipeSessionRef.current.active && swipeOffsetX === 0) return;
    resetSwipeTracking();
    animateMonthBack();
  };

  const handleSwipeTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || e.propertyName !== 'transform') return;

    if (pendingMonthDelta === 0) {
      setIsSwipeAnimating(false);
      return;
    }

    const nextDate = shiftMonth(displayDate, pendingMonthDelta);
    setPendingMonthDelta(0);
    setIsSwipeAnimating(false);
    setSwipeOffsetX(0);
    navigateToMonth(nextDate);
  };

  const handleClickCapture = (e: React.MouseEvent) => {
    if (!suppressClickRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    suppressClickRef.current = false;
  };

  const handleAiAnalyze = async () => {
    setLoadingAi(true);
    const result = await analyzeSchedule(displayDate, appointments, customers);
    setAiAnalysis(result);
    setLoadingAi(false);
  };

  const handleDragStart = (e: React.DragEvent, appointmentId: string) => {
    e.stopPropagation();
    e.dataTransfer.setData('appointmentId', appointmentId);
    e.dataTransfer.setData('text/plain', appointmentId);
    e.dataTransfer.effectAllowed = 'move';
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
    const appointmentId = e.dataTransfer.getData('appointmentId');
    if (appointmentId) {
      onAppointmentMove(appointmentId, targetDate);
    }
    setDragOverDate(null);
  };

  const handleDragEnd = () => {
    setDragOverDate(null);
  };

  const monthName = displayDate.toLocaleString('he-IL', { month: 'long', year: 'numeric' });
  const weeks: DayCell[][] = [];
  for (let i = 0; i < calendarGrid.length; i += 7) {
    weeks.push(calendarGrid.slice(i, i + 7));
  }
  const visibleWeeks = weeks.filter(week => week.some(cell => cell.isCurrentMonth));
  const monthSwipeStyle = {
    transform: `translate3d(${swipeOffsetX}px, 0, 0)`,
    transition: isSwipeAnimating ? 'transform 280ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none',
    willChange: isSwipeDragging || isSwipeAnimating ? 'transform' : undefined
  } as const;

  return (
    <div
      className="calendar-swipe-surface flex-1 min-h-0 min-w-0 bg-white/90 m-0 md:m-3 rounded-none md:rounded-2xl shadow-sm flex flex-col overflow-hidden border border-gray-100 backdrop-blur-sm antialiased [text-rendering:optimizeLegibility]"
      onClickCapture={handleClickCapture}
      onTouchStartCapture={handleTouchStart}
      onTouchMoveCapture={handleTouchMove}
      onTouchEndCapture={handleTouchEnd}
      onTouchCancelCapture={handleTouchCancel}
    >
      <div className="px-3 md:px-5 py-2 md:py-2.5 flex items-center justify-between bg-gradient-to-r from-slate-50 via-white to-gray-50 sticky top-0 z-10 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-4">
          <h2 className="text-[1.35rem] md:text-2xl font-extrabold text-gray-800 capitalize tracking-[-0.03em]">
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
            className="flex items-center gap-2 text-sm text-purple-600 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-full transition-colors font-medium"
            disabled={loadingAi}
          >
            <Sparkles className="w-4 h-4" />
            {loadingAi ? 'מנתח...' : 'ניתוח יומי'}
          </button>
        </div>

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

      <div className="hidden md:flex mx-3 md:mx-4 mt-1 md:mt-1.5 mb-1 md:mb-1.5 bg-green-50 text-green-800 text-[11px] border border-green-100 px-3 py-1 rounded-xl items-center justify-between shrink-0">
        <span className="font-bold">סיכום שבועי: {weeklyDogCount}/{weeklyGoal} כלבים</span>
        {weeklyDogCount >= weeklyGoal && (
          <span className="bg-green-600 text-white px-2 py-0.5 rounded-full text-[10px]">מצוין</span>
        )}
      </div>
      {aiAnalysis && (
          <div className="hidden md:flex mx-3 md:mx-4 mb-1 md:mb-1.5 bg-gradient-to-r from-purple-50 to-white px-3 py-1 rounded-xl text-purple-900 text-[11px] border border-purple-100 items-start gap-3 shadow-sm animate-in fade-in slide-in-from-top-2 shrink-0">
          <Sparkles className="w-4 h-4 text-purple-600 flex-shrink-0 mt-0.5" />
          <p className="leading-relaxed font-medium">{aiAnalysis}</p>
        </div>
      )}

      <div ref={viewportRef} className="flex-1 min-h-0 overflow-hidden">
        <div
          className="flex h-full min-h-0 min-w-0 flex-col"
          style={monthSwipeStyle}
          onTransitionEnd={handleSwipeTransitionEnd}
        >
          <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_0.7fr] md:grid-cols-7 border-b border-slate-200 px-3 md:px-5 bg-gradient-to-r from-slate-100 via-white to-slate-50 shrink-0">
            {WEEK_DAYS.map(day => (
              <div key={day} className="py-1 md:py-1.5 text-center text-[11px] md:text-xs font-bold tracking-[0.02em] text-gray-500">
                {day}
              </div>
            ))}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-1.5 sm:px-3 md:px-4 pb-2.5 md:pb-3 pt-1 md:pt-1.5 bg-gradient-to-b from-slate-50 via-white to-slate-100/60">
            <div className="min-h-full flex flex-col gap-1 sm:gap-2">
              {visibleWeeks.map((week, weekIndex) => (
                <div
                  key={`week-${weekIndex}`}
                  className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_0.7fr] md:grid-cols-7 gap-1 sm:gap-2 flex-1 min-h-0"
                >
                  {week.map(cell => {
                    if (!cell.isCurrentMonth) {
                      return (
                        <div
                          key={cell.date.toISOString()}
                          className="rounded-2xl min-h-[78px] sm:min-h-[90px] md:min-h-[104px] border border-transparent bg-slate-100/50 pointer-events-none"
                        />
                      );
                    }

                    const isDragTarget =
                      dragOverDate &&
                      dragOverDate.getDate() === cell.date.getDate() &&
                      dragOverDate.getMonth() === cell.date.getMonth() &&
                      dragOverDate.getFullYear() === cell.date.getFullYear();
                    const activeEvents = cell.events.filter(e => e.status !== 'CANCELLED');
                    const uniqueCustomerCount = new Set(activeEvents.map(e => e.customerId)).size;
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
                          relative rounded-2xl p-1.5 md:p-2 transition-all cursor-pointer group flex flex-col justify-between border min-h-[78px] sm:min-h-[90px] md:min-h-[104px] overflow-hidden
                          ${cell.isToday ? 'bg-blue-50/90 border-blue-300 ring-2 ring-blue-100 shadow-md transform scale-[1.01] z-10' : 'bg-white/95 border-slate-300 hover:border-blue-300 hover:shadow-md'}
                          ${isDragTarget ? 'bg-blue-50 border-blue-300 border-dashed ring-1 ring-blue-200' : ''}
                        `}
                      >
                        <div className="flex justify-between items-start pointer-events-none mb-0.5 md:mb-1">
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
                                ${cell.isToday ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 group-hover:bg-gray-100'}
                              `}
                            >
                              {cell.date.getDate()}
                            </div>
                          </div>
                        </div>

                        {uniqueCustomerCount > 0 && (
                          <div className="hidden sm:flex justify-end mb-0.5 md:mb-1">
                            <div className="text-[9px] md:text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded-full tracking-[0.01em]">
                              {uniqueCustomerCount} לקוחות
                            </div>
                          </div>
                        )}

                        <div className="space-y-0.5 overflow-hidden flex-1 max-h-[52px] sm:max-h-[64px] md:max-h-[72px]">
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
                                className={`calendar-event flex items-center gap-1 h-4 sm:h-[18px] text-[9px] sm:text-[10px] leading-[1.15] px-1 sm:px-1.5 rounded-md truncate border transition-colors cursor-grab active:cursor-grabbing shadow-sm hover:brightness-95 select-none font-semibold tracking-[-0.01em] ${statusClasses}`}
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
                                  ::
                                </span>
                                <span className="truncate font-medium sm:hidden">{shortNameLabel}</span>
                                <span className="truncate font-medium hidden sm:inline">{fullNameLabel}</span>
                              </div>
                            );
                          })}
                        </div>

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
                                  <div
                                    key={e.id}
                                    className={`flex justify-between items-center gap-2 ${isCancelled ? 'opacity-50 line-through' : ''}`}
                                  >
                                    <span className="text-gray-400 font-mono">
                                      {e.date.toLocaleTimeString('he-IL', {
                                        hour: '2-digit',
                                        minute: '2-digit'
                                      })}
                                    </span>
                                    <div className="text-right truncate flex-1">
                                      <span className={`font-bold block truncate ${isCompleted ? 'text-green-300' : 'text-white'}`}>
                                        {customer ? customer.name : 'לקוח לא ידוע'}
                                        {customer?.petName && (
                                          <span className="text-gray-400 font-normal mr-1">({customer.petName})</span>
                                        )}
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
  );
};
