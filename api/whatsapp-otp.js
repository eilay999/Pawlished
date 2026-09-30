import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { createOtpSessionToken } from './_lib/otpSession.js';
import { safeEqual } from './_lib/safeCompare.js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// OTP_CHANNEL overrides MESSAGING_CHANNEL for login codes only, so OTP can go over SMS
// while booking confirmations stay on WhatsApp (authentication templates need Meta
// business verification; utility templates don't).
const messagingChannel = (process.env.OTP_CHANNEL || process.env.MESSAGING_CHANNEL || 'auto')
  .toLowerCase()
  .trim();

const whatsappToken = (process.env.WHATSAPP_TOKEN || '').trim();
const whatsappPhoneId = (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
const otpTemplate = (process.env.WHATSAPP_OTP_TEMPLATE || '').trim();
const otpLang = (process.env.WHATSAPP_OTP_LANG || 'he').trim();

const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
const twilioFromNumber = process.env.TWILIO_FROM_NUMBER;

const otpSecret = (process.env.OTP_SECRET || '').trim();
const minOtpSecretBytes = Number(process.env.OTP_SECRET_MIN_BYTES || 32);
const otpTtlMin = Number(process.env.OTP_TTL_MIN || 10);
const otpCooldownSec = Number(process.env.OTP_COOLDOWN_SEC || 60);
const otpMaxPer10Min = Number(process.env.OTP_MAX_10MIN || 5);
const otpMaxVerifyAttempts = Number(process.env.OTP_MAX_VERIFY_ATTEMPTS || 5);

const normalizeDigits = (value = '') => value.replace(/\D/g, '');

const toWhatsAppNumber = (value = '') => {
  const digits = normalizeDigits(value);
  if (digits.startsWith('972')) return digits;
  if (digits.startsWith('0')) return `972${digits.slice(1)}`;
  return digits;
};

const toE164 = (value = '') => {
  const digits = normalizeDigits(value);
  if (!digits) return '';
  if (digits.startsWith('972')) return `+${digits}`;
  if (digits.startsWith('0')) return `+972${digits.slice(1)}`;
  if (value.startsWith('+')) return value;
  return `+${digits}`;
};

const getSupabaseClient = () => {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false }
  });
};

const hashCode = (code) => {
  if (!otpSecret || Buffer.byteLength(otpSecret, 'utf8') < minOtpSecretBytes) {
    throw new Error('OTP_SECRET not configured (or too weak)');
  }
  return crypto.createHash('sha256').update(`${code}:${otpSecret}`).digest('hex');
};

const canUseWhatsAppTemplate = () => Boolean(whatsappToken && whatsappPhoneId && otpTemplate);
// Free-form fallback: WhatsApp lets a business send free-text replies at no cost for 24h
// after the customer last messaged it ("service window") — no approved template or
// Business Verification required. Needs only the token/phone id, not the template.
const canUseWhatsAppFreeform = () => Boolean(whatsappToken && whatsappPhoneId);
const canUseSms = () => Boolean(twilioAccountSid && twilioAuthToken && twilioFromNumber);

const resolveChannel = () => {
  if (messagingChannel === 'sms') return 'sms';
  if (messagingChannel === 'whatsapp') {
    if (canUseWhatsAppTemplate()) return 'whatsapp';
    if (canUseWhatsAppFreeform()) return 'whatsapp-freeform';
    return 'none';
  }
  if (canUseWhatsAppTemplate()) return 'whatsapp';
  if (canUseWhatsAppFreeform()) return 'whatsapp-freeform';
  if (canUseSms()) return 'sms';
  return 'none';
};

