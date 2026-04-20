import React, { useMemo, useState } from 'react';
import { Calendar, Phone, User, Dog, CheckCircle2 } from 'lucide-react';
import { Appointment, AppointmentStatus, Customer } from '../types';
import { APPOINTMENT_DURATION_MINUTES } from '../constants';

type BookingStep = 'PHONE' | 'DETAILS' | 'BOOKING' | 'DONE';

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

const WEEKLY_SLOTS: Record<number, string[]> = {
  // 0=Sunday ... 6=Saturday
  0: ['07:00', '08:00'],
  1: ['09:00', '12:00', '15:00'],
  2: ['09:00', '12:00', '15:00'],
  3: ['08:00', '11:00', '14:00'],
  4: ['07:00', '08:00'],
  5: ['07:00', '08:00'],
  6: []
};

const normalizeDigits = (value: string) => value.replace(/\D/g, '');

const normalizePhoneForCompare = (value: string) => {
  const digits = normalizeDigits(value);
  if (digits.startsWith('972')) {
    return `0${digits.slice(3)}`;
  }
  return digits;
};

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

const ADMIN_PHONES = ['0543131544', '0527075624'].map(normalizePhoneForCompare);

const makeSlotDate = (date: Date, time: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  const slot = new Date(date);
  slot.setHours(hours, minutes, 0, 0);
  return slot;
};

const toLocalDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

interface PublicBookingProps {
  appointments: Appointment[];
  customers: Customer[];
  onBookingCreated: (payload: { customer: Customer; appointment: Appointment }) => void;
  onAdminAccess?: (phone: string) => void;
}

