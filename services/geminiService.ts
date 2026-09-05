import { Appointment, Customer } from '../types';

const getAdminSessionToken = () => {
  try {
    return localStorage.getItem('pawlished_admin_session') || '';
  } catch {
    return '';
  }
};

export const analyzeSchedule = async (
  date: Date,
  appointments: Appointment[],
  customers: Customer[]
): Promise<string> => {
  const daysAppointments = appointments.filter(
    app =>
      app.date.getDate() === date.getDate() &&
      app.date.getMonth() === date.getMonth() &&
      app.date.getFullYear() === date.getFullYear()
  );

  const formattedData = daysAppointments
    .map(app => {
      const customer = customers.find(c => c.id === app.customerId);
      const time = app.date.toLocaleTimeString('he-IL', {
        hour: '2-digit',
        minute: '2-digit',
      });
      const petName = customer?.petName ?? 'pet';
      const customerName = customer?.name ?? 'customer';
      return `- ${time}: ${app.service} for ${petName} (${customerName})`;
    })
    .join('\n');

  try {
    const token = getAdminSessionToken();
    const response = await fetch('/api/admin/mutate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'X-OTP-Token': token } : {})
      },
      body: JSON.stringify({
        action: 'analyze_schedule',
        dateLabel: date.toLocaleDateString('he-IL'),
        formattedData
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error || 'Request failed');
    }

    return payload.text || 'No response received.';
  } catch (error) {
    console.error('Gemini API Error:', error);
    return 'לא ניתן לנתח את הלו"ז. נסה שוב בעוד רגע.';
  }
};
