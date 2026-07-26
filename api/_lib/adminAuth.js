import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

const unauthorized = () => {
  const error = new Error('Unauthorized');
  error.statusCode = 401;
  return error;
};

const getBearerToken = (req) => {
  const header = String(req.headers.authorization || '');
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
};

export const requireAdmin = async (req) => {
  const token = getBearerToken(req);
  if (!token || !supabaseUrl || !supabaseServiceKey) {
    throw unauthorized();
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    throw unauthorized();
  }

  const { data: membership, error: membershipError } = await supabase
    .from('app_admins')
    .select('user_id')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (membershipError || !membership) {
    throw unauthorized();
  }

  return { user: userData.user, supabase };
};

export const toAdminApiError = (error) => ({
  statusCode: Number(error?.statusCode || 500),
  message: Number(error?.statusCode) === 401 ? 'Unauthorized' : 'Server error'
});