const sendWhatsAppTemplate = async (to, templateName, lang, params) => {
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

// Thrown when Meta rejects a free-form send because the 24h service window is closed
// (the phone hasn't messaged the business recently) — code 131047 / "re-engagement message".
class WhatsAppWindowClosedError extends Error {}

const sendWhatsAppFreeformText = async (to, bodyText) => {
  const resp = await fetch(`https://graph.facebook.com/v19.0/${whatsappPhoneId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${whatsappToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { preview_url: false, body: bodyText }
    })
  });

  const rawBody = await resp.text();
  // Never log rawBody on success: it contains the recipient's phone number.
  console.log('[whatsapp-otp] freeform send status', resp.status);

  if (!resp.ok) {
    if (rawBody.includes('131047') || /re-?engagement/i.test(rawBody)) {
      throw new WhatsAppWindowClosedError(rawBody);
    }
    throw new Error(`WhatsApp API error: ${rawBody}`);
  }
};

const sendSmsMessage = async (to, bodyText) => {
  const auth = Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString('base64');
  const payload = new URLSearchParams({
    To: to,
    From: twilioFromNumber,
    Body: bodyText
  });

  const resp = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: payload.toString()
    }
  );

  if (!resp.ok) {
    const errorBody = await resp.text();
    throw new Error(`Twilio SMS API error: ${errorBody}`);
  }
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    if (!otpSecret || Buffer.byteLength(otpSecret, 'utf8') < minOtpSecretBytes) {
      res.status(500).json({ error: 'OTP_SECRET not configured (or too weak)' });
      return;
    }

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
    const smsPhone = toE164(phone);
    if (!waPhone || !smsPhone) {
      res.status(400).json({ error: 'Invalid phone' });
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      res.status(500).json({ error: 'Supabase service role not configured' });
      return;
    }

    if (action === 'send') {
      const channel = resolveChannel();
      if (channel === 'none') {
        res.status(500).json({
          error:
            'No messaging provider configured. Configure WhatsApp template vars or Twilio SMS vars.'
        });
        return;
      }

      if (channel === 'whatsapp' && !canUseWhatsAppTemplate()) {
        res.status(500).json({ error: 'Missing WHATSAPP_OTP_TEMPLATE or WhatsApp credentials' });
        return;
      }

      if (channel === 'whatsapp-freeform' && !canUseWhatsAppFreeform()) {
        res.status(500).json({ error: 'Missing WhatsApp credentials' });
        return;
      }

      if (channel === 'sms' && !canUseSms()) {
        res.status(500).json({ error: 'Missing Twilio SMS credentials.' });
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

      if (channel === 'sms') {
        await sendSmsMessage(smsPhone, `קוד האימות שלך: ${otpCode}. תקף ל-${otpTtlMin} דקות.`);
        res.status(200).json({ ok: true, channel: 'sms' });
        return;
      }

      const otpMessageText = `קוד האימות שלך: ${otpCode}. תקף ל-${otpTtlMin} דקות.`;

      const sendFreeformOrRespondError = async () => {
        try {
          await sendWhatsAppFreeformText(waPhone, otpMessageText);
        } catch (err) {
          if (err instanceof WhatsAppWindowClosedError) {
            res.status(400).json({
              error:
                'כדי לקבל קוד בוואטסאפ, שלחו קודם הודעה כלשהי (למשל "היי") למספר העסק בוואטסאפ, ואז לחצו "שלח קוד" שוב.'
            });
            return false;
          }
          throw err;
        }
        return true;
      };

      if (channel === 'whatsapp-freeform') {
        if (await sendFreeformOrRespondError()) {
          res.status(200).json({ ok: true, channel: 'whatsapp' });
        }
        return;
      }

      // channel === 'whatsapp' (template). The approved template can go stale (renamed,
      // rejected, or — as happened here — never approved because Business Verification
      // got stuck) without WHATSAPP_OTP_TEMPLATE being unset, so a template send failure
      // falls back to the free-form service-window send instead of just erroring out.
      try {
        await sendWhatsAppTemplate(waPhone, otpTemplate, otpLang, [otpCode]);
        res.status(200).json({ ok: true, channel: 'whatsapp' });
      } catch {
        if (await sendFreeformOrRespondError()) {
          res.status(200).json({ ok: true, channel: 'whatsapp' });
        }
      }
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

      if (!safeEqual(hashCode(String(code)), data.code_hash)) {
        // Brute-force protection: a 6-digit code has only 900k values, so each OTP
        // gets a limited number of guesses and is then burned. If the `attempts`
        // column is missing (migration not applied) or the optimistic update loses a
        // race with a parallel guess, fail closed and burn the code immediately.
        const previousAttempts = Number(data.attempts);
        const nextAttempts = previousAttempts + 1;
        let burn = !Number.isFinite(previousAttempts) || nextAttempts >= otpMaxVerifyAttempts;

        if (!burn) {
          const { data: updated, error: updateError } = await supabase
            .from('wa_otp')
            .update({ attempts: nextAttempts })
            .eq('id', data.id)
            .eq('attempts', previousAttempts)
            .select('id');
          burn = Boolean(updateError) || !updated || updated.length === 0;
        }

        if (burn) {
          await supabase
            .from('wa_otp')
            .update({ used_at: new Date().toISOString() })
            .eq('id', data.id);
          res.status(429).json({ error: 'Too many wrong attempts. Request a new code.' });
          return;
        }

        res.status(400).json({ error: 'Invalid code' });
        return;
      }

      await supabase.from('wa_otp').update({ used_at: new Date().toISOString() }).eq('id', data.id);

      const sessionToken = createOtpSessionToken(waPhone);
      res.status(200).json({ ok: true, sessionToken });
      return;
    }

    res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    // Provider errors can include account details; log them, don't return them.
    console.error('[whatsapp-otp] unexpected error', err?.message || err);
    res.status(500).json({ error: 'Server error' });
  }
}
