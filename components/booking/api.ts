export type DogSex = '' | 'MALE' | 'FEMALE';

export interface BookingDog {
  id: string;
  name: string;
  breed: string;
  sex: DogSex;
  allergies: string;
  notes: string;
}

export type DogInput = Omit<BookingDog, 'id'>;

export interface UpcomingAppointment {
  id: string;
  date: string;
  localDate: string;
  localTime: string;
  dogId: string | null;
  dogName: string | null;
  status: 'SCHEDULED' | 'PENDING_PAYMENT';
  holdExpiresAt: string | null;
}

export interface PaymentInfo {
  required: boolean;
  amount: number;
  holdMinutes: number;
}

export interface PaymentLink {
  url: string;
  amount: number;
  expiresAt: string;
}

export interface Profile {
  exists: boolean;
  customer: { id: string; name: string } | null;
  dogs: BookingDog[];
  upcomingAppointments: UpcomingAppointment[];
}

export interface AvailabilityDay {
  date: string;
  weekdayIndex: number | null;
  times: Array<{ time: string; available: boolean }>;
}

export interface BookingResult {
  customer: Record<string, any>;
  appointment: Record<string, any>;
  dog: BookingDog | null;
  payment?: PaymentLink;
  confirmation?: { ok: boolean; channel?: 'sms' | 'whatsapp'; error?: string };
}

export class SessionError extends Error {}

const GENERIC_ERROR = 'משהו השתבש. נסו שוב בעוד רגע.';

const KNOWN_ERRORS: Array<[RegExp, string]> = [
  [/invalid code/i, 'הקוד שגוי. בדקו ונסו שוב.'],
  [/code not found or expired/i, 'הקוד פג תוקף. בקשו קוד חדש.'],
  [/otp cooldown/i, 'קוד נשלח זה עתה. המתינו דקה ונסו שוב.'],
  [/too many otp/i, 'יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.'],
  [/invalid phone/i, 'מספר הטלפון לא תקין.'],
  [/no messaging provider|credentials|template/i, 'לא הצלחנו לשלוח קוד כרגע. נסו שוב בעוד כמה דקות.']
];

const SESSION_ERROR = /phone verification|device token/i;
const HAS_HEBREW = /[֐-׿]/;

const toMessage = (raw: unknown): string => {
  const text = typeof raw === 'string' ? raw : '';
  if (HAS_HEBREW.test(text)) return text;
  for (const [pattern, message] of KNOWN_ERRORS) {
    if (pattern.test(text)) return message;
  }
  return GENERIC_ERROR;
};

const post = async <T>(path: string, body: unknown, sessionToken?: string): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(sessionToken ? { 'X-OTP-Token': sessionToken } : {})
      },
      body: JSON.stringify(body)
    });
  } catch {
    throw new Error('אין חיבור לאינטרנט. בדקו את הרשת ונסו שוב.');
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const raw = payload?.error;
    if (response.status === 401 && typeof raw === 'string' && SESSION_ERROR.test(raw)) {
      throw new SessionError('פג תוקף האימות. אמתו את המספר שוב.');
    }
    throw new Error(toMessage(raw));
  }
  return payload as T;
};

export const sendOtp = async (e164: string): Promise<{ channel: 'sms' | 'whatsapp' | null }> => {
  const payload = await post<{ channel?: string }>('/api/whatsapp-otp', { action: 'send', phone: e164 });
  return { channel: payload.channel === 'sms' || payload.channel === 'whatsapp' ? payload.channel : null };
};

export const verifyOtp = async (
  e164: string,
  code: string,
  remember: boolean
): Promise<{ sessionToken: string; deviceToken?: string }> => {
  const payload = await post<{ sessionToken?: string; deviceToken?: string }>('/api/whatsapp-otp', {
    action: 'verify',
    phone: e164,
    code,
    remember
  });
  if (!payload.sessionToken) throw new Error(GENERIC_ERROR);
  return { sessionToken: payload.sessionToken, deviceToken: payload.deviceToken };
};

