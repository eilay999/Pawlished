import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarPlus, CheckCircle2, ChevronLeft, Clock, Pencil, Plus, ShieldCheck } from 'lucide-react';
import { Appointment, Customer } from '../types';
import {
  AvailabilityDay,
  BookingDog,
  BookingResult,
  DogInput,
  NO_PAYMENT,
  PaymentInfo,
  Profile,
  SessionError,
  addDog,
  createBooking,
  fetchAvailability,
  fetchProfile,
  getPayLink,
  resumeDevice,
  saveCustomerCard,
  sendOtp,
  updateDog,
  verifyOtp
} from './booking/api';
import { DayCalendar, SlotChoice } from './booking/DayCalendar';
import { DogSheet } from './booking/DogSheet';
import { OtpInput } from './booking/OtpInput';
import { WhatsAppButton } from './booking/WhatsAppButton';
import { POLICY_TEXT, REMEMBER_DEVICE_DAYS, otpSenderLink, whatsappLink } from './booking/config';
import { firstName, formatDateLong, maskedPhone, parseIsraeliMobile } from './booking/format';
import { downloadAppointmentIcs } from './booking/ics';
import { clearDeviceToken, clearLastPhone, loadDeviceToken, loadLastPhone, saveDeviceToken, saveLastPhone } from './booking/storage';
import './booking/booking.css';

type Step = 'BOOT' | 'PHONE' | 'OTP' | 'HUB' | 'NEW_CUSTOMER' | 'BOOKING' | 'CONFIRM' | 'PAY' | 'PAID_THANKS' | 'DONE';
type DoneKind = 'BOOKED' | 'CARD_SAVED';

type SheetState =
  | { mode: 'add' }
  | { mode: 'edit'; dog: BookingDog }
  | { mode: 'new-customer-dog' };

// A booking that is waiting for its deposit: the slot is held until expiresAt.
interface HeldBooking {
  appointmentId: string;
  url: string | null;
  amount: number;
  expiresAt: string;
  slot: SlotChoice | null;
  dogName: string;
  startIso: string;
}

const PAY_POLL_MS = 4000;

const formatCountdown = (ms: number): string => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

const OTP_RESEND_COOLDOWN_SEC = 60;
const EMPTY_DOG: DogInput = { name: '', breed: '', sex: '', allergies: '', notes: '' };

interface PublicBookingProps {
  onBookingCreated: (payload: { customer: Customer; appointment: Appointment }) => void;
  onCustomerCreated?: (customer: Customer) => void;
}

const asCustomer = (raw: Record<string, any>): Customer =>
  ({ ...raw, lastVisit: new Date(raw?.lastVisit ?? Date.now()) }) as Customer;

const Brand: React.FC = () => (
  <header className="bk-brand">
    <img src="/icons/icon-192.webp" alt="" width={48} height={48} />
    <div>
      <div className="bk-brand-name">Pawlished</div>
      <div className="bk-brand-sub">מספרת כלבים · קביעת תור</div>
    </div>
  </header>
);

const Steps: React.FC<{ current: 1 | 2 }> = ({ current }) => (
  <div className="bk-steps" aria-label={`שלב ${current} מתוך 2`}>
    <div className="bk-step" data-active={current >= 1}>
      <span className="bk-step-dot">1</span>
      <span>פרטי התור</span>
    </div>
    <div className="bk-step-line" />
    <div className="bk-step" data-active={current >= 2}>
      <span className="bk-step-dot">2</span>
      <span>אישור</span>
    </div>
  </div>
);

