import { Customer, Appointment, AppointmentStatus } from './types';

export type CalculatedStatus = 'LATE' | 'SOON' | 'SCHEDULED' | 'OK' | 'ON_HOLD';

export interface CustomerAnalysis {
  status: CalculatedStatus;
  dueDate: Date;
  daysDiff: number;
  nextAppointment?: Date;
  lastEffectiveVisit: Date;
}

export const normalizeDigits = (value: string) => String(value || '').replace(/\D/g, '');

// Normalizes Israeli phone numbers into a comparable storage format (digits only, leading 0).
export const normalizePhoneForCompare = (value: string) => {
  const digits = normalizeDigits(value);
  if (!digits) return '';
  if (digits.startsWith('972')) return `0${digits.slice(3)}`;
  return digits;
};

export const analyzeCustomerStatus = (customer: Customer, appointments: Appointment[]): CustomerAnalysis => {
  // 1. Normalize today's date to local midnight
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const safeLastVisit = new Date(customer.lastVisit);
  if (isNaN(safeLastVisit.getTime())) {
    return {
      status: customer.lifecycleStatus === 'ON_HOLD' ? 'ON_HOLD' : 'OK',
      dueDate: today,
      daysDiff: 0,
      lastEffectiveVisit: today,
    };
  }

  // 2. Use latest completed appointment date if newer than customer.lastVisit
  let effectiveLastVisit = safeLastVisit;
  effectiveLastVisit.setHours(0, 0, 0, 0);

  if (appointments && appointments.length > 0) {
    const recentCompletedAppt = appointments
      .filter(a => a.customerId === customer.id && a.status === AppointmentStatus.COMPLETED)
      .map(a => new Date(a.date))
      .sort((a, b) => b.getTime() - a.getTime())[0];

    if (recentCompletedAppt) {
      const recentDate = new Date(recentCompletedAppt);
      recentDate.setHours(0, 0, 0, 0);
      if (recentDate.getTime() > effectiveLastVisit.getTime()) {
        effectiveLastVisit = recentDate;
      }
    }
  }

  // 3. Find nearest future non-cancelled appointment
  const futureAppt = appointments
    .filter(a => a.customerId === customer.id && a.status !== AppointmentStatus.CANCELLED)
    .map(a => new Date(a.date))
    .sort((a, b) => a.getTime() - b.getTime())
    .find(date => {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      return d.getTime() >= today.getTime();
    });

  // 4. Calculate due date from frequency in weeks
  const frequencyDays = (customer.visitFrequencyWeeks || 4) * 7;
  const dueDate = new Date(effectiveLastVisit);
  dueDate.setDate(dueDate.getDate() + frequencyDays);
  dueDate.setHours(0, 0, 0, 0);

  // 5. Diff in days between due date and today
  const timeDiff = dueDate.getTime() - today.getTime();
  const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));

  // 6. Resolve customer status
  let status: CalculatedStatus = 'OK';

  if (customer.lifecycleStatus === 'ON_HOLD') {
    status = 'ON_HOLD';
  } else if (futureAppt) {
    status = 'SCHEDULED';
  } else {
    if (daysDiff < 0) {
      status = 'LATE';
    } else if (daysDiff <= 7) {
      status = 'SOON';
    } else {
      status = 'OK';
    }
  }

  return {
    status,
    dueDate,
    daysDiff,
    nextAppointment: futureAppt,
    lastEffectiveVisit: effectiveLastVisit,
  };
};
