
export enum AppointmentStatus {
  SCHEDULED = 'SCHEDULED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  LATE = 'LATE'
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  petName: string;
  petType: string; // e.g., 'Dog', 'Cat'
  lastVisit: Date; // The date of their last grooming
  visitFrequencyWeeks: number; // How often they should come (e.g., 4 weeks)
  defaultPrice?: number; // Optional fixed price for this specific customer
}

export interface Appointment {
  id: string;
  customerId: string;
  date: Date;
  service: string;
  status: AppointmentStatus;
  notes?: string;
  price: number; // Added price field
}

export type TaskStatus = 'OPEN' | 'DONE';

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  createdAt: Date;
  startDate: Date;
}

export interface DayCell {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  events: Appointment[];
  holiday?: string | null; // Added holiday field
}

export type ViewType = 'CALENDAR' | 'CUSTOMERS' | 'STATS';
