import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Lock, Phone } from 'lucide-react';

type LoginStep = 'PHONE' | 'OTP';

const OTP_CODE_LENGTH = 6;
const OTP_RESEND_COOLDOWN_SEC = 60;

const normalizeDigits = (value: string) => String(value || '').replace(/\D/g, '');

const toE164 = (value: string) => {
  const digits = normalizeDigits(value);
  if (!digits) return '';
  if (digits.startsWith('0')) {
    return `+972${digits.slice(1)}`;
  }
  if (digits.startsWith('972')) {
    return `+${digits}`;
  }
  if (String(value || '').trim().startsWith('+')) {
    return String(value || '').trim();
  }
  return `+${digits}`;
};

const maskPhoneForDisplay = (value: string) => {
  const digits = normalizeDigits(value);
  if (!digits) return value;
  if (digits.length <= 4) return digits;
  return `•••${digits.slice(-4)}`;
};

export const AdminLogin: React.FC<{
  onAuthenticated: (payload: { phone: string; sessionToken: string }) => void;
}> = ({ onAuthenticated }) => {
  const [step, setStep] = useState<LoginStep>('PHONE');
  const [phone, setPhone] = useState('');
  const [pendingPhone, setPendingPhone] = useState('');
  const [code, setCode] = useState('');
  const [channel, setChannel] = useState<'sms' | 'whatsapp' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [resendAvailableAt, setResendAvailableAt] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const codeRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (step !== 'OTP') return;
    const timer = window.setTimeout(() => {
      codeRef.current?.focus();
      codeRef.current?.select?.();
    }, 50);
    return () => window.clearTimeout(timer);
  }, [step]);

  useEffect(() => {
    if (step !== 'OTP' || !resendAvailableAt) return;
    if (Date.now() >= resendAvailableAt) return;

    const timer = window.setInterval(() => {
      if (Date.now() >= resendAvailableAt) {
        window.clearInterval(timer);
        setTick((value) => value + 1);
        return;
      }
      setTick((value) => value + 1);
    }, 1_000);

    return () => window.clearInterval(timer);
  }, [resendAvailableAt, step]);

  const resendCountdown = useMemo(() => {
    if (!resendAvailableAt) return 0;
    const diff = Math.ceil((resendAvailableAt - Date.now()) / 1000);
    return Math.max(0, diff);
  }, [resendAvailableAt, tick]);

  const handleSend = async () => {
    setError(null);
    const e164 = toE164(phone);
    if (!e164) {
      setError('הזן מספר טלפון תקין.');
      return;
    }
    if (isSending) return;

    setIsSending(true);
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

      setPendingPhone(e164);
      setChannel(payload.channel === 'sms' || payload.channel === 'whatsapp' ? payload.channel : null);
      setResendAvailableAt(Date.now() + OTP_RESEND_COOLDOWN_SEC * 1000);
      setCode('');
      setStep('OTP');
    } catch {
      setError('שליחת קוד נכשלה. נסה שוב.');
    } finally {
      setIsSending(false);
    }
  };

  const handleVerify = async () => {
    setError(null);
    if (!pendingPhone) {
      setStep('PHONE');
      setError('חסר מספר טלפון לאימות. חזור למסך הקודם.');
      return;
    }

    const digits = normalizeDigits(code);
    if (digits.length !== OTP_CODE_LENGTH) {
      setError('הזן קוד בן 6 ספרות.');
      return;
    }
    if (isVerifying) return;

    setIsVerifying(true);
    try {
      const response = await fetch('/api/whatsapp-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', phone: pendingPhone, code: digits })
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

      onAuthenticated({ phone: pendingPhone, sessionToken });
    } catch {
      setError('אימות הקוד נכשל. נסה שוב.');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full bg-gradient-to-br from-pink-100 via-pink-50 to-rose-100 text-gray-900 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-white/90 border border-white/70 backdrop-blur rounded-3xl shadow-xl overflow-hidden">
        <div className="px-7 pt-7 pb-5 bg-gradient-to-r from-rose-500 to-pink-500 text-white">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-white/15 flex items-center justify-center border border-white/20">
              <Lock size={22} />
            </div>
            <div className="min-w-0">
              <div className="text-lg font-semibold leading-tight">כניסת הנהלה</div>
              <div className="text-xs opacity-90 leading-snug">
                גישה ליומן וללקוחות דורשת אימות טלפון.
              </div>
            </div>
          </div>
        </div>

        <div className="px-7 py-6">
          {error && (
            <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 text-rose-800 text-sm px-4 py-3">
              {error}
            </div>
          )}

          {step === 'PHONE' ? (
            <>
              <label className="block text-sm font-medium text-gray-700 mb-2">מספר טלפון</label>
              <div className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm focus-within:ring-2 focus-within:ring-rose-200 focus-within:border-rose-200">
                <Phone size={18} className="text-gray-400" />
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="05X-XXXXXXX"
                  className="w-full bg-transparent outline-none text-gray-900 placeholder:text-gray-400"
                />
              </div>

              <button
                type="button"
                onClick={handleSend}
                disabled={isSending}
                className="mt-5 w-full rounded-2xl bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 text-white font-semibold py-3 shadow-sm transition"
              >
                {isSending ? 'שולח קוד…' : 'שלח קוד אימות'}
              </button>
            </>
          ) : (
            <>
              <div className="text-sm text-gray-700 mb-3">
                שלחנו קוד ל־<span className="font-semibold">{maskPhoneForDisplay(pendingPhone)}</span>
                {channel ? (
                  <span className="text-xs text-gray-500"> ({channel === 'sms' ? 'SMS' : 'WhatsApp'})</span>
                ) : null}
              </div>

              <label className="block text-sm font-medium text-gray-700 mb-2">קוד אימות</label>
              <input
                ref={codeRef}
                value={code}
                onChange={(e) => setCode(normalizeDigits(e.target.value).slice(0, OTP_CODE_LENGTH))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm outline-none focus:ring-2 focus:ring-rose-200 focus:border-rose-200 tracking-widest text-center text-lg font-semibold"
              />

              <button
                type="button"
                onClick={handleVerify}
                disabled={isVerifying}
                className="mt-5 w-full rounded-2xl bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 text-white font-semibold py-3 shadow-sm transition flex items-center justify-center gap-2"
              >
                <CheckCircle2 size={18} />
                {isVerifying ? 'מאמת…' : 'אמת והמשך'}
              </button>

              <div className="mt-4 flex items-center justify-between text-xs text-gray-600">
                <button
                  type="button"
                  onClick={() => {
                    setStep('PHONE');
                    setCode('');
                    setPendingPhone('');
                    setChannel(null);
                    setResendAvailableAt(null);
                    setError(null);
                  }}
                  className="underline hover:text-gray-800"
                >
                  החלף מספר
                </button>

                <button
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={isSending || resendCountdown > 0}
                  className="underline disabled:no-underline disabled:text-gray-400 hover:text-gray-800"
                >
                  {resendCountdown > 0 ? `שלח שוב בעוד ${resendCountdown}s` : isSending ? 'שולח…' : 'שלח שוב'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

