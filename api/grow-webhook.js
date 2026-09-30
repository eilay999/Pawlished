import { createClient } from '@supabase/supabase-js';
import {
  approveGrowTransaction,
  depositAmount,
  isGrowConfigured,
  parseGrowCallback,
  verifyNotifyToken
} from './_lib/grow.js';

// Server-to-server callback from Grow after a payment. Authenticity comes from the signed
// notify URL (appointment id + kind + HMAC) created in api/_lib/grow.js, never from the body.

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ ok: false });
    return;
  }

  if (!isGrowConfigured()) {
    res.status(503).json({ ok: false });
    return;
  }

  const appointmentId = String(req.query?.a || '');
  const kind = String(req.query?.k || '');
  if (!verifyNotifyToken(appointmentId, kind, req.query?.t)) {
    res.status(401).json({ ok: false });
    return;
  }

  try {
    const { transactionId, paymentSum } = parseGrowCallback(req.body);
    if (!transactionId) {
      res.status(400).json({ ok: false, error: 'Missing transaction id' });
      return;
    }

    if (kind === 'DEPOSIT') {
      if (paymentSum < depositAmount()) {
        res.status(400).json({ ok: false, error: 'Unexpected payment amount' });
        return;
      }

      const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });
      const { error } = await supabase
        .from('appointments')
        .update({ deposit_paid_at: new Date().toISOString(), deposit_amount: paymentSum })
        .eq('id', appointmentId)
        .is('deposit_paid_at', null);
      if (error) throw new Error('Failed to record deposit');
    } else {
      res.status(400).json({ ok: false, error: 'Unsupported kind' });
      return;
    }

    await approveGrowTransaction(transactionId);
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[grow-webhook] failed', error?.message || error);
    res.status(500).json({ ok: false });
  }
}
