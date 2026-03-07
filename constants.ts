import { Appointment, AppointmentStatus, Customer } from './types';

export const WEEK_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

const today = new Date();

// Helper dates for Mock Data
const oneMonthAgo = new Date(); oneMonthAgo.setDate(today.getDate() - 30);
const twoMonthsAgo = new Date(); twoMonthsAgo.setDate(today.getDate() - 60);
const twentyThreeDaysAgo = new Date(); twentyThreeDaysAgo.setDate(today.getDate() - 23);

// Test Case: Customer visits every 2 weeks (14 days).
// Last visit was 8 days ago.
// Due date is in 6 days (14 - 8).
// Result: Should appear in "Soon" list because 6 <= 7.
const eightDaysAgo = new Date(); eightDaysAgo.setDate(today.getDate() - 8);

export const SERVICE_PRICES: Record<string, number> = {
    'תספורת מלאה': 250,
    'גזירת ציפורניים': 50,
    'רחצה וסירוק': 150,
    'טיפול נגד פרעושים': 100
};

export const CANCELLATION_FEE_AMOUNT = 50;
export const CANCELLATION_FEE_WINDOW_HOURS = 24;

export const MOCK_CUSTOMERS: Customer[] = [
  {
    id: 'c1',
    name: 'ישראל ישראלי',
    phone: '050-1234567',
    petName: 'רקס',
    petType: 'כלב',
    lastVisit: twoMonthsAgo, // LATE
    visitFrequencyWeeks: 4,
    lifecycleStatus: 'ACTIVE',
    defaultPrice: 200 // Discounted price
  },
  {
    id: 'c2',
    name: 'מיכל כהן',
    phone: '052-7654321',
    petName: 'לונה',
    petType: 'כלב',
    lastVisit: oneMonthAgo, // Has appointment TODAY
    visitFrequencyWeeks: 4,
    lifecycleStatus: 'ACTIVE'
  },
  {
    id: 'c3',
    name: 'דני לוי',
    phone: '054-1122334',
    petName: 'סימבה',
    petType: 'כלב',
    lastVisit: twentyThreeDaysAgo, // SOON (Frequency 4 weeks)
    visitFrequencyWeeks: 4,
    lifecycleStatus: 'ACTIVE'
  },
  {
    id: 'c_test',
    name: 'נועה (כל שבועיים)',
    phone: '050-5555555',
    petName: 'טופי',
    petType: 'כלב',
    lastVisit: eightDaysAgo, // SOON (Frequency 2 weeks -> Due in 6 days)
    visitFrequencyWeeks: 2,
    lifecycleStatus: 'ACTIVE',
    defaultPrice: 120
  }
];

export const MOCK_APPOINTMENTS: Appointment[] = [
  {
    id: 'a1',
    customerId: 'c2',
    date: new Date(today.setHours(14, 30, 0, 0)),
    service: 'רחצה וסירוק',
    status: AppointmentStatus.SCHEDULED,
    price: 150
  },
  {
    id: 'a2',
    customerId: 'c1',
    date: twoMonthsAgo,
    service: 'תספורת מלאה',
    status: AppointmentStatus.COMPLETED,
    price: 250
  },
  {
    id: 'a3',
    customerId: 'c3',
    date: twentyThreeDaysAgo,
    service: 'גזירת ציפורניים',
    status: AppointmentStatus.COMPLETED,
    price: 50
  },
  {
    id: 'a_test',
    customerId: 'c_test',
    date: eightDaysAgo,
    service: 'רחצה',
    status: AppointmentStatus.COMPLETED,
    price: 100
  }
];
