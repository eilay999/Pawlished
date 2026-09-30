import { createClient } from '@supabase/supabase-js';
import { normalizeTaxSettings, DEFAULT_TAX_SETTINGS } from '../../services/reports.js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Business tax status (exempt dealer / licensed dealer). Falls back to "exempt" if the table or
// the database is unavailable, so reminders and receipts never break because of a settings read.
export const getTaxSettings = async () => {
  if (!supabaseUrl || !supabaseServiceKey) return { ...DEFAULT_TAX_SETTINGS };
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });
    const { data, error } = await supabase.from('business_settings').select('key, value');
    if (error) return { ...DEFAULT_TAX_SETTINGS };
    return normalizeTaxSettings(data || []);
  } catch {
    return { ...DEFAULT_TAX_SETTINGS };
  }
};

export const documentLabel = (tax) => (tax?.taxStatus === 'LICENSED' ? 'החשבונית' : 'הקבלה');
