import { GoogleGenAI } from "@google/genai";
import { Appointment, Customer } from "../types";

const getAiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.error("API Key not found in environment variables");
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

export const analyzeSchedule = async (
  date: Date,
  appointments: Appointment[],
  customers: Customer[]
): Promise<string> => {
  const ai = getAiClient();
  if (!ai) return "שגיאה: חסר מפתח API";

  // Filter appointments for the specific date
  const daysAppointments = appointments.filter(
    (app) =>
      app.date.getDate() === date.getDate() &&
      app.date.getMonth() === date.getMonth() &&
      app.date.getFullYear() === date.getFullYear()
  );

  const formattedData = daysAppointments.map(app => {
    const customer = customers.find(c => c.id === app.customerId);
    return `- שעה ${app.date.toLocaleTimeString('he-IL', {hour: '2-digit', minute:'2-digit'})}: ${app.service} עבור ${customer?.petName} (${customer?.name})`;
  }).join('\n');

  const prompt = `
    אתה עוזר חכם למנהל מספרת כלבים.
    הנה רשימת התורים להיום (${date.toLocaleDateString('he-IL')}):
    ${formattedData || "אין תורים להיום."}

    אנא ספק ניתוח קצר (עד 3 משפטים) בעברית.
    אם עמוס, תן טיפ לייעול. אם ריק, הצע פעולה שיווקית. היה ידידותי ומקצועי.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    return response.text || "לא התקבל מענה.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "אירעה שגיאה בניתוח הנתונים.";
  }
};
