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
  if (!ai) return "Missing API key.";

  const daysAppointments = appointments.filter(
    (app) =>
      app.date.getDate() === date.getDate() &&
      app.date.getMonth() === date.getMonth() &&
      app.date.getFullYear() === date.getFullYear()
  );

  const formattedData = daysAppointments
    .map((app) => {
      const customer = customers.find((c) => c.id === app.customerId);
      const time = app.date.toLocaleTimeString("he-IL", {
        hour: "2-digit",
        minute: "2-digit",
      });
      const petName = customer?.petName ?? "pet";
      const customerName = customer?.name ?? "customer";
      return `- ${time}: ${app.service} for ${petName} (${customerName})`;
    })
    .join("\n");

  const prompt = `
Analyze the pet grooming schedule for the selected date.
Here are the appointments (${date.toLocaleDateString("he-IL")}):
${formattedData || "No appointments scheduled for this date."}

Provide 3 concise, practical insights.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    return response.text || "No response received.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Could not analyze schedule. Please try again later.";
  }
};
