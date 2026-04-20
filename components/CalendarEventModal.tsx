import React, { useEffect, useState } from 'react';
import { CalendarDays, Clock3, Save, Sparkles, Trash2, X } from 'lucide-react';
import { CalendarEvent } from '../types';

interface CalendarEventModalProps {
  isOpen: boolean;
  initialDate: Date;
  calendarEvent?: CalendarEvent | null;
  onClose: () => void;
  onSave: (event: CalendarEvent) => void;
  onDelete?: (eventId: string) => void;
}

const formatDateInput = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatTimeInput = (date: Date) => {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

export const CalendarEventModal: React.FC<CalendarEventModalProps> = ({
  isOpen,
  initialDate,
  calendarEvent,
  onClose,
  onSave,
  onDelete
}) => {
  const [title, setTitle] = useState('');
  const [dateValue, setDateValue] = useState(formatDateInput(initialDate));
  const [timeValue, setTimeValue] = useState('08:00');
  const isEditMode = Boolean(calendarEvent);

  useEffect(() => {
    if (!isOpen) return;

    if (calendarEvent) {
      const eventDate = new Date(calendarEvent.date);
      setTitle(calendarEvent.title);
      setDateValue(formatDateInput(eventDate));
      setTimeValue(formatTimeInput(eventDate));
      return;
    }

    setTitle('');
    setDateValue(formatDateInput(initialDate));
    setTimeValue('08:00');
  }, [calendarEvent, initialDate, isOpen]);

  if (!isOpen) return null;

  const isValid = title.trim().length > 0 && dateValue.trim().length > 0;

  const handleSubmit = () => {
    if (!isValid) return;

    const safeTime = timeValue.trim() || '08:00';
    const startsAt = new Date(`${dateValue}T${safeTime}:00`);

    onSave({
      id: calendarEvent?.id ?? crypto.randomUUID(),
      title: title.trim(),
      date: startsAt,
      kind: calendarEvent?.kind ?? 'EVENT',
      colorKey: calendarEvent?.colorKey ?? 'PERSONAL',
      showInCalendar: calendarEvent?.showInCalendar ?? true,
      blocksTime: calendarEvent?.blocksTime ?? false,
      notes: calendarEvent?.notes
    });
  };

  const handleDelete = () => {
    if (!calendarEvent || !onDelete) return;
    const confirmed = window.confirm('למחוק את האירוע הזה?');
    if (!confirmed) return;
    onDelete(calendarEvent.id);
  };

  return (
    <div className="fixed inset-0 z-[170] bg-slate-950/45 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-[28px] border border-orange-200 bg-white shadow-[0_32px_90px_rgba(15,23,42,0.22)] overflow-hidden">
        <div className="flex items-start justify-between px-6 py-5 bg-gradient-to-l from-orange-950/40 via-slate-950 to-slate-950 border-b border-orange-100">
          <div className="text-right">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-100 text-orange-800 text-xs font-bold">
              <Sparkles className="w-3.5 h-3.5" />
              אירוע אישי
            </div>
            <h3 className="mt-3 text-2xl font-black tracking-[-0.03em] text-slate-900">הוספת אירוע</h3>
            <p className="mt-1 text-sm text-slate-500">
              האירוע יופיע בצבע שונה ביומן ויקבל תזכורת בבוקר.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full text-slate-400 hover:bg-white hover:text-slate-700 transition-colors"
            aria-label="סגירה"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <label className="block text-right">
            <span className="mb-2 block text-sm font-bold text-slate-700">שם האירוע</span>
            <div className="relative">
              <CalendarDays className="absolute right-3 top-3.5 w-4 h-4 text-orange-500" />
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="למשל חתונה ליגל"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 pr-10 pl-4 py-3 text-right text-slate-800 outline-none transition focus:border-orange-300 focus:bg-white focus:ring-4 focus:ring-orange-100"
              />
            </div>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-right">
              <span className="mb-2 block text-sm font-bold text-slate-700">תאריך</span>
              <input
                type="date"
                value={dateValue}
                onChange={(event) => setDateValue(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-right text-slate-800 outline-none transition focus:border-orange-300 focus:bg-white focus:ring-4 focus:ring-orange-100"
              />
            </label>

            <label className="block text-right">
              <span className="mb-2 block text-sm font-bold text-slate-700">שעה להצגה</span>
              <div className="relative">
                <Clock3 className="absolute right-3 top-3.5 w-4 h-4 text-orange-500" />
                <input
                  type="time"
                  value={timeValue}
                  onChange={(event) => setTimeValue(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 pr-10 pl-4 py-3 text-right text-slate-800 outline-none transition focus:border-orange-300 focus:bg-white focus:ring-4 focus:ring-orange-100"
                />
              </div>
            </label>
          </div>
        </div>

        <div className="px-6 pb-6 flex gap-3">
          {isEditMode && onDelete && (
            <button
              type="button"
              onClick={handleDelete}
              className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 font-bold text-rose-600 hover:bg-rose-100 transition-colors inline-flex items-center justify-center"
              title="מחק אירוע"
              aria-label="מחק אירוע"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 font-bold text-slate-600 hover:bg-slate-50 transition-colors"
          >
            ביטול
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isValid}
            className="flex-1 rounded-2xl bg-gradient-to-l from-orange-500 to-amber-500 px-4 py-3 font-bold text-white shadow-lg shadow-orange-200 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            שמירת אירוע
          </button>
        </div>
      </div>
    </div>
  );
};
