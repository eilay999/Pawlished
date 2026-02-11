import React, { useMemo, useState } from 'react';
import { Calendar, Phone, User, Dog, CheckCircle2 } from 'lucide-react';
import { Appointment, AppointmentStatus, Customer } from '../types';

type BookingStep = 'PHONE' | 'DETAILS' | 'BOOKING' | 'DONE';

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

const WEEKLY_SLOTS: Record<number, string[]> = {
  0: ['08:01', '11:00'],
  1: ['10:00', '13:00', '16:00'],
  2: ['10:00', '13:00', '16:00'],
  3: ['08:01', '11:00'],
  4: ['08:00'],
  5: [],
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
  const [h, m] = time.split(':').map(Number);
  const slot = new Date(date);
  slot.setHours(h, m, 0, 0);
  return slot;
};

interface PublicBookingProps {
  appointments: Appointment[];
  customers: Customer[];
  onSaveCustomer: (customer: Customer) => void;
  onSaveAppointment: (appointment: Appointment) => void;
  onAdminAccess?: (phone: string) => void;
}

export const PublicBooking: React.FC<PublicBookingProps> = ({
  appointments,
  customers,
  onSaveCustomer,
  onSaveAppointment,
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

  const bookedSlots = useMemo(() => {
    return new Set(
      appointments
        .filter(a => a.status !== AppointmentStatus.CANCELLED)
        .map(a => new Date(a.date).getTime())
    );
  }, [appointments]);

  const upcomingDays = useMemo(() => {
    const today = new Date();
    const days: Array<{ date: Date; times: string[] }> = [];
    for (let i = 0; i < 14; i += 1) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      d.setHours(0, 0, 0, 0);
      const times = WEEKLY_SLOTS[d.getDay()] || [];
      if (times.length) {
        days.push({ date: d, times });
      }
    }
    return days;
  }, []);

  const isSlotAvailable = (date: Date, time: string) => {
    const slot = makeSlotDate(date, time);
    if (slot.getTime() < Date.now()) return false;
    return !bookedSlots.has(slot.getTime());
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
    const existing = customers.find(c => normalizePhoneForCompare(c.phone) === normalized) || null;
    setExistingCustomer(existing);
    if (existing) {
      setStep('BOOKING');
    } else {
      setStep('DETAILS');
    }
  };

  const handleSendConfirmation = async (dateLabel: string, timeLabel: string) => {
    try {
      await fetch('/api/whatsapp-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: verifiedPhone, date: dateLabel, time: timeLabel })
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

  const handleConfirmBooking = () => {
    if (!selectedSlot) {
      setError('בחר תאריך ושעה.');
      return;
    }

    const slotDate = makeSlotDate(selectedSlot.date, selectedSlot.time);
    if (!isSlotAvailable(selectedSlot.date, selectedSlot.time)) {
      setError('השעה כבר נתפסה. בחר שעה אחרת.');
      return;
    }

    let customer = existingCustomer;
    if (!customer) {
      customer = {
        id: Math.random().toString(36).substr(2, 9),
        name: newCustomer.name.trim(),
        phone: normalizePhoneForCompare(verifiedPhone),
        petName: newCustomer.petName.trim(),
        petType: newCustomer.petType.trim(),
        lastVisit: new Date(),
        visitFrequencyWeeks: 4,
        defaultPrice: undefined
      };
      onSaveCustomer(customer);
    }

    const appointment: Appointment = {
      id: Math.random().toString(36).substr(2, 9),
      customerId: customer.id,
      date: slotDate,
      service: 'תור לקוח',
      status: AppointmentStatus.SCHEDULED,
      notes: '',
      price: customer.defaultPrice ?? 0
    };

    onSaveAppointment(appointment);
    handleSendConfirmation(
      slotDate.toLocaleDateString('he-IL'),
      selectedSlot.time
    );
    setStep('DONE');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-emerald-50 p-4 md:p-8">
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
                onChange={e => setPhone(e.target.value)}
                placeholder="לדוגמה: 050-1234567"
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
              <div className="text-sm text-gray-600">לקוח חדש – מלא פרטים</div>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 flex items-center gap-2">
                    <User className="w-4 h-4" /> שם מלא
                  </label>
                  <input
                    value={newCustomer.name}
                    onChange={e => setNewCustomer(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 flex items-center gap-2">
                    <Dog className="w-4 h-4" /> שם הכלב
                  </label>
                  <input
                    value={newCustomer.petName}
                    onChange={e => setNewCustomer(prev => ({ ...prev, petName: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-gray-500 flex items-center gap-2">
                    סוג הכלב
                  </label>
                  <input
                    value={newCustomer.petType}
                    onChange={e => setNewCustomer(prev => ({ ...prev, petType: e.target.value }))}
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
              <div className="text-sm text-gray-600">
                בחר תאריך ושעה (עד שבועיים קדימה)
              </div>
              <div className="space-y-3">
                {upcomingDays.map(day => (
                  <div key={day.date.toISOString()} className="border border-gray-100 rounded-2xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold text-gray-800">
                        {DAY_NAMES[day.date.getDay()]} • {day.date.toLocaleDateString('he-IL')}
                      </div>
                      <div className="text-xs text-gray-400">
                        {day.times.length} תורים אפשריים
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {day.times.map(time => {
                        const available = isSlotAvailable(day.date, time);
                        const isSelected =
                          selectedSlot &&
                          selectedSlot.time === time &&
                          selectedSlot.date.getTime() === day.date.getTime();
                        return (
                          <button
                            key={time}
                            disabled={!available}
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
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-3 font-medium"
              >
                אישור תור
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


