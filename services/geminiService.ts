import { supabase } from './supabaseClient';

const toLocalDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;

export const analyzeSchedule = async (date: Date): Promise<string> => {
  try {
    const { data } = (await supabase?.auth.getSession()) || { data: { session: null } };
    const token = data.session?.access_token;
    if (!token) return 'יש להתחבר מחדש כדי להפעיל את הניתוח.';

    const response = await fetch('/api/analyze-schedule', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ date: toLocalDateKey(date) })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return payload.error === 'AI service unavailable'
        ? 'שירות הניתוח עדיין לא הוגדר.'
        : 'לא ניתן לנתח את הלו״ז כרגע.';
    }

    return payload.analysis || 'אין המלצות כרגע.';
  } catch {
    return 'לא ניתן לנתח את הלו״ז. נסה שוב בעוד רגע.';
  }
};
