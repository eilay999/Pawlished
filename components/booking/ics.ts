import { APPOINTMENT_DURATION_MINUTES } from './config';

const toIcsUtc = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

const escapeText = (value: string) =>
  value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

export const downloadAppointmentIcs = (params: { id: string; startIso: string; dogName?: string | null }) => {
  const start = new Date(params.startIso);
  if (Number.isNaN(start.getTime())) return;

  const end = new Date(start.getTime() + APPOINTMENT_DURATION_MINUTES * 60 * 1000);
  const summary = params.dogName ? `תור ל${params.dogName} – Pawlished` : 'תור – Pawlished';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Pawlished//Booking//HE',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${params.id}@pawlished`,
    `DTSTAMP:${toIcsUtc(new Date())}`,
    `DTSTART:${toIcsUtc(start)}`,
    `DTEND:${toIcsUtc(end)}`,
    `SUMMARY:${escapeText(summary)}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT2H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(summary)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ];

  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'pawlished-appointment.ics';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
};
