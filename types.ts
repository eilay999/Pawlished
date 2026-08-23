
export enum AppointmentStatus {
  SCHEDULED = 'SCHEDULED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  LATE = 'LATE'
}

export type CustomerLifecycleStatus = 'ACTIVE' | 'ON_HOLD';

export interface Customer {
  id: string;
  name: string;
  phone: string;
  petName: string;
  petType: string; // e.g., 'Dog', 'Cat'
  lastVisit: Date; // The date of their last grooming
  visitFrequencyWeeks: number; // How often they should come (e.g., 4 weeks)
  lifecycleStatus: CustomerLifecycleStatus;
  defaultPrice?: number; // Optional fixed price for this specific customer
  notes?: string; // Optional notes per customer
}

export interface Appointment {
  id: string;
  customerId: string;
  dogId?: string;
  date: Date;
  service: string;
  status: AppointmentStatus;
  notes?: string;
  price: number; // Added price field
  cancellationFee?: number;
}

export type DogSex = 'MALE' | 'FEMALE';
export type DogSize = 'SMALL' | 'MEDIUM' | 'LARGE';

export interface Dog {
  id: string;
  customerId: string;
  name: string;
  breed?: string;
  sex?: DogSex;
  sizeCategory?: DogSize;
  weightKg?: number;
  allergies?: string;
  medicalNotes?: string;
  behaviorNotes?: string;
  notes?: string;
  photoUrl?: string;
  lastVisit: Date;
  visitFrequencyWeeks: number;
  defaultPrice?: number;
  lifecycleStatus: CustomerLifecycleStatus;
}

export interface GroomingRecord {
  id: string;
  dogId: string;
  appointmentId?: string;
  visitDate: Date;
  bodyNote?: string;
  legsNote?: string;
  faceNote?: string;
  headNote?: string;
  tailNote?: string;
  nailsDone: boolean;
  earsCleaned: boolean;
  note?: string;
}

export type TaskStatus = 'OPEN' | 'DONE';

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  createdAt: Date;
  startDate: Date;
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: Date;
  kind: 'EVENT';
  colorKey: string;
  showInCalendar: boolean;
  blocksTime: boolean;
  notes?: string;
}

export interface WhatsAppMessage {
  id: string;
  phone: string;
  direction: 'INCOMING' | 'OUTGOING' | 'SYSTEM';
  body: string;
  messageType: string;
  intentKind?: string;
  needsHuman: boolean;
  createdAt: Date;
}

export interface DayCell {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  events: Appointment[];
  specialEvents: CalendarEvent[];
  holiday?: string | null; // Added holiday field
}

export type ViewType = 'HOME' | 'DASHBOARD' | 'CALENDAR' | 'CUSTOMERS' | 'MESSAGES' | 'SETTINGS';
