// Everything a customer sends from the public booking page is untrusted. The customer may
// choose a slot and describe themselves/their pet, but never the price, the visit frequency
// or the service, and nothing is unbounded.

const clean = (value, max) =>
  typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';

export const MAX_UPCOMING_PER_PHONE = 3;

export const sanitizePublicCustomer = (input) => {
  const source = input && typeof input === 'object' ? input : {};
  return {
    name: clean(source.name, 80),
    petName: clean(source.petName, 60),
    petType: clean(source.petType, 40)
  };
};

export const sanitizePublicNotes = (value) => clean(value, 500);

const DOG_SEX = new Set(['MALE', 'FEMALE']);

export const sanitizePublicDog = (input) => {
  const source = input && typeof input === 'object' ? input : {};
  const sex = typeof source.sex === 'string' ? source.sex.toUpperCase() : '';
  return {
    name: clean(source.name, 40),
    breed: clean(source.breed, 60),
    sex: DOG_SEX.has(sex) ? sex : '',
    allergies: clean(source.allergies, 300),
    notes: clean(source.notes, 500)
  };
};

// dogs.id is a uuid column: anything else must never reach the query.
export const sanitizeDogId = (value) =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : undefined;

// What a customer is allowed to see back: never the phone, notes, internal price or history.
export const publicCustomerView = (customer) =>
  customer ? { name: customer.name, petName: customer.petName, petType: customer.petType } : undefined;

export const publicDogView = (dog) => (dog ? { id: dog.id, name: dog.name } : undefined);

export const publicAppointmentView = (appointment) =>
  appointment ? { id: appointment.id, date: appointment.date, service: appointment.service, status: appointment.status } : undefined;
