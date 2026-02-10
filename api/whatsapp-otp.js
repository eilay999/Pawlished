import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const whatsappToken = process.env.WHATSAPP_TOKEN;
const whatsappPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
const otpTemplate = process.env.WHATSAPP_OTP_TEMPLATE;
const otpLang = process.env.WHATSAPP_OTP_LANG || 'he';
const otpSecret = process.env.OTP_SECRET || 'change_me';
const otpTtlMin = Number(process.env.OTP_TTL_MIN || 10);
const otpCooldownSec = Number(process.env.OTP_COOLDOWN_SEC || 60);
const otpMaxPer10Min = Number(process.env.OTP_MAX_10MIN || 5);

const normalizeDigits = (value = '') => value.replace(/\D/g, '');

const toWhatsAppNumber = (value = '') => {
  const digits = normalizeDigits(value);
  if (digits.startsWith('972')) return digits;
  if (digits.startsWith('0')) return `972${digits.slice(1)}`;
  return digits;
};

const getSupabaseClient = () => {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false }
  });
};

const hashCode = (code) =>
  crypto.createHash('sha256').update(`${code}:${otpSecret}`).digest('hex');

const sendTemplate = async (to, templateName, lang, params) => {
  if (!whatsappToken || !whatsappPhoneId) {
    throw new Error('Missing WhatsApp credentials.');
  }

  const body = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: lang },
      components: [
        {
          type: 'body',
          parameters: params.map((text) => ({ type: 'text', text }))
        }
      ]
    }
  };

  const resp = await fetch(`https://graph.facebook.com/v19.0/${whatsappPhoneId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${whatsappToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const errorBody = await resp.text();
    throw new Error(`WhatsApp API error: ${errorBody}`);
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { action, phone, code } = req.body || {};
    if (!action) {
      res.status(400).json({ error: 'Missing action' });
      return;
    }
    if (!phone) {
      res.status(400).json({ error: 'Missing phone' });
      return;
    }

    const waPhone = toWhatsAppNumber(phone);
    if (!waPhone) {
      res.status(400).json({ error: 'Invalid phone' });
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      res.status(500).json({ error: 'Supabase service role not configured' });
      return;
    }

    if (action === 'send') {
      if (!otpTemplate) {
        res.status(500).json({ error: 'Missing WHATSAPP_OTP_TEMPLATE' });
        return;
      }

      const now = Date.now();
      const cooldownSince = new Date(now - otpCooldownSec * 1000).toISOString();
      const windowSince = new Date(now - 10 * 60 * 1000).toISOString();

      const { data: latest, error: latestError } = await supabase
        .from('wa_otp')
        .select('created_at')
        .eq('phone', waPhone)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!latestError && latest?.created_at && latest.created_at > cooldownSince) {
        res.status(429).json({ error: 'OTP cooldown. Try again soon.' });
        return;
      }

      const { count } = await supabase
        .from('wa_otp')
        .select('*', { count: 'exact', head: true })
        .eq('phone', waPhone)
        .gte('created_at', windowSince);

      if ((count || 0) >= otpMaxPer10Min) {
        res.status(429).json({ error: 'Too many OTP requests. Try again later.' });
        return;
      }

      const otpCode = crypto.randomInt(100000, 999999).toString();
      const expiresAt = new Date(now + otpTtlMin * 60 * 1000).toISOString();

      const { error: insertError } = await supabase.from('wa_otp').insert({
        phone: waPhone,
        code_hash: hashCode(otpCode),
        expires_at: expiresAt
      });

      if (insertError) {
        res.status(500).json({ error: 'Failed to store OTP' });
        return;
      }

      await sendTemplate(waPhone, otpTemplate, otpLang, [otpCode]);
      res.status(200).json({ ok: true });
      return;
    }

    if (action === 'verify') {
      if (!code) {
        res.status(400).json({ error: 'Missing code' });
        return;
      }

      const { data, error: selectError } = await supabase
        .from('wa_otp')
        .select('*')
        .eq('phone', waPhone)
        .is('used_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (selectError || !data) {
        res.status(400).json({ error: 'Code not found or expired' });
        return;
      }

      if (hashCode(code) !== data.code_hash) {
        res.status(400).json({ error: 'Invalid code' });
        return;
      }

      await supabase.from('wa_otp').update({ used_at: new Date().toISOString() }).eq('id', data.id);
      res.status(200).json({ ok: true });
      return;
    }

    res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
}
