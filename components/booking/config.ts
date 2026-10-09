// Public WhatsApp number customers can write to, digits only with country code
// (e.g. '972501234567'). While empty, every WhatsApp entry point is hidden.
export const BUSINESS_WHATSAPP = '972527075624';

export const CANCEL_WINDOW_HOURS = 24;
export const BOOKING_FEE_ILS = 50;
export const APPOINTMENT_DURATION_MINUTES = 180;
export const REMEMBER_DEVICE_DAYS = 60;

export const DEVICE_STORAGE_KEY = 'pawlished.booking.device';

// Mirrors public/terms.html section 3 — keep the two in sync.
export const POLICY_TEXT = `לשריון התור נגבים דמי קביעה בסך ${BOOKING_FEE_ILS} ₪, שיקוזזו מהתשלום על הטיפול. ביטול או שינוי עד ${CANCEL_WINDOW_HOURS} שעות לפני התור – דמי הקביעה יועברו לתור חלופי. ביטול מאוחר יותר או אי-הגעה – דמי הקביעה לא יוחזרו.`;

export const COMMON_BREEDS = [
  'פודל טוי',
  'פודל ננסי',
  'שיצו',
  'מלטז',
  'מלטיפו',
  'יורקשייר',
  'בישון פריזה',
  'פומרניאן',
  'שנאוצר מיני',
  'קוקר ספנייל',
  'בוסטון טרייר',
  'פקינז'
];

// The WhatsApp number codes are sent from. A free-form code only reaches a customer who messaged
// this number within the last 24 hours, so the OTP screen offers a one-tap "say hi" link.
export const OTP_SENDER_WHATSAPP = '972549377773';
export const otpSenderLink = (text: string): string =>
  `https://wa.me/${OTP_SENDER_WHATSAPP}?text=${encodeURIComponent(text)}`;

export const whatsappLink = (text: string): string => {
  if (!BUSINESS_WHATSAPP) return '';
  return `https://wa.me/${BUSINESS_WHATSAPP}?text=${encodeURIComponent(text)}`;
};
