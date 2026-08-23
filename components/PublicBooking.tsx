import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, Phone, User, Dog, CheckCircle2 } from 'lucide-react';
import { Appointment, Customer } from '../types';

type BookingStep = 'PHONE' | 'OTP' | 'DETAILS' | 'BOOKING' | 'DONE';

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

const normalizeDigits = (value: string) => value.replace(/\D/g, '');

const OTP_CODE_LENGTH = 6;
const OTP_RESEND_COOLDOWN_SEC = 60;

const toE164 = (value: string) => {
  const digits = normalizeDigits(value);
  if (!digits) return '';
  if (digits.startsWith('0')) {
    return `+972${digits.slice(1)}`;
  }
  if (digits.startsWith('972')) {
    return `+${digits}`;
  }
  if (value.trim().startsWith('+')) {
    return value.trim();
  }
  return `+${digits}`;
};

const maskPhoneForDisplay = (value: string) => {
  const digits = normalizeDigits(value);
  if (!digits) return value;
  if (digits.length <= 4) return digits;
  return `•••${digits.slice(-4)}`;
};

type AvailabilityDay = {
  date: string; // YYYY-MM-DD (Israel local date)
  weekdayIndex: number | null;
  times: Array<{ time: string; available: boolean }>;
};

type BookingConfirmationStatus = {
  ok: boolean;
  channel?: 'sms' | 'whatsapp';
  error?: string;
};

const toDisplayDateLabel = (dateValue: string) => {
  const safe = new Date(`${dateValue}T12:00:00`);
  if (Number.isNaN(safe.getTime())) return dateValue;
  return safe.toLocaleDateString('he-IL');
};

interface PublicBookingProps {
  onBookingCreated: (payload: { customer: Customer; appointment: Appointment }) => void;
  onCustomerCreated?: (customer: Customer) => void;
}

