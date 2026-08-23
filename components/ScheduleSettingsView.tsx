import React, { useMemo, useState } from 'react';
import { Clock, Save } from 'lucide-react';

type WeeklySlots = Record<string, string[]>;

const DAY_LABELS: Array<{ key: string; label: string }> = [
  { key: '0', label: 'ראשון' },
  { key: '1', label: 'שני' },
  { key: '2', label: 'שלישי' },
  { key: '3', label: 'רביעי' },
  { key: '4', label: 'חמישי' },
  { key: '5', label: 'שישי' },
  { key: '6', label: 'שבת' }
];

const normalizeTime = (value: string) => {
  const trimmed = String(value || '').trim();
  const match = trimmed.match(/^([01]?\d|2[0-3])(?::([0-5]\d))?$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2] || '0');
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const parseTimesText = (value: string) => {
  const raw = String(value || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  raw.forEach((token) => {
    const normalized = normalizeTime(token);
    if (normalized) {
      seen.add(normalized);
    }
  });

  return Array.from(seen).sort();
};

export const ScheduleSettingsView: React.FC<{
  weeklySlots: WeeklySlots;
  maxBookingDaysAhead: number;
  onSave: (payload: { weeklySlots: WeeklySlots; maxBookingDaysAhead: number }) => Promise<void>;
}> = ({ weeklySlots, maxBookingDaysAhead, onSave }) => {
  const [draftWeeklySlotsText, setDraftWeeklySlotsText] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    DAY_LABELS.forEach(({ key }) => {
      initial[key] = (weeklySlots?.[key] || []).join(', ');
    });
    return initial;
  });
  const [draftMaxDays, setDraftMaxDays] = useState(() => String(maxBookingDaysAhead || 30));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const normalizedPreview = useMemo(() => {
    const normalized: WeeklySlots = {};
    DAY_LABELS.forEach(({ key }) => {
      normalized[key] = parseTimesText(draftWeeklySlotsText[key] || '');
    });
    return normalized;
  }, [draftWeeklySlotsText]);

  const handleSave = async () => {
    setError(null);
    const numeric = Number(draftMaxDays);
    const maxDays = Number.isFinite(numeric) ? Math.round(numeric) : 30;
    const clampedMaxDays = Math.min(30, Math.max(1, maxDays));

    const hasAnySlots = Object.values(normalizedPreview).some(
      (slots) => Array.isArray(slots) && slots.length > 0
    );
    if (!hasAnySlots) {
      setError('חייבים להגדיר לפחות שעה אחת ביום כלשהו.');
      return;
    }

    setIsSaving(true);
    try {
      await onSave({ weeklySlots: normalizedPreview, maxBookingDaysAhead: clampedMaxDays });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שמירה נכשלה.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex-1 bg-white/90 m-3 rounded-2xl shadow-sm flex flex-col overflow-y-auto border border-gray-100 custom-scrollbar backdrop-blur-sm">
      <div className="p-8 pb-6 border-b border-gray-100 bg-gradient-to-r from-rose-50 via-pink-50 to-white">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-rose-600 text-white flex items-center justify-center shadow-sm shadow-rose-200">
            <Clock className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <h2 className="text-2xl font-extrabold text-gray-900 leading-tight">שעות עבודה</h2>
            <p className="text-sm text-gray-600">
              כאן מגדירים באילו ימים עובדים ובאילו שעות ניתן לקבוע תורים. הלקוח יוכל לקבוע עד חודש קדימה.
            </p>
          </div>
        </div>
      </div>

      <div className="p-8 space-y-6">
        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 text-rose-900 text-sm px-4 py-3">
            {error}
          </div>
        )}

        <div className="grid gap-4">
          {DAY_LABELS.map(({ key, label }) => (
            <div key={key} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="font-bold text-gray-800">{label}</div>
                <div className="text-xs text-gray-500">
                  {normalizedPreview[key]?.length ? `${normalizedPreview[key].length} שעות` : 'סגור'}
                </div>
              </div>

              <input
                value={draftWeeklySlotsText[key] || ''}
                onChange={(e) => setDraftWeeklySlotsText((prev) => ({ ...prev, [key]: e.target.value }))}
                placeholder="לדוגמה: 09:00, 12:00, 15:00"
                className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-rose-200 focus:border-rose-200"
              />
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="text-sm font-semibold text-gray-800 mb-2">הגבלת קביעת תורים מראש</div>
          <div className="text-xs text-gray-600 mb-3">מוגבל ל-30 ימים (חודש) לכל היותר.</div>
          <input
            type="number"
            min={1}
            max={30}
            value={draftMaxDays}
            onChange={(e) => setDraftMaxDays(e.target.value)}
            className="w-32 rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-rose-200 focus:border-rose-200"
          />
        </div>

        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={isSaving}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 text-white font-semibold px-6 py-3 shadow-sm transition"
        >
          <Save className="w-4 h-4" />
          {isSaving ? 'שומר...' : 'שמור שינויים'}
        </button>
      </div>
    </div>
  );
};