export const PublicBooking: React.FC<PublicBookingProps> = ({ onBookingCreated, onCustomerCreated }) => {
  const [step, setStep] = useState<Step>('BOOT');
  const [error, setError] = useState<string | null>(null);

  const [phoneInput, setPhoneInput] = useState(() => loadLastPhone());
  const [consent, setConsent] = useState(false);
  const [remember, setRemember] = useState(true);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [otpPhone, setOtpPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpChannel, setOtpChannel] = useState<'sms' | 'whatsapp' | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [, setTick] = useState(0);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [newCustomer, setNewCustomer] = useState<{ name: string; dog: DogInput }>({ name: '', dog: EMPTY_DOG });
  const [selectedDogId, setSelectedDogId] = useState('');
  const [availability, setAvailability] = useState<AvailabilityDay[]>([]);
  const [slot, setSlot] = useState<SlotChoice | null>(null);
  const [sheet, setSheet] = useState<SheetState | null>(null);

  const [doneKind, setDoneKind] = useState<DoneKind | null>(null);
  const [result, setResult] = useState<BookingResult | null>(null);

  const [busy, setBusy] = useState(false);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);

  const [payment, setPayment] = useState<PaymentInfo>(NO_PAYMENT);
  const [held, setHeld] = useState<HeldBooking | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [payExpired, setPayExpired] = useState(false);
  const [paidFlow, setPaidFlow] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Grow sends the customer back to /booking/?paid=1 after paying.
  const returnedFromPayment = useRef(
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('paid') === '1'
  );

  const sessionRef = useRef('');
  const isNewCustomer = !profile?.exists;

  useEffect(() => {
    document.title = 'קביעת תור | Pawlished';
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  const resetToPhone = useCallback((message?: string) => {
    sessionRef.current = '';
    setSheet(null);
    setProfile(null);
    setSlot(null);
    setResult(null);
    setDoneKind(null);
    setHeld(null);
    setPayExpired(false);
    setPaidFlow(false);
    setNotice(null);
    setOtpCode('');
    setError(message ?? null);
    setStep('PHONE');
  }, []);

  const routeAfterAuth = useCallback(async (token: string): Promise<Profile> => {
    sessionRef.current = token;
    const loaded = await fetchProfile(token);
    setProfile(loaded);
    setSelectedDogId(loaded.dogs[0]?.id ?? '');
    setStep(loaded.exists ? 'HUB' : 'NEW_CUSTOMER');
    return loaded;
  }, []);

  // Run an authenticated call; if the 20-minute session lapsed, silently renew it from the
  // remembered-device token, otherwise send the customer back to verify again.
  const authed = useCallback(
    async <T,>(call: (token: string) => Promise<T>): Promise<T> => {
      try {
        return await call(sessionRef.current);
      } catch (err) {
        if (!(err instanceof SessionError)) throw err;
        const device = loadDeviceToken();
        if (device) {
          try {
            const renewed = await resumeDevice(device);
            sessionRef.current = renewed.sessionToken;
            return await call(renewed.sessionToken);
          } catch (inner) {
            if (!(inner instanceof SessionError)) throw inner;
            clearDeviceToken();
          }
        }
        resetToPhone('פג תוקף האימות. הזינו מספר וקוד מחדש.');
        throw err;
      }
    },
    [resetToPhone]
  );

  // Returning customers with a remembered device skip the code entirely.
  useEffect(() => {
    let cancelled = false;
    const returning = returnedFromPayment.current;
    if (returning) window.history.replaceState(null, '', window.location.pathname);

    const device = loadDeviceToken();
    const fallBack = () => setStep(returning ? 'PAID_THANKS' : 'PHONE');
    if (!device) {
      fallBack();
      return;
    }
    (async () => {
      try {
        const renewed = await resumeDevice(device);
        if (cancelled) return;
        const loaded = await routeAfterAuth(renewed.sessionToken);
        if (cancelled || !returning) return;

        // Back from the payment page: keep watching until the deposit is confirmed.
        const pending = loaded.upcomingAppointments.find((item) => item.status === 'PENDING_PAYMENT');
        if (pending) {
          setHeld({
            appointmentId: pending.id,
            url: null,
            amount: NO_PAYMENT.amount,
            expiresAt: pending.holdExpiresAt ?? new Date(Date.now() + 60000).toISOString(),
            slot: { date: pending.localDate, time: pending.localTime },
            dogName: pending.dogName ?? '',
            startIso: pending.date
          });
          setStep('PAY');
        } else {
          setNotice('התשלום התקבל והתור מאושר ✓');
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof SessionError) clearDeviceToken();
        fallBack();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [routeAfterAuth]);

  useEffect(() => {
    if (step !== 'OTP' || resendAt <= Date.now()) return;
    const timer = window.setInterval(() => {
      setTick((value) => value + 1);
      if (Date.now() >= resendAt) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [step, resendAt]);

  const resendSeconds = Math.max(0, Math.ceil((resendAt - Date.now()) / 1000));

  // One clock for every countdown on screen.
  useEffect(() => {
    if (step !== 'HUB' && step !== 'PAY') return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [step]);

  const loadAvailability = useCallback(async () => {
    setLoadingAvailability(true);
    setAvailabilityError(null);
    try {
      const loaded = await fetchAvailability();
      setAvailability(loaded.days);
      setPayment(loaded.payment);
    } catch (err) {
      setAvailability([]);
      setAvailabilityError(err instanceof Error ? err.message : 'טעינת התורים נכשלה.');
    } finally {
      setLoadingAvailability(false);
    }
  }, []);

  useEffect(() => {
    if (step === 'BOOKING') void loadAvailability();
  }, [step, loadAvailability]);

  /* ---------- waiting for the deposit ---------- */

  useEffect(() => {
    if (step !== 'PAY' || !held) return;
    let stopped = false;

    const check = async () => {
      if (stopped) return;
      try {
        let fresh: Profile;
        try {
          fresh = await fetchProfile(sessionRef.current);
        } catch (err) {
          if (!(err instanceof SessionError)) throw err;
          const device = loadDeviceToken();
          // Without a remembered device the 20-minute session cannot be renewed quietly. Stay put:
          // the confirmation still reaches the customer by message once the payment lands.
          if (!device) return;
          const renewed = await resumeDevice(device);
          sessionRef.current = renewed.sessionToken;
          fresh = await fetchProfile(renewed.sessionToken);
        }
        if (stopped) return;
        setProfile(fresh);

        const mine = fresh.upcomingAppointments.find((item) => item.id === held.appointmentId);
        if (mine?.status === 'SCHEDULED') {
          setResult(
            (current) =>
              current ??
              ({
                customer: {},
                appointment: { id: held.appointmentId, date: held.startIso },
                dog: { name: held.dogName }
              } as unknown as BookingResult)
          );
          if (held.slot) setSlot(held.slot);
          setPaidFlow(true);
          setDoneKind('BOOKED');
          setStep('DONE');
        } else if (!mine) {
          setPayExpired(true);
        }
      } catch {
        // A hiccup in the network: the next tick tries again.
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    const poll = window.setInterval(onVisible, PAY_POLL_MS);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    void check();

    return () => {
      stopped = true;
      window.clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [step, held]);

  const handleFreshPayLink = async () => {
    if (!held || busy) return;
    setBusy(true);
    setError(null);
    try {
      const link = await authed((token) => getPayLink(token, held.appointmentId));
      setHeld({ ...held, url: link.url, amount: link.amount, expiresAt: link.expiresAt });
    } catch (err) {
      if (!(err instanceof SessionError)) setError(err instanceof Error ? err.message : 'לא הצלחנו להכין קישור תשלום.');
    } finally {
      setBusy(false);
    }
  };

  const handlePayFromHub = async (appointmentId: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const link = await authed((token) => getPayLink(token, appointmentId));
      window.location.assign(link.url);
    } catch (err) {
      if (!(err instanceof SessionError)) setError(err instanceof Error ? err.message : 'לא הצלחנו להכין קישור תשלום.');
    } finally {
      setBusy(false);
    }
  };

  /* ---------- phone + code ---------- */

  const handleSendOtp = async (forcedPhone?: string) => {
    const parsed = forcedPhone ? { e164: forcedPhone } : parseIsraeliMobile(phoneInput);
    if (!parsed) {
      setError('הזינו מספר נייד ישראלי תקין, לדוגמה 050-123-4567.');
      return;
    }
    if (!forcedPhone && !consent) {
      setError('כדי להמשיך צריך לאשר את שמירת הפרטים.');
      return;
    }
    if (busy) return;

    setError(null);
    setBusy(true);
    try {
      const { channel } = await sendOtp(parsed.e164);
      setOtpPhone(parsed.e164);
      setOtpChannel(channel);
      setOtpCode('');
      setResendAt(Date.now() + OTP_RESEND_COOLDOWN_SEC * 1000);
      setStep('OTP');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שליחת הקוד נכשלה.');
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async (code: string) => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const verified = await verifyOtp(otpPhone, code, remember);
      if (remember && verified.deviceToken) {
        saveDeviceToken(verified.deviceToken);
        saveLastPhone(phoneInput);
      } else {
        clearDeviceToken();
        clearLastPhone();
      }
      await routeAfterAuth(verified.sessionToken);
    } catch (err) {
      setOtpCode('');
      setError(err instanceof Error ? err.message : 'האימות נכשל.');
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = () => {
    clearDeviceToken();
    clearLastPhone();
    setPhoneInput('');
    setConsent(false);
    resetToPhone();
  };

  /* ---------- dogs ---------- */

  const handleDogSubmit = async (dog: DogInput) => {
    if (!sheet) return;

    if (sheet.mode === 'new-customer-dog') {
      setNewCustomer((current) => ({ ...current, dog }));
      setSheet(null);
      return;
    }

    if (sheet.mode === 'add') {
      const created = await authed((token) => addDog(token, dog));
      setProfile((current) => (current ? { ...current, dogs: [...current.dogs, created] } : current));
      setSelectedDogId(created.id);
    } else {
      const updated = await authed((token) => updateDog(token, sheet.dog.id, dog));
      setProfile((current) =>
        current ? { ...current, dogs: current.dogs.map((d) => (d.id === updated.id ? updated : d)) } : current
      );
    }
    setSheet(null);
  };

  /* ---------- new customer ---------- */

  const handleContinueNewCustomer = () => {
    if (!newCustomer.name.trim()) {
      setError('איך קוראים לכם?');
      return;
    }
    if (!newCustomer.dog.name.trim()) {
      setError('איך קוראים לכלב?');
      return;
    }
    setError(null);
    setStep('BOOKING');
  };

  const handleSaveCardOnly = async () => {
    if (!newCustomer.name.trim() || !newCustomer.dog.name.trim()) {
      setError('מלאו שם ושם כלב כדי לשמור כרטיס.');
      return;
    }
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const saved = await authed((token) =>
        saveCustomerCard(token, { name: newCustomer.name.trim(), dog: newCustomer.dog })
      );
      onCustomerCreated?.(asCustomer(saved.customer));
      setDoneKind('CARD_SAVED');
      setStep('DONE');
    } catch (err) {
      if (!(err instanceof SessionError)) setError(err instanceof Error ? err.message : 'השמירה נכשלה.');
    } finally {
      setBusy(false);
    }
  };

  /* ---------- booking ---------- */

  const startBooking = () => {
    setSlot(null);
    setAcceptedTerms(false);
    setNotice(null);
    setError(null);
    if (profile && profile.dogs.length > 0 && !profile.dogs.some((d) => d.id === selectedDogId)) {
      setSelectedDogId(profile.dogs[0].id);
    }
    setStep('BOOKING');
  };

  const selectedDog: { name: string; breed: string } | null = isNewCustomer
    ? newCustomer.dog.name
      ? { name: newCustomer.dog.name, breed: newCustomer.dog.breed }
      : null
    : profile?.dogs.find((d) => d.id === selectedDogId) ?? null;

  const canContinueToConfirm = Boolean(slot && selectedDog);

  const handleConfirmBooking = async () => {
    if (!slot || !selectedDog || busy) return;
    if (!acceptedTerms) {
      setError('יש לאשר את התקנון ומדיניות הביטולים לפני קביעת התור.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const booked = await authed((token) =>
        createBooking(
          token,
          isNewCustomer
            ? { ...slot, newCustomer: { name: newCustomer.name.trim(), dog: newCustomer.dog } }
            : { ...slot, dogId: selectedDogId }
        )
      );
      setResult(booked);
      onBookingCreated({
        customer: asCustomer(booked.customer),
        appointment: { ...booked.appointment, date: new Date(booked.appointment.date) } as Appointment
      });
      if (booked.payment) {
        // Held, not confirmed: the slot is kept for a while and confirmed once the deposit is paid.
        setHeld({
          appointmentId: String(booked.appointment.id),
          url: booked.payment.url,
          amount: booked.payment.amount,
          expiresAt: booked.payment.expiresAt,
          slot,
          dogName: booked.dog?.name || selectedDog.name,
          startIso: String(booked.appointment.date)
        });
        setPayExpired(false);
        setPaidFlow(false);
        setNowMs(Date.now());
        setStep('PAY');
      } else {
        setDoneKind('BOOKED');
        setStep('DONE');
      }
      void authed(fetchProfile)
        .then((fresh) => setProfile(fresh))
        .catch(() => undefined);
    } catch (err) {
      if (err instanceof SessionError) return;
      const message = err instanceof Error ? err.message : 'יצירת התור נכשלה.';
      if (/תפוס|נתפס/.test(message)) {
        setError('השעה שבחרתם כבר נתפסה. בחרו שעה אחרת.');
        setSlot(null);
        setStep('BOOKING');
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  };

  const goHub = async () => {
    setBusy(true);
    try {
      const fresh = await authed(fetchProfile);
      setProfile(fresh);
      setSelectedDogId(fresh.dogs[0]?.id ?? '');
      setSlot(null);
      setResult(null);
      setDoneKind(null);
      setHeld(null);
      setPayExpired(false);
      setPaidFlow(false);
      setStep(fresh.exists ? 'HUB' : 'NEW_CUSTOMER');
    } catch (err) {
      if (!(err instanceof SessionError)) setError(err instanceof Error ? err.message : 'הטעינה נכשלה.');
    } finally {
      setBusy(false);
    }
  };

  const privacyLink = (
    <a href="/privacy-policy.html" target="_blank" rel="noopener noreferrer" className="bk-link" style={{ padding: 0, minHeight: 0 }}>
      מדיניות פרטיות
    </a>
  );

  const errorBox = error ? (
    <div className="bk-error" role="alert" style={{ marginBottom: 16 }}>
      {error}
    </div>
  ) : null;

  const stickyVisible = step === 'BOOKING' || step === 'CONFIRM';

  /* ---------- screens ---------- */

  const renderPhone = () => (
    <section className="bk-card" aria-labelledby="bk-title">
      <h1 id="bk-title" className="bk-h1">ברוכים הבאים</h1>
      <p className="bk-sub">הזינו את מספר הנייד כדי לקבוע תור או לראות את התורים שלכם.</p>

      {errorBox}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void handleSendOtp();
        }}
        style={{ display: 'grid', gap: 16 }}
        noValidate
      >
        <div>
          <label className="bk-label" htmlFor="bk-phone">מספר נייד</label>
          <div className="bk-phone">
            <span className="bk-phone-prefix" aria-hidden="true">+972</span>
            <input
              id="bk-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="50-123-4567"
              value={phoneInput}
              onChange={(event) => setPhoneInput(event.target.value)}
            />
          </div>
        </div>

        <div className="bk-hint">
          <span aria-hidden="true">💡</span>
          <span><strong>פעם ראשונה כאן?</strong> פשוט הזינו את המספר, ואת השאר נסיים יחד תוך דקה.</span>
        </div>

        <label className="bk-check">
          <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
          <span>
            אני מאשר/ת שהפרטים שלי (שם, טלפון ופרטי הכלב) יישמרו אצל <bdi>Pawlished</bdi> לצורך ניהול התורים ויצירת קשר איתי. {privacyLink}
          </span>
        </label>

        <label className="bk-check">
          <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
          <span>
            זכרו אותי במכשיר הזה
            <span className="bk-small" style={{ display: 'block' }}>
              בפעם הבאה בלי קוד אימות, למשך {REMEMBER_DEVICE_DAYS} יום. נשמר רק בדפדפן שלכם, בלי עוגיות מעקב.
            </span>
          </span>
        </label>

        <button type="submit" className="bk-btn bk-btn-primary" disabled={busy}>
          {busy ? 'שולחים קוד…' : 'שליחת קוד אימות'}
        </button>
        <p className="bk-small" style={{ margin: 0, textAlign: 'center' }}>הקוד נשלח בהודעה – וואטסאפ או SMS.</p>
      </form>
    </section>
  );

  const renderOtp = () => (
    <section className="bk-card" aria-labelledby="bk-title">
      <button type="button" className="bk-link" onClick={() => { setOtpCode(''); setError(null); setStep('PHONE'); }}>
        ← החלפת מספר
      </button>
      <h1 id="bk-title" className="bk-h1" style={{ marginTop: 8 }}>הזינו את הקוד</h1>
      <p className="bk-sub">
        שלחנו קוד בן 6 ספרות אל <bdi dir="ltr">{maskedPhone(otpPhone)}</bdi>
        {otpChannel && <> · <span className="bk-pill">{otpChannel === 'sms' ? 'SMS' : 'וואטסאפ'}</span></>}
      </p>

      {errorBox}

      <OtpInput
        value={otpCode}
        onChange={setOtpCode}
        onComplete={(code) => void handleVerify(code)}
        disabled={busy}
        hasError={Boolean(error)}
      />

      <div style={{ display: 'grid', gap: 10, marginTop: 20 }}>
        <button
          type="button"
          className="bk-btn bk-btn-primary"
          disabled={busy || otpCode.length !== 6}
          onClick={() => void handleVerify(otpCode)}
        >
          {busy ? 'מאמתים…' : 'אימות'}
        </button>
        <button
          type="button"
          className="bk-btn bk-btn-ghost"
          disabled={busy || resendSeconds > 0}
          onClick={() => void handleSendOtp(otpPhone)}
        >
          {resendSeconds > 0 ? `אפשר לשלוח שוב בעוד ${resendSeconds} שנ׳` : 'לא קיבלתם קוד? שלחו שוב'}
        </button>
      </div>

      {otpChannel !== 'sms' && (
        <div className="bk-hint bk-hint-warn" style={{ marginTop: 16 }}>
          <span aria-hidden="true">💬</span>
          <span>
            הקוד לא מגיע? וואטסאפ מאפשר לנו לשלוח קוד רק אחרי שכתבתם לנו.{' '}
            <a href={otpSenderLink('היי')} target="_blank" rel="noopener noreferrer" className="bk-link" style={{ padding: 0, minHeight: 0 }}>
              שלחו "היי" בוואטסאפ
            </a>
            , ואז לחצו על "שלחו שוב".
          </span>
        </div>
      )}
    </section>
  );

  const renderHub = () => {
    const appointments = profile?.upcomingAppointments ?? [];
    const dogs = profile?.dogs ?? [];
    return (
      <div style={{ display: 'grid', gap: 18 }}>
        <section className="bk-card" aria-labelledby="bk-title">
          <h1 id="bk-title" className="bk-h1">היי {firstName(profile?.customer?.name ?? '')} 👋</h1>
          <p className="bk-sub" style={{ marginBottom: 16 }}>מה נעשה היום?</p>
          {notice && (
            <div className="bk-hint" role="status" style={{ marginBottom: 16 }}>{notice}</div>
          )}
          {errorBox}
          <button type="button" className="bk-btn bk-btn-primary" onClick={startBooking}>
            <CalendarPlus size={20} /> קביעת תור חדש
          </button>
        </section>

        <section className="bk-card" aria-labelledby="bk-appts">
          <h2 id="bk-appts" className="bk-h2">התורים הקרובים</h2>
          {appointments.length === 0 ? (
            <p className="bk-small" style={{ margin: 0 }}>אין תורים קרובים. אפשר לקבוע תור חדש בלחיצה על הכפתור למעלה.</p>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {appointments.map((appt) => {
                const isPending = appt.status === 'PENDING_PAYMENT';
                const remaining = isPending && appt.holdExpiresAt ? new Date(appt.holdExpiresAt).getTime() - nowMs : 0;
                const change = whatsappLink(
                  `שלום, אשמח לשנות או לבטל את התור ${appt.dogName ? `של ${appt.dogName} ` : ''}ב-${formatDateLong(appt.localDate)} בשעה ${appt.localTime}`
                );
                return (
                  <div key={appt.id} className="bk-appt">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                      <div>
                        <div className="bk-appt-date">{formatDateLong(appt.localDate)}</div>
                        {appt.dogName && <span className="bk-pill" style={{ marginTop: 6 }}>🐶 {appt.dogName}</span>}
                      </div>
                      <div className="bk-appt-time">{appt.localTime}</div>
                    </div>
                    {isPending && (
                      <div className="bk-hint bk-hint-warn" role="status">
                        <span aria-hidden="true">⏳</span>
                        <span>
                          {remaining > 0 ? (
                            <>ממתין לתשלום דמי קביעה. השעה שמורה עוד <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCountdown(remaining)}</strong>, ואז היא מתפנה.</>
                          ) : (
                            'ההמתנה לתשלום הסתיימה והשעה שוחררה.'
                          )}
                        </span>
                      </div>
                    )}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {isPending ? (
                        remaining > 0 && (
                          <button
                            type="button"
                            className="bk-btn bk-btn-primary bk-btn-compact"
                            disabled={busy}
                            onClick={() => void handlePayFromHub(appt.id)}
                          >
                            המשך לתשלום
                          </button>
                        )
                      ) : (
                        <button
                          type="button"
                          className="bk-btn bk-btn-secondary bk-btn-compact"
                          onClick={() => downloadAppointmentIcs({ id: appt.id, startIso: appt.date, dogName: appt.dogName })}
                        >
                          הוספה ליומן
                        </button>
                      )}
                      {change && (
                        <a className="bk-btn bk-btn-secondary bk-btn-compact" href={change} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                          שינוי או ביטול
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <p className="bk-small" style={{ margin: '14px 0 0' }}>{POLICY_TEXT}</p>
        </section>

        <section className="bk-card" aria-labelledby="bk-dogs">
          <h2 id="bk-dogs" className="bk-h2">הכלבים שלכם</h2>
          <div style={{ display: 'grid', gap: 10 }}>
            {dogs.map((dog) => (
              <div key={dog.id} className="bk-row">
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--bk-ink)' }}>{dog.name}</div>
                  {dog.breed && <div className="bk-small">{dog.breed}</div>}
                </div>
                <button type="button" className="bk-btn bk-btn-secondary bk-btn-compact" onClick={() => setSheet({ mode: 'edit', dog })}>
                  <Pencil size={16} /> עריכה
                </button>
              </div>
            ))}
            <button type="button" className="bk-btn bk-btn-secondary" onClick={() => setSheet({ mode: 'add' })}>
              <Plus size={18} /> הוספת כלב
            </button>
          </div>
        </section>

        <div style={{ textAlign: 'center' }}>
          <button type="button" className="bk-link" onClick={handleLogout}>לא אתם? החלפת משתמש</button>
        </div>
      </div>
    );
  };

  const renderNewCustomer = () => (
    <section className="bk-card" aria-labelledby="bk-title">
      <h1 id="bk-title" className="bk-h1">נעים להכיר!</h1>
      <p className="bk-sub">ספרו לנו קצת עליכם ועל הכלב, ונמשיך לבחירת תור.</p>

      {errorBox}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          handleContinueNewCustomer();
        }}
        style={{ display: 'grid', gap: 16 }}
        noValidate
      >
        <div>
          <label className="bk-label" htmlFor="bk-name">שם מלא *</label>
          <input
            id="bk-name"
            className="bk-input"
            autoComplete="name"
            value={newCustomer.name}
            onChange={(event) => setNewCustomer((current) => ({ ...current, name: event.target.value }))}
          />
        </div>
        <div>
          <label className="bk-label" htmlFor="bk-dog-name">שם הכלב *</label>
          <input
            id="bk-dog-name"
            className="bk-input"
            autoComplete="off"
            value={newCustomer.dog.name}
            onChange={(event) => setNewCustomer((current) => ({ ...current, dog: { ...current.dog, name: event.target.value } }))}
          />
        </div>
        <div>
          <label className="bk-label" htmlFor="bk-dog-breed">גזע</label>
          <input
            id="bk-dog-breed"
            className="bk-input"
            autoComplete="off"
            placeholder="לדוגמה: פודל טוי"
            value={newCustomer.dog.breed}
            onChange={(event) => setNewCustomer((current) => ({ ...current, dog: { ...current.dog, breed: event.target.value } }))}
          />
        </div>
        <button type="button" className="bk-link" style={{ justifySelf: 'start' }} onClick={() => setSheet({ mode: 'new-customer-dog' })}>
          עוד פרטים על הכלב (לא חובה)
        </button>

        <button type="submit" className="bk-btn bk-btn-primary">המשך לבחירת תור</button>
        <button type="button" className="bk-btn bk-btn-secondary" disabled={busy} onClick={() => void handleSaveCardOnly()}>
          {busy ? 'שומרים…' : 'שמרו לי כרטיס בלי לקבוע תור'}
        </button>
      </form>
    </section>
  );

  const renderBooking = () => {
    const dogs = profile?.dogs ?? [];
    const help = whatsappLink('שלום, לא מצאתי מועד מתאים לתור. אשמח לעזרה');
    return (
      <section className="bk-card" aria-labelledby="bk-title">
        <button type="button" className="bk-link" onClick={() => { setError(null); setStep(isNewCustomer ? 'NEW_CUSTOMER' : 'HUB'); }}>
          → חזרה
        </button>
        <Steps current={1} />
        <h1 id="bk-title" className="bk-h1">פרטי התור</h1>
        <p className="bk-sub">בחרו מי מגיע, ואז תאריך ושעה.</p>

        {errorBox}

        <div style={{ marginBottom: 24 }}>
          <div className="bk-h2">מי מגיע?</div>
          {isNewCustomer ? (
            <div className="bk-row">
              <div>
                <div style={{ fontWeight: 600, color: 'var(--bk-ink)' }}>{newCustomer.dog.name}</div>
                {newCustomer.dog.breed && <div className="bk-small">{newCustomer.dog.breed}</div>}
              </div>
              <button type="button" className="bk-btn bk-btn-secondary bk-btn-compact" onClick={() => setSheet({ mode: 'new-customer-dog' })}>
                <Pencil size={16} /> עריכה
              </button>
            </div>
          ) : dogs.length === 0 ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div className="bk-hint bk-hint-warn">עוד לא הוספנו כלב לכרטיס שלכם. הוסיפו כלב כדי להמשיך.</div>
              <button type="button" className="bk-btn bk-btn-primary" onClick={() => setSheet({ mode: 'add' })}>
                <Plus size={18} /> הוספת כלב
              </button>
            </div>
          ) : (
            <>
              <div className="bk-chips" role="radiogroup" aria-label="בחירת כלב">
                {dogs.map((dog) => (
                  <button
                    key={dog.id}
                    type="button"
                    role="radio"
                    aria-checked={dog.id === selectedDogId}
                    className="bk-chip"
                    onClick={() => setSelectedDogId(dog.id)}
                  >
                    🐶 {dog.name}
                    {dog.breed && <span className="bk-chip-sub">{dog.breed}</span>}
                  </button>
                ))}
                <button type="button" className="bk-chip" onClick={() => setSheet({ mode: 'add' })}>
                  <Plus size={16} /> כלב נוסף
                </button>
              </div>
              {profile?.dogs.find((d) => d.id === selectedDogId) && (
                <button
                  type="button"
                  className="bk-link"
                  onClick={() => setSheet({ mode: 'edit', dog: profile!.dogs.find((d) => d.id === selectedDogId)! })}
                >
                  עריכת פרטי {profile!.dogs.find((d) => d.id === selectedDogId)!.name}
                </button>
              )}
            </>
          )}
        </div>

        <div>
          <div className="bk-h2">מתי?</div>
          {loadingAvailability ? (
            <div style={{ display: 'grid', gap: 10 }} aria-live="polite" aria-busy="true">
              <div className="bk-skeleton" /><div className="bk-skeleton" style={{ height: 180 }} />
            </div>
          ) : availabilityError ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div className="bk-error" role="alert">{availabilityError}</div>
              <button type="button" className="bk-btn bk-btn-secondary" onClick={() => void loadAvailability()}>נסו שוב</button>
            </div>
          ) : (
            <DayCalendar days={availability} selected={slot} onSelect={setSlot} />
          )}
        </div>

        {help && (
          <div className="bk-hint bk-hint-warn" style={{ marginTop: 20 }}>
            <span aria-hidden="true">🕒</span>
            <span>
              לא מצאתם מועד מתאים?{' '}
              <a href={help} target="_blank" rel="noopener noreferrer" className="bk-link" style={{ padding: 0, minHeight: 0 }}>
                כתבו לנו בוואטסאפ
              </a>{' '}
              ונמצא פתרון.
            </span>
          </div>
        )}
      </section>
    );
  };

  const renderConfirm = () => (
    <section className="bk-card" aria-labelledby="bk-title">
      <button type="button" className="bk-link" disabled={busy} onClick={() => { setError(null); setStep('BOOKING'); }}>
        → חזרה לעריכה
      </button>
      <Steps current={2} />
      <h1 id="bk-title" className="bk-h1">אישור התור</h1>
      <p className="bk-sub">
        {payment.required
          ? `בדקו שהכול נכון. אחרי האישור תעברו לתשלום דמי קביעה (₪${payment.amount}), והתור יאושר ברגע שהתשלום יתקבל.`
          : 'בדקו שהכול נכון ולחצו על אישור.'}
      </p>

      {errorBox}

      {slot && selectedDog && (
        <div style={{ display: 'grid', gap: 10, marginBottom: 18 }}>
          <div className="bk-row"><span className="bk-small">כלב</span><strong style={{ color: 'var(--bk-ink)' }}>{selectedDog.name}{selectedDog.breed ? ` · ${selectedDog.breed}` : ''}</strong></div>
          <div className="bk-row"><span className="bk-small">תאריך</span><strong style={{ color: 'var(--bk-ink)' }}>{formatDateLong(slot.date)}</strong></div>
          <div className="bk-row"><span className="bk-small">שעה</span><strong style={{ color: 'var(--bk-ink)', fontVariantNumeric: 'tabular-nums' }}>{slot.time}</strong></div>
        </div>
      )}

      <div className="bk-hint bk-hint-warn">
        <ShieldCheck size={20} style={{ flex: 'none', marginTop: 2 }} aria-hidden="true" />
        <span><strong>דמי קביעה ומדיניות ביטולים.</strong> {POLICY_TEXT}</span>
      </div>

      {payment.required && (
        <div className="bk-hint" style={{ marginTop: 10 }}>
          <Clock size={20} style={{ flex: 'none', marginTop: 2 }} aria-hidden="true" />
          <span>השעה תישמר לכם {payment.holdMinutes} דקות מרגע האישור. אם התשלום לא יתקבל בזמן, היא תתפנה ללקוחות אחרים.</span>
        </div>
      )}

      <label className="bk-check" style={{ marginTop: 14 }}>
        <input
          type="checkbox"
          checked={acceptedTerms}
          aria-required="true"
          onChange={(event) => setAcceptedTerms(event.target.checked)}
        />
        <span>
          קראתי ואני מאשר/ת את{' '}
          <a href="/terms.html" target="_blank" rel="noopener noreferrer" className="bk-link" style={{ padding: 0, minHeight: 0 }}>
            התקנון ומדיניות הביטולים
          </a>
        </span>
      </label>
    </section>
  );

  const renderDone = () => {
    const booked = doneKind === 'BOOKED' && result;
    const confirmation = result?.confirmation;
    return (
      <section className="bk-card" aria-labelledby="bk-title" style={{ textAlign: 'center' }}>
        <div className="bk-success"><CheckCircle2 size={48} aria-hidden="true" /></div>
        <h1 id="bk-title" className="bk-h1">{booked ? (paidFlow ? 'התשלום התקבל והתור אושר!' : 'התור נקבע!') : 'הכרטיס נשמר'}</h1>

        {booked && slot ? (
          <>
            <p className="bk-sub" style={{ marginBottom: 12 }}>
              {formatDateLong(slot.date)} בשעה <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{slot.time}</strong>
              {result?.dog?.name ? ` · ${result.dog.name}` : ''}
            </p>
            <div className={!paidFlow && confirmation?.ok === false ? 'bk-hint bk-hint-warn' : 'bk-hint'} style={{ textAlign: 'start', marginBottom: 16 }}>
              {paidFlow
                ? 'קיבלנו את דמי הקביעה והתור שמור לכם. אפשר לראות אותו בעמוד התורים שלכם.'
                : confirmation?.ok === false
                  ? 'התור נקבע, אבל לא הצלחנו לשלוח הודעת אישור. אפשר לראות אותו בעמוד התורים שלכם.'
                  : `שלחנו לכם הודעת אישור${confirmation?.channel === 'sms' ? ' ב-SMS' : ' בוואטסאפ'}.`}
            </div>
            <p className="bk-small" style={{ margin: '0 0 18px', textAlign: 'start' }}>{POLICY_TEXT}</p>
          </>
        ) : (
          <p className="bk-sub">שמרנו את הפרטים שלכם. בפעם הבאה אפשר לקבוע תור בכמה לחיצות.</p>
        )}

        <div style={{ display: 'grid', gap: 10 }}>
          {booked && result && (
            <button
              type="button"
              className="bk-btn bk-btn-secondary"
              onClick={() =>
                downloadAppointmentIcs({
                  id: String(result.appointment.id),
                  startIso: String(result.appointment.date),
                  dogName: result.dog?.name
                })
              }
            >
              <CalendarPlus size={20} /> הוספה ליומן
            </button>
          )}
          <button type="button" className="bk-btn bk-btn-primary" disabled={busy} onClick={() => void goHub()}>
            {booked ? 'לתורים שלי' : 'המשך לקביעת תור'} <ChevronLeft size={18} aria-hidden="true" />
          </button>
        </div>
      </section>
    );
  };

  const renderPay = () => {
    if (!held) return null;
    const remaining = new Date(held.expiresAt).getTime() - nowMs;
    const expired = payExpired || remaining <= 0;
    const waitingForUrl = !held.url && !expired;

    return (
      <section className="bk-card" aria-labelledby="bk-title" style={{ textAlign: 'center' }}>
        <div
          className="bk-success"
          style={{ background: expired ? '#fee2e2' : '#fef3c7', color: expired ? '#b91c1c' : '#b45309' }}
        >
          <Clock size={44} aria-hidden="true" />
        </div>

        {expired ? (
          <>
            <h1 id="bk-title" className="bk-h1">ההמתנה לתשלום הסתיימה</h1>
            <p className="bk-sub">
              השעה שוחררה כדי שתהיה פנויה ללקוחות אחרים. אם כבר שילמתם, נחזור אליכם בהודעה. אחרת אפשר לקבוע תור מחדש.
            </p>
            <button type="button" className="bk-btn bk-btn-primary" disabled={busy} onClick={() => void goHub()}>
              חזרה לתורים שלי
            </button>
          </>
        ) : (
          <>
            <h1 id="bk-title" className="bk-h1">{waitingForUrl ? 'בודקים את התשלום…' : 'עוד שלב אחד ואישרנו את התור'}</h1>
            <p className="bk-sub">
              {waitingForUrl
                ? 'ברגע שהתשלום יתקבל התור יאושר והדף יתעדכן לבד.'
                : `שלמו דמי קביעה של ₪${held.amount} (יקוזזו מהתשלום על הטיפול). ברגע שהתשלום יתקבל התור מאושר.`}
            </p>

            {errorBox}

            <div className="bk-hint bk-hint-warn" role="timer" style={{ justifyContent: 'center', marginBottom: 16 }}>
              <span>
                השעה שמורה לכם עוד{' '}
                <strong style={{ fontVariantNumeric: 'tabular-nums', fontSize: '1.125rem' }}>{formatCountdown(remaining)}</strong>
              </span>
            </div>

            {held.slot && (
              <div style={{ display: 'grid', gap: 10, marginBottom: 18, textAlign: 'start' }}>
                {held.dogName && (
                  <div className="bk-row"><span className="bk-small">כלב</span><strong style={{ color: 'var(--bk-ink)' }}>{held.dogName}</strong></div>
                )}
                <div className="bk-row"><span className="bk-small">תאריך</span><strong style={{ color: 'var(--bk-ink)' }}>{formatDateLong(held.slot.date)}</strong></div>
                <div className="bk-row"><span className="bk-small">שעה</span><strong style={{ color: 'var(--bk-ink)', fontVariantNumeric: 'tabular-nums' }}>{held.slot.time}</strong></div>
              </div>
            )}

            <div style={{ display: 'grid', gap: 10 }}>
              {held.url && (
                <a
                  className="bk-btn bk-btn-primary"
                  href={held.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ textDecoration: 'none' }}
                >
                  לתשלום ₪{held.amount} בכרטיס או בביט
                </a>
              )}
              <button type="button" className="bk-btn bk-btn-ghost" disabled={busy} onClick={() => void handleFreshPayLink()}>
                {busy ? 'מכינים קישור…' : 'הקישור לא נפתח? קבלו קישור חדש'}
              </button>
            </div>

            <p className="bk-small" style={{ margin: '16px 0 0', textAlign: 'start' }}>
              אחרי התשלום אפשר לחזור לכאן, הדף מתעדכן לבד. {POLICY_TEXT}
            </p>
          </>
        )}
      </section>
    );
  };

  const renderPaidThanks = () => (
    <section className="bk-card" aria-labelledby="bk-title" style={{ textAlign: 'center' }}>
      <div className="bk-success"><CheckCircle2 size={48} aria-hidden="true" /></div>
      <h1 id="bk-title" className="bk-h1">תודה!</h1>
      <p className="bk-sub">אם התשלום הושלם, התור יאושר תוך רגע ונעדכן אתכם בהודעה. אפשר לסגור את הדף, או להיכנס כדי לראות את התורים שלכם.</p>
      <button type="button" className="bk-btn bk-btn-primary" onClick={() => setStep('PHONE')}>
        כניסה לתורים שלי
      </button>
    </section>
  );

  const renderBoot = () => (
    <section className="bk-card" aria-busy="true" aria-live="polite">
      <p className="bk-sub" style={{ marginBottom: 14 }}>מחברים אתכם…</p>
      <div style={{ display: 'grid', gap: 10 }}>
        <div className="bk-skeleton" /><div className="bk-skeleton" style={{ width: '70%' }} />
      </div>
    </section>
  );

  const slotSummary = slot ? `${formatDateLong(slot.date)} · ${slot.time}` : 'בחרו תאריך ושעה';

  return (
    <div className="bk-root" dir="rtl">
      <div className="bk-shell">
        <Brand />
        <main>
          {step === 'BOOT' && renderBoot()}
          {step === 'PHONE' && renderPhone()}
          {step === 'OTP' && renderOtp()}
          {step === 'HUB' && renderHub()}
          {step === 'NEW_CUSTOMER' && renderNewCustomer()}
          {step === 'BOOKING' && renderBooking()}
          {step === 'CONFIRM' && renderConfirm()}
          {step === 'PAY' && renderPay()}
          {step === 'PAID_THANKS' && renderPaidThanks()}
          {step === 'DONE' && renderDone()}
        </main>
        <footer className="bk-small" style={{ textAlign: 'center', marginTop: 24 }}>
          <nav aria-label="מידע משפטי" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '12px' }}>
            <a href="/accessibility.html" className="bk-link" style={{ padding: 0, minHeight: 0, fontSize: '0.8125rem' }}>הצהרת נגישות</a>
            <a href="/terms.html" className="bk-link" style={{ padding: 0, minHeight: 0, fontSize: '0.8125rem' }}>תקנון וביטולים</a>
            <a href="/privacy-policy.html" className="bk-link" style={{ padding: 0, minHeight: 0, fontSize: '0.8125rem' }}>מדיניות פרטיות</a>
          </nav>
        </footer>
      </div>

      {step === 'BOOKING' && (
        <div className="bk-sticky">
          <div className="bk-sticky-inner">
            <div className="bk-sticky-summary" aria-live="polite">{slotSummary}</div>
            <button
              type="button"
              className="bk-btn bk-btn-primary"
              disabled={!canContinueToConfirm}
              onClick={() => { setError(null); setStep('CONFIRM'); }}
            >
              המשך לאישור
            </button>
          </div>
        </div>
      )}

      {step === 'CONFIRM' && (
        <div className="bk-sticky">
          <div className="bk-sticky-inner">
            <button type="button" className="bk-btn bk-btn-primary" disabled={busy} onClick={() => void handleConfirmBooking()}>
              {busy
                ? payment.required ? 'מכינים את התשלום…' : 'קובעים את התור…'
                : payment.required ? 'אישור ומעבר לתשלום' : 'אישור והזמנת תור'}
            </button>
          </div>
        </div>
      )}

      <WhatsAppButton raised={stickyVisible} />

      {sheet && (
        <DogSheet
          title={sheet.mode === 'edit' ? `עריכת פרטי ${sheet.dog.name}` : 'הוספת כלב'}
          submitLabel={sheet.mode === 'edit' ? 'שמירת שינויים' : sheet.mode === 'add' ? 'הוספת הכלב' : 'שמירה'}
          initial={sheet.mode === 'edit' ? sheet.dog : sheet.mode === 'new-customer-dog' ? newCustomer.dog : undefined}
          onSubmit={handleDogSubmit}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
};