export const PublicBooking: React.FC<PublicBookingProps> = ({
  appointments,
  customers,
  onBookingCreated,
  onAdminAccess
}) => {
  const [step, setStep] = useState<BookingStep>('PHONE');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verifiedPhone, setVerifiedPhone] = useState('');
  const [existingCustomer, setExistingCustomer] = useState<Customer | null>(null);
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    petName: '',
    petType: ''
  });
  const [selectedSlot, setSelectedSlot] = useState<{
    date: Date;
    time: string;
  } | null>(null);
  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false);

  const bookedRangesByDate = useMemo(() => {
    const map = new Map<string, Array<{ start: number; end: number }>>();

    appointments
      .filter(appointment => appointment.status !== AppointmentStatus.CANCELLED)
      .forEach((appointment) => {
        const start = new Date(appointment.date).getTime();
        if (Number.isNaN(start)) return;
        const end = start + APPOINTMENT_DURATION_MINUTES * 60 * 1000;
        const key = toLocalDateKey(new Date(start));
        map.set(key, [...(map.get(key) || []), { start, end }]);
      });

    return map;
  }, [appointments]);

  const upcomingDays = useMemo(() => {
    const today = new Date();
    const days: Array<{ date: Date; times: string[] }> = [];

    for (let index = 0; index < 14; index += 1) {
      const date = new Date(today);
      date.setDate(today.getDate() + index);
      date.setHours(0, 0, 0, 0);

      const times = WEEKLY_SLOTS[date.getDay()] || [];
      if (times.length > 0) {
        days.push({ date, times });
      }
    }

    return days;
  }, []);

  const isSlotAvailable = (date: Date, time: string) => {
    const slot = makeSlotDate(date, time);
    if (slot.getTime() < Date.now()) return false;
    const key = toLocalDateKey(slot);
    const slotStart = slot.getTime();
    const slotEnd = slotStart + APPOINTMENT_DURATION_MINUTES * 60 * 1000;
    const booked = bookedRangesByDate.get(key) || [];
    return !booked.some((range) => slotStart < range.end && slotEnd > range.start);
  };

  const handleContinueWithPhone = () => {
    setError(null);
    const e164 = toE164(phone);

    if (!e164) {
      setError('הזן מספר טלפון תקין.');
      return;
    }

    setVerifiedPhone(e164);
    const normalized = normalizePhoneForCompare(e164);

    if (ADMIN_PHONES.includes(normalized)) {
      onAdminAccess?.(normalized);
      return;
    }

    const existing =
      customers.find(customer => normalizePhoneForCompare(customer.phone) === normalized) || null;

    setExistingCustomer(existing);
    if (existing) {
      setStep('BOOKING');
      return;
    }

    setStep('DETAILS');
  };

  const handleSendConfirmation = async (
    dateLabel: string,
    timeLabel: string,
    managerApproval?: {
      requested: boolean;
      customerName?: string;
      petName?: string;
      customerPhone?: string;
    }
  ) => {
    try {
      await fetch('/api/whatsapp-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: verifiedPhone,
          date: dateLabel,
          time: timeLabel,
          requestManagerApproval: managerApproval?.requested ?? false,
          customerName: managerApproval?.customerName,
          petName: managerApproval?.petName,
          customerPhone: managerApproval?.customerPhone
        })
      });
    } catch {
      // ignore confirmation errors
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

  const handleConfirmBooking = async () => {
    if (!selectedSlot) {
      setError('בחר תאריך ושעה.');
      return;
    }

    if (!isSlotAvailable(selectedSlot.date, selectedSlot.time)) {
      setError('השעה כבר נתפסה. בחר שעה אחרת.');
      return;
    }

    const slotDate = makeSlotDate(selectedSlot.date, selectedSlot.time);
    setError(null);
    setIsSubmittingBooking(true);

    try {
      const response = await fetch('/api/public-booking/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: verifiedPhone,
          slotDate: slotDate.toISOString(),
          existingCustomerId: existingCustomer?.id,
          customer: existingCustomer
            ? undefined
            : {
                name: newCustomer.name.trim(),
                phone: normalizePhoneForCompare(verifiedPhone),
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
      setExistingCustomer(customer);

      await handleSendConfirmation(
        slotDate.toLocaleDateString('he-IL'),
        selectedSlot.time,
        payload.createdCustomer
          ? {
              requested: true,
              customerName: customer.name,
              petName: customer.petName,
              customerPhone: customer.phone
            }
          : undefined
      );

      setStep('DONE');
    } catch {
      setError('יצירת התור נכשלה. נסה שוב.');
    } finally {
      setIsSubmittingBooking(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-black p-4 md:p-8">
      <div className="max-w-3xl mx-auto bg-white rounded-3xl shadow-xl border border-blue-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">קביעת תור</h1>
            <p className="text-sm text-gray-500">אפשר לקבוע עד שבועיים קדימה</p>
          </div>
          <Calendar className="w-6 h-6 text-blue-600" />
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
                placeholder='לדוגמה: 050-1234567'
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm"
              />
              <button
                onClick={handleContinueWithPhone}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 font-medium"
              >
                המשך
              </button>
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
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm"
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
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm"
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
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm"
                  />
                </div>
              </div>
              <button
                onClick={handleContinueDetails}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 font-medium"
              >
                המשך לקביעת תור
              </button>
            </div>
          )}

          {step === 'BOOKING' && (
            <div className="space-y-4">
              <div className="text-sm text-gray-600">בחר תאריך ושעה (עד שבועיים קדימה)</div>
              <div className="space-y-3">
                {upcomingDays.map(day => (
                  <div key={day.date.toISOString()} className="border border-gray-100 rounded-2xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold text-gray-800">
                        {DAY_NAMES[day.date.getDay()]} - {day.date.toLocaleDateString('he-IL')}
                      </div>
                      <div className="text-xs text-gray-400">{day.times.length} תורים אפשריים</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {day.times.map(time => {
                        const available = isSlotAvailable(day.date, time);
                        const isSelected =
                          Boolean(selectedSlot) &&
                          selectedSlot!.time === time &&
                          selectedSlot!.date.getTime() === day.date.getTime();

                        return (
                          <button
                            key={time}
                            disabled={!available || isSubmittingBooking}
                            onClick={() => setSelectedSlot({ date: day.date, time })}
                            className={`px-3 py-2 rounded-xl text-sm border transition ${
                              isSelected
                                ? 'bg-blue-600 text-white border-blue-600'
                                : available
                                  ? 'border-blue-100 text-blue-700 hover:bg-blue-50'
                                  : 'border-gray-100 text-gray-300 cursor-not-allowed'
                            }`}
                          >
                            {time}
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
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-xl py-3 font-medium"
              >
                {isSubmittingBooking ? 'שומר...' : 'אישור תור'}
              </button>
            </div>
          )}

          {step === 'DONE' && (
            <div className="text-center space-y-3 py-6">
              <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
              <div className="text-lg font-bold text-gray-800">התור נקבע בהצלחה!</div>
              {selectedSlot && (
                <div className="text-sm text-gray-500">
                  {selectedSlot.date.toLocaleDateString('he-IL')} בשעה {selectedSlot.time}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
