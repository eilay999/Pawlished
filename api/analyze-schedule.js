import { GoogleGenAI } from '@google/genai';
import { requireAdmin, toAdminApiError } from './_lib/adminAuth.js';
import { buildSlotDateFromLocal } from './_lib/appointments.js';

const nextDateKey = (dateKey) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + 1, 12));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
    date.getUTCDate()
  ).padStart(2, '0')}`;
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  try {
    const { supabase } = await requireAdmin(req);
    const date = String(req.body?.date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ ok: false, error: 'Invalid date' });
      return;
    }

    const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) {
      res.status(503).json({ ok: false, error: 'AI service unavailable' });
      return;
    }

    const start = buildSlotDateFromLocal(date, '00:00').toISOString();
    const end = buildSlotDateFromLocal(nextDateKey(date), '00:00').toISOString();
    const { data: appointments, error: appointmentError } = await supabase
      .from('appointments')
      .select('date, service, status, customer_id')
      .gte('date', start)
      .lt('date', end)
      .order('date');

    if (appointmentError) throw appointmentError;

    const customerIds = [...new Set((appointments || []).map((item) => item.customer_id))];
    const { data: customers } = customerIds.length
      ? await supabase.from('customers').select('id, name, pet_name').in('id', customerIds)
      : { data: [] };
    const customerMap = new Map((customers || []).map((item) => [item.id, item]));

    const schedule = (appointments || [])
      .map((appointment) => {
        const customer = customerMap.get(appointment.customer_id);
        const time = new Date(appointment.date).toLocaleTimeString('he-IL', {
          timeZone: 'Asia/Jerusalem',
          hour: '2-digit',
          minute: '2-digit'
        });
        return `${time} — ${appointment.service}; ${customer?.name || 'לקוח'}; ${
          customer?.pet_name || 'כלב'
        }; סטטוס ${appointment.status}`;
      })
      .join('\n');

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      contents: `נתח את יום העבודה הבא במספרת כלבים קטנים. החזר בעברית בדיוק שלוש המלצות קצרות ומעשיות.\nתאריך: ${date}\n${
        schedule || 'אין תורים'
      }`
    });

    res.status(200).json({ ok: true, analysis: response.text || 'אין המלצות כרגע.' });
  } catch (error) {
    const apiError = toAdminApiError(error);
    res.status(apiError.statusCode).json({ ok: false, error: apiError.message });
  }
}