export const PublicBooking: React.FC<PublicBookingProps> = ({
  onBookingCreated,
  onCustomerCreated
}) => {
  const [step, setStep] = useState<BookingStep>('PHONE');
  const [doneKind, setDoneKind] = useState<'BOOKED' | 'CUSTOMER_CREATED' | null>(null);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verifiedPhone, setVerifiedPhone] = useState('');
  const [otpSessionToken, setOtpSessionToken] = useState('');
  const [otpPendingPhone, setOtpPendingPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpChannel, setOtpChannel] = useState<'sms' | 'whatsapp' | null>(null);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [otpResendAvailableAt, setOtpResendAvailableAt] = useState<number | null>(null);
  const [otpTick, setOtpTick] = useState(0);
  const otpInputRef = useRef<HTMLInputElement | null>(null);
  const [isExistingCustomer, setIsExistingCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    petName: '',
    petType: ''
  });
  const [selectedSlot, setSelectedSlot] = useState<{
    date: string;
    time: string;
  } | null>(null);
  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false);
  const [isSavingCustomerCard, setIsSavingCustomerCard] = useState(false);
  const [isCheckingCustomer, setIsCheckingCustomer] = useState(false);
  const [availabilityDays, setAvailabilityDays] = useState<AvailabilityDay[]>([]);
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [availabilityRefreshKey, setAvailabilityRefreshKey] = useState(0);
  const [confirmationStatus, setConfirmationStatus] = useState<BookingConfirmationStatus | null>(
    null
  );

  const availableSlotCountByDate = useMemo(() => {
    const map = new Map<string, number>();
    availabilityDays.forEach((day) => {
      map.set(
        day.date,
        (day.times || []).reduce((acc, time) => (time.available ? acc + 1 : acc), 0)
      );
    });
    return map;
  }, [availabilityDays]);

  const bookingProgress = useMemo(() => {
    const labelByStep: Record<BookingStep, string> = {
      PHONE: 'מספר טלפון',
      OTP: 'אימות קוד',
      DETAILS: 'פרטי לקוח',
      BOOKING: 'בחירת תור',
      DONE: 'סיום'
    };

    const base = {
      label: labelByStep[step] ?? '',
      current: 1,
      total: 4
    };

    if (step === 'DONE') {
      const total = doneKind === 'CUSTOMER_CREATED' ? 3 : isExistingCustomer ? 3 : 4;
      return { ...base, current: total, total, label: doneKind === 'CUSTOMER_CREATED' ? 'כרטיס לקוח נשמר' : 'התור נקבע' };
    }

    if (isExistingCustomer) {
      const map: Partial<Record<BookingStep, number>> = {
        PHONE: 1,
        OTP: 2,
        BOOKING: 3
      };
      return { ...base, current: map[step] ?? 1, total: 3 };
    }

    const map: Partial<Record<BookingStep, number>> = {
      PHONE: 1,
      OTP: 2,
      DETAILS: 3,
      BOOKING: 4
    };

    return { ...base, current: map[step] ?? 1, total: 4 };
  }, [doneKind, isExistingCustomer, step]);

  const otpSecondsUntilResend = useMemo(() => {
    if (!otpResendAvailableAt) return 0;
    return Math.max(0, Math.ceil((otpResendAvailableAt - Date.now()) / 1000));
  }, [otpResendAvailableAt, otpTick]);

  useEffect(() => {
    if (step !== 'BOOKING') return;

    let cancelled = false;
    setAvailabilityError(null);
    setIsLoadingAvailability(true);

    void fetch('/api/public-booking/availability?days=30')
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || 'טעינת זמינות נכשלה.');
        }

        if (cancelled) return;
        setAvailabilityDays(Array.isArray(payload.days) ? payload.days : []);
      })
      .catch((err) => {
        if (cancelled) return;
        setAvailabilityDays([]);
        setAvailabilityError(err instanceof Error ? err.message : 'טעינת זמינות נכשלה.');
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoadingAvailability(false);
      });

    return () => {
      cancelled = true;
    };
  }, [availabilityRefreshKey, step]);

  useEffect(() => {
    if (step !== 'OTP') return;
    const timer = window.setTimeout(() => {
      otpInputRef.current?.focus();
      otpInputRef.current?.select?.();
    }, 50);
    return () => window.clearTimeout(timer);
  }, [step]);

  useEffect(() => {
    if (step !== 'OTP' || !otpResendAvailableAt) return;
    if (Date.now() >= otpResendAvailableAt) return;

    const timer = window.setInterval(() => {
      if (Date.now() >= otpResendAvailableAt) {
        window.clearInterval(timer);
        setOtpTick((value) => value + 1);
        return;
      }
      setOtpTick((value) => value + 1);
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [otpResendAvailableAt, step]);

  const clearOtpState = () => {
    setOtpPendingPhone('');
    setOtpCode('');
    setOtpChannel(null);
    setOtpResendAvailableAt(null);
  };

  const continueAfterVerifiedPhone = async (e164: string, sessionToken: string) => {
    setIsCheckingCustomer(true);
    setIsExistingCustomer(false);
    try {
      const response = await fetch('/api/public-booking/customer-exists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken ? { 'X-OTP-Token': sessionToken } : {})
        },
        body: JSON.stringify({ phone: e164, otpToken: sessionToken })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error || 'בדיקת לקוח נכשלה. נסה שוב.');
        return;
      }

      const exists = Boolean(payload.exists);
      setIsExistingCustomer(exists);
      setStep(exists ? 'BOOKING' : 'DETAILS');
    } catch {
      setError('בדיקת לקוח נכשלה. נסה שוב.');
    } finally {
      setIsCheckingCustomer(false);
    }
  };

  const handleSendOtp = async (forcedPhone?: string) => {
    setError(null);
    setAvailabilityError(null);
    setDoneKind(null);
    setVerifiedPhone('');
    setOtpSessionToken('');

    const e164 = forcedPhone || toE164(phone);
    if (!e164) {
      setError('הזן מספר טלפון תקין.');
      return;
    }

    setSelectedSlot(null);

    if (isSendingOtp) return;

    setIsSendingOtp(true);
    try {
      const response = await fetch('/api/whatsapp-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', phone: e164 })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error || 'שליחת קוד נכשלה. נסה שוב.');
        return;
      }

      setOtpPendingPhone(e164);
      setOtpChannel(payload.channel === 'sms' || payload.channel === 'whatsapp' ? payload.channel : null);
      setOtpResendAvailableAt(Date.now() + OTP_RESEND_COOLDOWN_SEC * 1000);
      setOtpCode('');
      setStep('OTP');
    } catch {
      setError('שליחת קוד נכשלה. נסה שוב.');
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyOtp = async (forcedCode?: string) => {
    setError(null);
    setAvailabilityError(null);
    setDoneKind(null);

    if (!otpPendingPhone) {
      setError('חסר מספר טלפון לאימות. חזור למסך הקודם.');
      setStep('PHONE');
      return;
    }

    const codeDigits = normalizeDigits(forcedCode ?? otpCode);
    if (codeDigits.length !== OTP_CODE_LENGTH) {
      setError('הזן קוד בן 6 ספרות.');
      return;
    }

    if (isVerifyingOtp) return;

    setIsVerifyingOtp(true);
    try {
      const response = await fetch('/api/whatsapp-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', phone: otpPendingPhone, code: codeDigits })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error || 'אימות הקוד נכשל. נסה שוב.');
        return;
      }

      const sessionToken = typeof payload.sessionToken === 'string' ? payload.sessionToken : '';
      if (!sessionToken) {
        setError('האימות הצליח אבל חסר אסימון גישה. נסה שוב.');
        return;
      }

      setOtpSessionToken(sessionToken);
      setVerifiedPhone(otpPendingPhone);
      clearOtpState();
      await continueAfterVerifiedPhone(otpPendingPhone, sessionToken);
    } catch {
      setError('אימות הקוד נכשל. נסה שוב.');
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const handleContinueDetails = () => {
    if (!newCustomer.name.trim() || !newCustomer.petName.trim() || !newCustomer.petType.trim()) {
      setError('מלא שם, שם כלב וסוג.');
      return;
    }

    setError(null);
    setStep('BOOKING');
  };

  const handleSaveCustomerCard = async () => {
    if (!verifiedPhone) return;
    if (isSavingCustomerCard) return;
    if (!otpSessionToken) {
      setError('נדרש אימות טלפון מחדש.');
      setStep('PHONE');
      return;
    }

    if (!newCustomer.name.trim() || !newCustomer.petName.trim() || !newCustomer.petType.trim()) {
      setError('מלא שם, שם כלב וסוג.');
      return;
    }

    setError(null);
    setIsSavingCustomerCard(true);

    try {
      const response = await fetch('/api/public-booking/create-customer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-OTP-Token': otpSessionToken
        },
        body: JSON.stringify({
          phone: verifiedPhone,
          otpToken: otpSessionToken,
          customer: {
            name: newCustomer.name.trim(),
            petName: newCustomer.petName.trim(),
            petType: newCustomer.petType.trim()
          }
        })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error || 'שמירת כרטיס לקוח נכשלה.');
        return;
      }

      const customer: Customer = {
        ...payload.customer,
        lastVisit: new Date(payload.customer.lastVisit)
      };

      onCustomerCreated?.(customer);
      setIsExistingCustomer(true);
      setDoneKind('CUSTOMER_CREATED');
      setSelectedSlot(null);
      setStep('DONE');
    } catch {
      setError('שמירת כרטיס לקוח נכשלה. נסה שוב.');
    } finally {
      setIsSavingCustomerCard(false);
    }
  };

  const handleConfirmBooking = async () => {
    if (!selectedSlot) {
      setError('בחר תאריך ושעה.');
      return;
    }

    if (!otpSessionToken) {
      setError('נדרש אימות טלפון מחדש לפני קביעת תור.');
      setStep('PHONE');
      return;
    }

    const day = availabilityDays.find((item) => item.date === selectedSlot.date);
    const slot = day?.times?.find((item) => item.time === selectedSlot.time) || null;
    if (!slot?.available) {
      setError('השעה כבר נתפסה. רענן זמינות ובחר שעה אחרת.');
      return;
    }

    setError(null);
    setIsSubmittingBooking(true);

    try {
      const response = await fetch('/api/public-booking/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-OTP-Token': otpSessionToken
        },
        body: JSON.stringify({
          phone: verifiedPhone,
          otpToken: otpSessionToken,
          date: selectedSlot.date,
          time: selectedSlot.time,
          customer: isExistingCustomer
            ? undefined
            : {
                name: newCustomer.name.trim(),
                phone: verifiedPhone,
                petName: newCustomer.petName.trim(),
                petType: newCustomer.petType.trim()
              },
          service: 'תור לקוח',
          notes: ''
        })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error || 'יצירת התור נכשלה.');
        setAvailabilityRefreshKey((key) => key + 1);
        return;
      }

      const customer: Customer = {
        ...payload.customer,
        lastVisit: new Date(payload.customer.lastVisit)
      };

      const appointment: Appointment = {
        ...payload.appointment,
        date: new Date(payload.appointment.date)
      };

      onBookingCreated({ customer, appointment });
      setIsExistingCustomer(true);
      setDoneKind('BOOKED');
      setConfirmationStatus(
        payload?.confirmation && typeof payload.confirmation === 'object'
          ? {
              ok: Boolean(payload.confirmation.ok),
              channel: payload.confirmation.channel,
              error: payload.confirmation.error
            }
          : null
      );

      setStep('DONE');
    } catch {
      setError('יצירת התור נכשלה. נסה שוב.');
    } finally {
      setIsSubmittingBooking(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-pink-50 p-4 md:p-8">
      <div className="max-w-3xl mx-auto bg-white/90 backdrop-blur rounded-3xl shadow-xl border border-white/70 overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-gray-900">קביעת תור</h1>
              <p className="text-sm text-gray-500">אפשר לקבוע עד חודש מראש</p>
            </div>
            <div className="shrink-0 rounded-2xl bg-blue-50 border border-blue-100 p-2">
              <Calendar className="w-6 h-6 text-blue-700" />
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>
                שלב {bookingProgress.current} מתוך {bookingProgress.total}
              </span>
              <span className="font-medium text-gray-600">{bookingProgress.label}</span>
            </div>
            <div className="mt-2 h-2 w-full rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-600 transition-all duration-500 ease-out"
                style={{
                  width: `${Math.max(
                    8,
                    Math.min(100, Math.round((bookingProgress.current / bookingProgress.total) * 100))
                  )}%`
                }}
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="mx-6 mt-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 text-sm px-4 py-3">
            {error}
          </div>
        )}

        <div className="p-6 space-y-6">
          {step === 'PHONE' && (
            <div className="space-y-3">
              <label className="text-sm text-gray-600 flex items-center gap-2">
                <Phone className="w-4 h-4" /> מספר טלפון
              </label>
              <input
                value={phone}
                onChange={event => setPhone(event.target.value)}
                dir="ltr"
                placeholder='לדוגמה: 050-1234567'
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-left bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
              />
              <button
                onClick={() => void handleSendOtp()}
                disabled={isSendingOtp}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl py-3 font-semibold shadow-sm"
              >
                {isSendingOtp ? 'שולח קוד...' : 'שלח קוד אימות'}
              </button>
              <div className="text-xs text-gray-500">
                נשלח אליך קוד אימות בהודעה (WhatsApp או SMS) לפני קביעת התור.
              </div>
            </div>
          )}

          {step === 'OTP' && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-gray-50 border border-gray-100 px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs text-gray-500">אימות לטלפון</div>
                  <div dir="ltr" className="text-sm font-semibold text-gray-900 truncate">
                    {otpPendingPhone ? maskPhoneForDisplay(otpPendingPhone) : ''}
                  </div>
                </div>
                <div className="shrink-0 text-[11px] px-2 py-1 rounded-full border border-blue-100 bg-blue-50 text-blue-700">
                  {otpChannel ? (otpChannel === 'sms' ? 'SMS' : 'WhatsApp') : 'הודעה'}
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500">קוד אימות (6 ספרות)</label>
                <input
                  ref={otpInputRef}
                  value={otpCode}
                  onChange={(event) => {
                    const digits = normalizeDigits(event.target.value).slice(0, OTP_CODE_LENGTH);
                    setOtpCode(digits);
                    if (digits.length === OTP_CODE_LENGTH) {
                      void handleVerifyOtp(digits);
                    }
                  }}
                  dir="ltr"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={OTP_CODE_LENGTH}
                  placeholder="123456"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-lg font-semibold tracking-[0.55em] text-center bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
                />
                <div className="mt-2 text-xs text-gray-500">
                  לא קיבלת קוד?{' '}
                  {otpSecondsUntilResend > 0
                    ? `אפשר לשלוח שוב בעוד ${otpSecondsUntilResend} שנ׳.`
                    : 'אפשר לשלוח שוב עכשיו.'}
                </div>
              </div>

              <div className="space-y-2">
                <button
                  onClick={() => void handleVerifyOtp()}
                  disabled={isVerifyingOtp || isCheckingCustomer}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl py-3 font-semibold shadow-sm"
                >
                  {isVerifyingOtp ? 'מאמת...' : isCheckingCustomer ? 'בודק לקוח...' : 'אמת קוד'}
                </button>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      clearOtpState();
                      setVerifiedPhone('');
                      setOtpSessionToken('');
                      setStep('PHONE');
                    }}
                    disabled={isSendingOtp || isVerifyingOtp || isCheckingCustomer}
                    className="w-full bg-white hover:bg-gray-50 disabled:opacity-60 text-gray-700 border border-gray-200 rounded-xl py-3 font-medium"
                  >
                    שנה מספר
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleSendOtp(otpPendingPhone)}
                    disabled={
                      isSendingOtp ||
                      isVerifyingOtp ||
                      isCheckingCustomer ||
                      !otpPendingPhone ||
                      otpSecondsUntilResend > 0
                    }
                    className="w-full bg-white hover:bg-blue-50 disabled:opacity-60 text-blue-700 border border-blue-200 rounded-xl py-3 font-medium"
                  >
                    {otpSecondsUntilResend > 0
                      ? `שלח שוב בעוד ${otpSecondsUntilResend} שנ׳`
                      : isSendingOtp
                        ? 'שולח...'
                        : 'שלח שוב'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 'DETAILS' && (
            <div className="space-y-4">
              <div className="text-sm text-gray-600">לקוח חדש - מלא פרטים</div>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 flex items-center gap-2">
                    <User className="w-4 h-4" /> שם מלא
                  </label>
                  <input
                    value={newCustomer.name}
                    onChange={event =>
                      setNewCustomer(previous => ({ ...previous, name: event.target.value }))
                    }
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 flex items-center gap-2">
                    <Dog className="w-4 h-4" /> שם הכלב
                  </label>
                  <input
                    value={newCustomer.petName}
                    onChange={event =>
                      setNewCustomer(previous => ({ ...previous, petName: event.target.value }))
                    }
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-gray-500 flex items-center gap-2">
                    סוג הכלב
                  </label>
                  <input
                    value={newCustomer.petType}
                    onChange={event =>
                      setNewCustomer(previous => ({ ...previous, petType: event.target.value }))
                    }
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <button
                  onClick={handleContinueDetails}
                  disabled={isSavingCustomerCard}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl py-3 font-semibold shadow-sm"
                >
                  המשך לקביעת תור
                </button>
                <button
                  onClick={() => void handleSaveCustomerCard()}
                  disabled={isSavingCustomerCard}
                  className="w-full bg-white hover:bg-blue-50 disabled:opacity-60 text-blue-700 border border-blue-200 rounded-xl py-3 font-medium"
                >
                  {isSavingCustomerCard ? 'שומר...' : 'שמור כרטיס לקוח בלי תור'}
                </button>
              </div>
            </div>
          )}

          {step === 'BOOKING' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-gray-600">בחר תאריך ושעה (עד חודש מראש)</div>
                <button
                  type="button"
                  onClick={() => setAvailabilityRefreshKey((key) => key + 1)}
                  disabled={isLoadingAvailability || isSubmittingBooking}
                  className="text-xs px-3 py-1.5 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-60"
                >
                  רענן זמינות
                </button>
              </div>

              {availabilityError && (
                <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3">
                  {availabilityError}
                </div>
              )}

              {isLoadingAvailability ? (
                <div className="text-sm text-gray-500">טוען זמינות...</div>
              ) : availabilityDays.length === 0 ? (
                <div className="text-sm text-gray-500">אין זמינות להצגה כרגע.</div>
              ) : null}

              <div className="space-y-3">
                {availabilityDays.map((day) => (
                  <div
                    key={day.date}
                    className="border border-gray-100 bg-white rounded-2xl p-4 shadow-sm shadow-blue-100/20"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold text-gray-800">
                        {DAY_NAMES[day.weekdayIndex ?? 0]} - {toDisplayDateLabel(day.date)}
                      </div>
                      <div className="text-xs text-gray-400">
                        {availableSlotCountByDate.get(day.date) ?? 0} זמינים
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {day.times.map((slotTime) => {
                        const available = slotTime.available;
                        const isSelected =
                          Boolean(selectedSlot) &&
                          selectedSlot!.time === slotTime.time &&
                          selectedSlot!.date === day.date;

                        return (
                          <button
                            key={slotTime.time}
                            disabled={!available || isSubmittingBooking}
                            onClick={() => setSelectedSlot({ date: day.date, time: slotTime.time })}
                            className={`px-3 py-2.5 rounded-xl text-sm font-medium border transition focus:outline-none focus:ring-2 focus:ring-blue-100 ${
                              isSelected
                                ? 'bg-blue-600 text-white border-blue-600'
                                : available
                                  ? 'border-blue-100 text-blue-700 hover:bg-blue-50'
                                  : 'border-gray-100 text-gray-300 cursor-not-allowed'
                            }`}
                          >
                            {slotTime.time}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={handleConfirmBooking}
                disabled={isSubmittingBooking}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-xl py-3 font-semibold shadow-sm"
              >
                {isSubmittingBooking ? 'שומר...' : 'אישור תור'}
              </button>
            </div>
          )}

          {step === 'DONE' && (
            <div className="text-center space-y-3 py-6">
              <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
              <div className="text-lg font-bold text-gray-800">
                {doneKind === 'CUSTOMER_CREATED' ? 'כרטיס הלקוח נשמר בהצלחה!' : 'התור נקבע בהצלחה!'}
              </div>
              {doneKind !== 'CUSTOMER_CREATED' && selectedSlot && (
                <div className="text-sm text-gray-500">
                  {toDisplayDateLabel(selectedSlot.date)} בשעה {selectedSlot.time}
                </div>
              )}
              {doneKind !== 'CUSTOMER_CREATED' && confirmationStatus && (
                <div
                  className={`text-sm rounded-xl px-4 py-3 border ${
                    confirmationStatus?.ok === false
                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                      : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  }`}
                >
                  {confirmationStatus?.ok === false
                    ? 'התור נקבע אבל לא הצלחנו לשלוח הודעת אישור. אם לא קיבלת הודעה תוך כמה דקות – צור קשר איתנו.'
                    : `הודעת אישור נשלחה ${confirmationStatus?.channel === 'sms' ? 'ב‑SMS' : 'ב‑WhatsApp'}.`}
                </div>
              )}
              {doneKind === 'CUSTOMER_CREATED' && (
                <div className="space-y-2 pt-3">
                  <div className="text-sm text-gray-500">אפשר עכשיו לקבוע תור או לחזור באיזה זמן.</div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSlot(null);
                      setStep('BOOKING');
                    }}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 font-medium"
                  >
                    קביעת תור עכשיו
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
