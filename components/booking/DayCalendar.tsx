import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { AvailabilityDay } from './api';
import { formatDateLong, formatMonthTitle, todayInIsrael } from './format';

const WEEKDAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

export interface SlotChoice {
  date: string;
  time: string;
}

interface DayCalendarProps {
  days: AvailabilityDay[];
  selected: SlotChoice | null;
  onSelect: (slot: SlotChoice) => void;
}

const openTimes = (day?: AvailabilityDay) => (day?.times ?? []).filter((t) => t.available).map((t) => t.time);

export const DayCalendar: React.FC<DayCalendarProps> = ({ days, selected, onSelect }) => {
  const byDate = useMemo(() => new Map(days.map((day) => [day.date, day])), [days]);
  const months = useMemo(() => Array.from(new Set(days.map((day) => day.date.slice(0, 7)))).sort(), [days]);
  const today = todayInIsrael();

  const firstOpenDate = useMemo(() => days.find((day) => openTimes(day).length > 0)?.date ?? null, [days]);
  const [monthKey, setMonthKey] = useState<string>('');
  const [activeDate, setActiveDate] = useState<string | null>(null);

  useEffect(() => {
    if (!months.length) return;
    setMonthKey((current) => (current && months.includes(current) ? current : (selected?.date ?? firstOpenDate ?? months[0]).slice(0, 7)));
    setActiveDate((current) => current ?? selected?.date ?? firstOpenDate);
  }, [months, firstOpenDate, selected?.date]);

  if (!months.length) {
    return <div className="bk-hint bk-hint-warn">אין כרגע תאריכים פנויים. נסו שוב מאוחר יותר.</div>;
  }

  const shownMonth = months.includes(monthKey) ? monthKey : months[0];
  const monthIndex = months.indexOf(shownMonth);
  const [year, month] = shownMonth.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const leading = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();

  const cells: Array<string | null> = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${shownMonth}-${String(i + 1).padStart(2, '0')}`)
  ];

  const activeDay = activeDate ? byDate.get(activeDate) : undefined;
  const times = openTimes(activeDay);

  return (
    <div>
      <div className="bk-cal-head">
        <button
          type="button"
          className="bk-icon-btn"
          aria-label="החודש הקודם"
          disabled={monthIndex <= 0}
          onClick={() => setMonthKey(months[monthIndex - 1])}
        >
          <ChevronRight size={22} />
        </button>
        <div className="bk-cal-title" aria-live="polite">{formatMonthTitle(shownMonth)}</div>
        <button
          type="button"
          className="bk-icon-btn"
          aria-label="החודש הבא"
          disabled={monthIndex >= months.length - 1}
          onClick={() => setMonthKey(months[monthIndex + 1])}
        >
          <ChevronLeft size={22} />
        </button>
      </div>

      <div className="bk-cal-grid" role="grid" aria-label="בחירת תאריך">
        {WEEKDAYS.map((label) => (
          <div key={label} className="bk-cal-dow" aria-hidden="true">{label}</div>
        ))}
        {cells.map((date, index) => {
          if (!date) return <div key={`blank-${index}`} />;
          const open = openTimes(byDate.get(date)).length > 0;
          return (
            <button
              key={date}
              type="button"
              className="bk-day"
              data-open={open}
              data-today={date === today}
              disabled={!open}
              aria-pressed={activeDate === date}
              aria-label={`${formatDateLong(date)}${open ? '' : ' – אין תורים פנויים'}`}
              onClick={() => setActiveDate(date)}
            >
              {Number(date.slice(8))}
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 20 }}>
        {activeDate && times.length > 0 ? (
          <>
            <div className="bk-h2">{formatDateLong(activeDate)} – בחרו שעה</div>
            <div className="bk-time-grid">
              {times.map((time) => (
                <button
                  key={time}
                  type="button"
                  className="bk-time"
                  aria-pressed={selected?.date === activeDate && selected?.time === time}
                  onClick={() => onSelect({ date: activeDate, time })}
                >
                  {time}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="bk-small">בחרו יום מסומן בלוח כדי לראות שעות פנויות.</div>
        )}
      </div>
    </div>
  );
};
