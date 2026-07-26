import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Dog,
  LockKeyhole,
  Phone,
  Scissors,
  ShieldCheck,
  User
} from 'lucide-react';

type BookingStep = 'PHONE' | 'OTP' | 'DETAILS' | 'BOOKING' | 'DONE';

type AvailabilityDay = {
  date: string;
  slots: string[];
};

type ExistingCustomer = {
  id: string;
  name: string;
  petName: string;
  petType: string;
};

const normalizeDigits = (value: string) => value.replace(/\D/g, '');

const toE164 = (value: string) => {
  const digits = normalizeDigits(value);
  if (digits.startsWith('0')) return `+972${digits.slice(1)}`;
  if (digits.startsWith('972')) return `+${digits}`;
  return value.trim().startsWith('+') ? value.trim() : `+${digits}`;
};

const formatDate = (dateKey: string) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });
};

const authHeaders = (token: string) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`
});

export const PublicBooking: React.FC = () => {
  const [step, setStep] = useState<BookingStep>('PHONE');
  const [phone, setPhone] = useState('');
  const [verifiedPhone, setVerifiedPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [bookingToken, setBookingToken] = useState('');
  const [existingCustomer, setExistingCustomer] = useState<ExistingCustomer | null>(null);
  const [newCustomer, setNewCustomer] = useState({ name: '', petName: '', petType: '' });
  const [availability, setAvailability] = useState<AvailabilityDay[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<{ date: string; time: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [availabilityLoading, setAvailabilityLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void fetch('/api/public-booking/availability')
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'availability');
        if (active) setAvailability(payload.days || []);
      })
      .catch(() => {
        if (active) setError('לא הצלחנו לטעון שעות פנויות. נסה לרענן את העמוד.');
      })
      .finally(() => {
        if (active) setAvailabilityLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const availableDays = useMemo(
    () => availability.filter((day) => day.slots.length > 0),
    [availability]
  );

  const sendOtp = async () => {
    const digits = normalizeDigits(phone);
    if (digits.length < 9 || digits.length > 12) {
      setError('הזן מספר טלפון תקין.');
      return;
    }

    const normalizedPhone = toE164(phone);
    setIsBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/whatsapp-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', phone: normalizedPhone })
      });
      if (!response.ok) {
        throw new Error('otp');
      }
      setVerifiedPhone(normalizedPhone);
      setStep('OTP');
    } catch {
      setError('שליחת קוד האימות נכשלה. נסה שוב בעוד דקה.');
    } finally {
      setIsBusy(false);
    }
  };

  const verifyOtp = async () => {
    if (!/^\d{6}$/.test(normalizeDigits(otpCode))) {
      setError('הזן את קוד האימות בן 6 הספרות.');
      return;
    }

    setIsBusy(true);
    setError(null);
    try {
      const verifyResponse = await fetch('/api/whatsapp-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify',
          phone: verifiedPhone,
          code: normalizeDigits(otpCode)
        })
      });
      const verifyPayload = await verifyResponse.json().catch(() => ({}));
      if (!verifyResponse.ok || !verifyPayload.token) throw new Error('verify');

      const token = String(verifyPayload.token);
      setBookingToken(token);
      const lookupResponse = await fetch('/api/public-booking/lookup', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ phone: verifiedPhone })
      });
      const lookupPayload = await lookupResponse.json().catch(() => ({}));
      if (!lookupResponse.ok) throw new Error('lookup');

      setExistingCustomer(lookupPayload.customer || null);
      setStep(lookupPayload.customer ? 'BOOKING' : 'DETAILS');
    } catch {
      setError('הקוד אינו נכון או שפג תוקפו.');
    } finally {
      setIsBusy(false);
    }
  };

  const continueWithDetails = () => {
    if (!newCustomer.name.trim() || !newCustomer.petName.trim() || !newCustomer.petType.trim()) {
      setError('מלא שם, שם הכלב וסוג הכלב.');
      return;
    }
    setError(null);
    setStep('BOOKING');
  };

  const sendConfirmation = async (date: string, time: string) => {
    await fetch('/api/whatsapp-confirm', {
      method: 'POST',
      headers: authHeaders(bookingToken),
      body: JSON.stringify({
        phone: verifiedPhone,
        date: formatDate(date),
        time,
        requestManagerApproval: !existingCustomer,
        customerName: existingCustomer?.name || newCustomer.name,
        petName: existingCustomer?.petName || newCustomer.petName,
        customerPhone: verifiedPhone
      })
    }).catch(() => undefined);
  };

  const confirmBooking = async () => {
    if (!selectedSlot || !bookingToken) {
      setError('בחר תאריך ושעה.');
      return;
    }

    setIsBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/public-booking/create', {
        method: 'POST',
        headers: authHeaders(bookingToken),
        body: JSON.stringify({
          phone: verifiedPhone,
          date: selectedSlot.date,
          time: selectedSlot.time,
          customer: existingCustomer
            ? undefined
            : {
                name: newCustomer.name.trim(),
                phone: verifiedPhone,
                petName: newCustomer.petName.trim(),
                petType: newCustomer.petType.trim()
              },
          service: 'תספורת מלאה לכלב קטן',
          notes: ''
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'booking');
      }

      await sendConfirmation(selectedSlot.date, selectedSlot.time);
      setStep('DONE');
    } catch (bookingError) {
      const message =
        bookingError instanceof Error && bookingError.message.includes('תפוסה')
          ? bookingError.message
          : 'יצירת התור נכשלה. ייתכן שהשעה נתפסה—בחר שעה אחרת.';
      setError(message);
      setAvailability((days) =>
        days.map((day) =>
          day.date === selectedSlot.date
            ? { ...day, slots: day.slots.filter((time) => time !== selectedSlot.time) }
            : day
        )
      );
      setSelectedSlot(null);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-pink-50 via-white to-amber-50 p-4 md:p-8">
      <div className="mx-auto max-w-3xl overflow-hidden rounded-3xl border border-pink-100 bg-white shadow-xl">
        <header className="border-b border-pink-100 bg-white px-6 py-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-pink-700">
                <Scissors className="h-6 w-6" />
                <span className="text-2xl font-bold">Pawlished</span>
              </div>
              <h1 className="mt-3 text-2xl font-bold text-gray-900">קביעת תור אונליין</h1>
              <p className="mt-1 text-sm text-gray-500">מספרת בוטיק לכלבים קטנים בראשון לציון</p>
            </div>
            <div className="hidden rounded-2xl bg-pink-50 p-3 text-pink-700 sm:block">
              <Dog className="h-8 w-8" />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-2xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            <ShieldCheck className="h-4 w-4" />
            הפרטים שלך מוגנים ומשמשים לקביעת התור בלבד
          </div>
        </header>

        {error && (
          <div className="mx-6 mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <main className="space-y-6 p-6">
          {step === 'PHONE' && (
            <section className="space-y-4">
              <div>
                <label htmlFor="booking-phone" className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700">
                  <Phone className="h-4 w-4" />
                  מספר טלפון
                </label>
                <input
                  id="booking-phone"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="050-1234567"
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 outline-none focus:border-pink-300 focus:ring-4 focus:ring-pink-100"
                />
              </div>
              <button
                type="button"
                onClick={() => void sendOtp()}
                disabled={isBusy}
                className="w-full rounded-2xl bg-pink-600 py-3 font-bold text-white hover:bg-pink-700 disabled:opacity-50"
              >
                {isBusy ? 'שולח קוד…' : 'שלחו לי קוד אימות'}
              </button>
            </section>
          )}

          {step === 'OTP' && (
            <section className="space-y-4">
              <div className="text-center">
                <LockKeyhole className="mx-auto h-9 w-9 text-pink-600" />
                <h2 className="mt-2 text-xl font-bold text-gray-900">אימות מספר הטלפון</h2>
                <p className="mt-1 text-sm text-gray-500">שלחנו קוד בן 6 ספרות ל־{verifiedPhone}</p>
              </div>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otpCode}
                onChange={(event) => setOtpCode(event.target.value)}
                aria-label="קוד אימות"
                className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-center text-2xl tracking-[0.35em] outline-none focus:border-pink-300 focus:ring-4 focus:ring-pink-100"
              />
              <button
                type="button"
                onClick={() => void verifyOtp()}
                disabled={isBusy}
                className="w-full rounded-2xl bg-pink-600 py-3 font-bold text-white hover:bg-pink-700 disabled:opacity-50"
              >
                {isBusy ? 'מאמת…' : 'אימות והמשך'}
              </button>
            </section>
          )}

          {step === 'DETAILS' && (
            <section className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">נעים להכיר</h2>
                <p className="mt-1 text-sm text-gray-500">כמה פרטים קצרים עליך ועל הכלב</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm text-gray-600">
                  <span className="mb-1 flex items-center gap-2"><User className="h-4 w-4" />שם מלא</span>
                  <input
                    value={newCustomer.name}
                    onChange={(event) => setNewCustomer((value) => ({ ...value, name: event.target.value }))}
                    className="w-full rounded-2xl border border-gray-200 px-4 py-3 outline-none focus:border-pink-300"
                  />
                </label>
                <label className="text-sm text-gray-600">
                  <span className="mb-1 flex items-center gap-2"><Dog className="h-4 w-4" />שם הכלב</span>
                  <input
                    value={newCustomer.petName}
                    onChange={(event) => setNewCustomer((value) => ({ ...value, petName: event.target.value }))}
                    className="w-full rounded-2xl border border-gray-200 px-4 py-3 outline-none focus:border-pink-300"
                  />
                </label>
                <label className="text-sm text-gray-600 sm:col-span-2">
                  <span className="mb-1 block">גזע / סוג הכלב</span>
                  <input
                    value={newCustomer.petType}
                    onChange={(event) => setNewCustomer((value) => ({ ...value, petType: event.target.value }))}
                    placeholder="לדוגמה: פודל טוי"
                    className="w-full rounded-2xl border border-gray-200 px-4 py-3 outline-none focus:border-pink-300"
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={continueWithDetails}
                className="w-full rounded-2xl bg-pink-600 py-3 font-bold text-white hover:bg-pink-700"
              >
                המשך לבחירת תור
              </button>
            </section>
          )}

          {step === 'BOOKING' && (
            <section className="space-y-5">
              {existingCustomer && (
                <div className="rounded-2xl border border-pink-100 bg-pink-50 p-4">
                  <div className="font-bold text-gray-900">כיף לראות אותך שוב, {existingCustomer.name}</div>
                  <div className="mt-1 text-sm text-gray-600">התור יהיה עבור {existingCustomer.petName}</div>
                </div>
              )}

              <div>
                <h2 className="flex items-center gap-2 text-xl font-bold text-gray-900">
                  <CalendarDays className="h-5 w-5 text-pink-600" />
                  בחירת תאריך ושעה
                </h2>
                <p className="mt-1 text-sm text-gray-500">מוצגות רק שעות פנויות</p>
              </div>

              {availabilityLoading ? (
                <div className="rounded-2xl bg-gray-50 py-8 text-center text-sm text-gray-500">טוען שעות פנויות…</div>
              ) : availableDays.length === 0 ? (
                <div className="rounded-2xl bg-amber-50 py-8 text-center text-sm text-amber-800">
                  אין כרגע שעות פנויות בשבועיים הקרובים. אפשר ליצור קשר ב‑WhatsApp.
                </div>
              ) : (
                <div className="space-y-3">
                  {availableDays.map((day) => (
                    <div key={day.date} className="rounded-2xl border border-gray-200 p-4">
                      <div className="font-bold text-gray-900">{formatDate(day.date)}</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {day.slots.map((time) => {
                          const selected = selectedSlot?.date === day.date && selectedSlot.time === time;
                          return (
                            <button
                              type="button"
                              key={time}
                              onClick={() => setSelectedSlot({ date: day.date, time })}
                              className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold transition ${
                                selected
                                  ? 'border-pink-600 bg-pink-600 text-white'
                                  : 'border-gray-200 bg-white text-gray-700 hover:border-pink-300 hover:bg-pink-50'
                              }`}
                            >
                              <Clock3 className="h-4 w-4" />
                              {time}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => void confirmBooking()}
                disabled={!selectedSlot || isBusy}
                className="w-full rounded-2xl bg-pink-600 py-3 font-bold text-white hover:bg-pink-700 disabled:opacity-50"
              >
                {isBusy ? 'קובע את התור…' : 'אישור וקביעת התור'}
              </button>
            </section>
          )}

          {step === 'DONE' && (
            <section className="py-8 text-center">
              <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-600" />
              <h2 className="mt-4 text-2xl font-bold text-gray-900">התור נקבע בהצלחה</h2>
              {selectedSlot && (
                <p className="mt-2 text-gray-600">
                  {formatDate(selectedSlot.date)} בשעה {selectedSlot.time}
                </p>
              )}
              <p className="mt-2 text-sm text-gray-500">אישור נשלח אליך בהודעה</p>
            </section>
          )}
        </main>
      </div>
    </div>
  );
};
