const ISRAEL_TZ = 'Asia/Jerusalem';

// 'YYYY-MM-DD' values from the API are Israel-local calendar dates. Anchoring them at noon UTC
// and formatting in UTC keeps the printed day identical in every viewer's timezone.
const anchor = (dateStr: string) => new Date(`${dateStr}T12:00:00Z`);

export const formatDateLong = (dateStr: string): string =>
  new Intl.DateTimeFormat('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC'
  }).format(anchor(dateStr));

export const formatDateShort = (dateStr: string): string => {
  const [, month, day] = dateStr.split('-').map(Number);
  return `${day}.${month}`;
};

export const formatMonthTitle = (monthKey: string): string => {
  const [year, month] = monthKey.split('-').map(Number);
  return new Intl.DateTimeFormat('he-IL', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(Date.UTC(year, month - 1, 1)));
};

export const todayInIsrael = (): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: ISRAEL_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());

export const firstName = (fullName: string): string => fullName.trim().split(/\s+/)[0] || '';

// Israeli mobile: 05X-XXXXXXX, with or without the leading 0 / +972 / 972.
export const parseIsraeliMobile = (input: string): { e164: string; display: string } | null => {
  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('972')) digits = digits.slice(3);
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (!/^5\d{8}$/.test(digits)) return null;
  return {
    e164: `+972${digits}`,
    display: `0${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`
  };
};

export const maskedPhone = (e164: string): string => `•••${e164.replace(/\D/g, '').slice(-4)}`;