export const resumeDevice = async (deviceToken: string): Promise<{ sessionToken: string; phone: string }> => {
  const payload = await post<{ sessionToken?: string; phone?: string }>('/api/whatsapp-otp', {
    action: 'resume',
    deviceToken
  });
  if (!payload.sessionToken) throw new Error(GENERIC_ERROR);
  return { sessionToken: payload.sessionToken, phone: payload.phone || '' };
};

export const fetchProfile = async (sessionToken: string): Promise<Profile> => {
  const payload = await post<Partial<Profile>>('/api/public-booking/customer-exists', {}, sessionToken);
  return {
    exists: Boolean(payload.exists),
    customer: payload.customer ?? null,
    dogs: Array.isArray(payload.dogs) ? payload.dogs : [],
    upcomingAppointments: Array.isArray(payload.upcomingAppointments)
      ? payload.upcomingAppointments.map((item) => ({
          ...item,
          status: item.status === 'PENDING_PAYMENT' ? 'PENDING_PAYMENT' : 'SCHEDULED',
          holdExpiresAt: item.holdExpiresAt ?? null
        }))
      : []
  };
};

export const NO_PAYMENT: PaymentInfo = { required: false, amount: 50, holdMinutes: 30 };

export const fetchAvailability = async (): Promise<{ days: AvailabilityDay[]; payment: PaymentInfo }> => {
  let response: Response;
  try {
    response = await fetch('/api/public-booking/availability?days=30', { cache: 'no-store' });
  } catch {
    throw new Error('אין חיבור לאינטרנט. בדקו את הרשת ונסו שוב.');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(toMessage(payload?.error));
  const info = payload.payment;
  return {
    days: Array.isArray(payload.days) ? payload.days : [],
    payment:
      info && typeof info === 'object'
        ? {
            required: Boolean(info.required),
            amount: Number(info.amount) || NO_PAYMENT.amount,
            holdMinutes: Number(info.holdMinutes) || NO_PAYMENT.holdMinutes
          }
        : NO_PAYMENT
  };
};

export interface BookingRequest {
  date: string;
  time: string;
  dogId?: string;
  newCustomer?: { name: string; dog: DogInput };
}

export const createBooking = async (sessionToken: string, request: BookingRequest): Promise<BookingResult> => {
  const body: Record<string, unknown> = {
    date: request.date,
    time: request.time,
    notes: ''
  };

  if (request.newCustomer) {
    body.customer = {
      name: request.newCustomer.name,
      petName: request.newCustomer.dog.name,
      petType: request.newCustomer.dog.breed || 'כלב'
    };
    body.newDog = request.newCustomer.dog;
  } else if (request.dogId) {
    body.dogId = request.dogId;
  }

  return post<BookingResult>('/api/public-booking/create', body, sessionToken);
};

// A fresh payment link for a booking that is still waiting for its deposit.
export const getPayLink = async (sessionToken: string, appointmentId: string): Promise<PaymentLink> => {
  const payload = await post<{ payment: PaymentLink }>(
    '/api/public-booking/create',
    { action: 'pay-link', appointmentId },
    sessionToken
  );
  return payload.payment;
};

export const saveCustomerCard = async (
  sessionToken: string,
  customer: { name: string; dog: DogInput }
): Promise<{ customer: Record<string, any>; dog: BookingDog }> =>
  post('/api/public-booking/create-customer', {
    customer: {
      name: customer.name,
      petName: customer.dog.name,
      petType: customer.dog.breed || 'כלב'
    }
  }, sessionToken);

export const addDog = async (sessionToken: string, dog: DogInput): Promise<BookingDog> => {
  const payload = await post<{ dog: BookingDog }>(
    '/api/public-booking/create-customer',
    { action: 'add-dog', dog },
    sessionToken
  );
  return payload.dog;
};

export const updateDog = async (sessionToken: string, dogId: string, dog: DogInput): Promise<BookingDog> => {
  const payload = await post<{ dog: BookingDog }>(
    '/api/public-booking/create-customer',
    { action: 'update-dog', dogId, dog },
    sessionToken
  );
  return payload.dog;
};
