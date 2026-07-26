import React, { useState } from 'react';
import { LockKeyhole, LogIn, Scissors } from 'lucide-react';
import { supabase } from '../services/supabaseClient';

interface LoginViewProps {
  accessDenied?: boolean;
}

export const LoginView: React.FC<LoginViewProps> = ({ accessDenied = false }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(
    accessDenied ? 'החשבון מחובר, אך לא הוגדר כמנהל Pawlished.' : null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    });

    if (signInError) {
      setError('פרטי ההתחברות אינם נכונים.');
    }
    setIsSubmitting(false);
  };

  const signOut = async () => {
    await supabase?.auth.signOut();
    setError(null);
  };

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-pink-100 via-white to-amber-50 p-4 flex items-center justify-center">
      <div className="w-full max-w-md rounded-3xl border border-pink-100 bg-white p-7 shadow-xl">
        <div className="flex items-center justify-center gap-3 text-pink-700">
          <Scissors className="h-7 w-7" />
          <h1 className="text-3xl font-bold">Pawlished</h1>
        </div>
        <div className="mt-3 flex items-center justify-center gap-2 text-sm text-gray-500">
          <LockKeyhole className="h-4 w-4" />
          מערכת ניהול מאובטחת
        </div>

        <form onSubmit={signIn} className="mt-7 space-y-4">
          <div>
            <label htmlFor="login-email" className="mb-1 block text-sm font-medium text-gray-700">
              אימייל
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 outline-none focus:border-pink-300 focus:ring-4 focus:ring-pink-100"
            />
          </div>
          <div>
            <label htmlFor="login-password" className="mb-1 block text-sm font-medium text-gray-700">
              סיסמה
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 outline-none focus:border-pink-300 focus:ring-4 focus:ring-pink-100"
            />
          </div>

          {error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!supabase || isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-pink-600 px-4 py-3 font-bold text-white transition hover:bg-pink-700 disabled:opacity-50"
          >
            <LogIn className="h-5 w-5" />
            {isSubmitting ? 'מתחבר…' : 'כניסה'}
          </button>

          {accessDenied && (
            <button
              type="button"
              onClick={() => void signOut()}
              className="w-full rounded-2xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              יציאה מהחשבון
            </button>
          )}
        </form>
      </div>
    </div>
  );
};
