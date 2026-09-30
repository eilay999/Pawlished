import './dryRun.js';
import { createClient } from '@supabase/supabase-js';

// Automatic invoice/receipt issuing for completed appointments.
//
// The provider (digital-invoice.co.il) is called through a single JSON POST so the
// request/response mapping lives in one place (`callInvoiceProvider`). Adjust that
// function to the provider's API docs; everything else is provider-agnostic.
//
// Env: INVOICE_API_URL, INVOICE_API_KEY, INVOICE_DOCUMENT_TYPE (default "receipt"),
// INVOICE_START_DATE (required, ISO date e.g. 2026-10-15): only appointments on/after this
// date are invoiced, so switching invoicing on never back-fills (or messages customers about)
// historical appointments. Without it nothing is issued.

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const invoiceApiUrl = (process.env.INVOICE_API_URL || '').trim();
const invoiceApiKey = (process.env.INVOICE_API_KEY || '').trim();
const invoiceDocumentType = (process.env.INVOICE_DOCUMENT_TYPE || 'receipt').trim();

const invoiceStartDate = (() => {
  const parsed = new Date((process.env.INVOICE_START_DATE || '').trim());
  return Number.isNaN(parsed.getTime()) ? null : parsed;
})();

export const isInvoicingConfigured = () =>
  Boolean(invoiceApiUrl && invoiceApiKey && invoiceStartDate);

const getSupabaseClient = () => {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase service role not configured');
  }
  return createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });
};

const callInvoiceProvider = async ({ customerName, phone, description, amount, reference }) => {
  const response = await fetch(invoiceApiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${invoiceApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      type: invoiceDocumentType,
      client: { name: customerName, phone },
      items: [{ description, quantity: 1, price: amount }],
      reference,
      send: false
    })
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Invoice provider error ${response.status}: ${text.slice(0, 300)}`);
  }

  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    // keep empty
  }
  return {
    number: String(data.number ?? data.id ?? data.docNumber ?? ''),
    url: String(data.url ?? data.pdf ?? data.pdfUrl ?? '')
  };
};

// Issues invoices for COMPLETED appointments that don't have one yet.
// Returns [{ appointmentId, phone, customerName, number, url }] for newly issued docs.
export const issuePendingInvoices = async (limit = 20) => {
  if (!isInvoicingConfigured()) return [];

  const supabase = getSupabaseClient();
  const { data: rows, error } = await supabase
    .from('appointments')
    .select('id, customer_id, service, price, date, deposit_paid_at, deposit_amount')
    .eq('status', 'COMPLETED')
    .is('invoice_issued_at', null)
    .gt('price', 0)
    .gte('date', invoiceStartDate.toISOString())
    .order('date', { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Failed to load appointments for invoicing: ${error.message}`);

  const issued = [];
  for (const row of rows || []) {
    try {
      const { data: customer } = await supabase
        .from('customers')
        .select('name, phone')
        .eq('id', row.customer_id)
        .maybeSingle();

      const amount = Number(row.price || 0);
      const result = await callInvoiceProvider({
        customerName: customer?.name || '',
        phone: customer?.phone || '',
        description: row.service || 'טיפוח כלב',
        amount,
        reference: row.id
      });

      await supabase
        .from('appointments')
        .update({
          invoice_number: result.number || null,
          invoice_url: result.url || null,
          invoice_issued_at: new Date().toISOString(),
          invoice_error: null
        })
        .eq('id', row.id);

      issued.push({
        appointmentId: row.id,
        phone: customer?.phone || '',
        customerName: customer?.name || '',
        ...result
      });
    } catch (err) {
      await supabase
        .from('appointments')
        .update({ invoice_error: String(err?.message || err).slice(0, 500) })
        .eq('id', row.id);
    }
  }
  return issued;
};
