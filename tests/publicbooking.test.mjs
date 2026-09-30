import test from 'node:test';
import assert from 'node:assert/strict';
import {
  publicAppointmentView,
  publicCustomerView,
  sanitizePublicCustomer,
  sanitizePublicNotes
} from '../api/_lib/publicBookingInput.js';

test('public customer input is trimmed, bounded and stripped of control characters', () => {
  const out = sanitizePublicCustomer({ name: `  ${'א'.repeat(500)}\u0000 `, petName: 'Rex\n', petType: 5, price: 1 });
  assert.equal(out.name.length, 80);
  assert.equal(out.petName, 'Rex');
  assert.equal(out.petType, '');
  assert.deepEqual(Object.keys(out).sort(), ['name', 'petName', 'petType']);
  assert.equal(sanitizePublicNotes('x'.repeat(2000)).length, 500);
  assert.equal(sanitizePublicNotes({ a: 1 }), '');
  assert.deepEqual(sanitizePublicCustomer(null), { name: '', petName: '', petType: '' });
});

test('customers never get back phone, notes, price or history', () => {
  const view = publicCustomerView({ id: 'c1', name: 'דנה', phone: '+972501234567', petName: 'לאקי', petType: 'כלב', notes: 'סודי', defaultPrice: 10 });
  assert.deepEqual(view, { name: 'דנה', petName: 'לאקי', petType: 'כלב' });
  const appt = publicAppointmentView({ id: 'a1', date: 'd', service: 's', status: 'SCHEDULED', price: 0, notes: 'x', customerId: 'c1' });
  assert.deepEqual(Object.keys(appt).sort(), ['date', 'id', 'service', 'status']);
  assert.equal(publicCustomerView(null), undefined);
});
