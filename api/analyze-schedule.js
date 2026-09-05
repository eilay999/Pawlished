import { GoogleGenAI } from '@google/genai';
import { requireAdminSession } from './_lib/adminAuth.js';

const getGeminiApiKeys = () =>
  Array.from(
    new Set(
      [
        process.env.VITE_GEMINI_API_KEY,
        process.env.GEMINI_API_KEY,
        process.env.API_KEY,
        process.env.VITE_API_KEY
      ]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  );

const model = (process.env.GEMINI_MODEL || process.env.VITE_GEMINI_MODEL || 'gemini-1.5-flash').trim();

const buildPrompt = (dateLabel, formattedData) => `
Analyze the pet grooming schedule for the selected date.
Here are the appointments (${dateLabel}):
${formattedData || 'No appointments scheduled for this date.'}

Provide 3 concise, practical insights.
`;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  try {
    requireAdminSession(req);

    const apiKeys = getGeminiApiKeys();
    if (!apiKeys.length) {
      res.status(200).json({ ok: true, text: 'שירות ה-AI לא זמין.' });
      return;
    }

    const { dateLabel, formattedData } = req.body || {};
    const prompt = buildPrompt(String(dateLabel || ''), String(formattedData || ''));

    for (const apiKey of apiKeys) {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({ model, contents: prompt });
        const text = response.text;
        if (text) {
          res.status(200).json({ ok: true, text });
          return;
        }
      } catch {
        // try the next key, if any
      }
    }

    res.status(200).json({ ok: true, text: 'לא ניתן לנתח את הלו"ז. נסה שוב בעוד רגע.' });
  } catch (err) {
    const statusCode = err?.statusCode || 500;
    res.status(statusCode).json({ ok: false, error: err?.message || 'Server error' });
  }
}
