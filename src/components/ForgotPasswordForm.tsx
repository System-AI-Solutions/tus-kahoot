'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

const PASSWORD_RESET_REDIRECT = 'https://tus-revision.netlify.app/update-password';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: PASSWORD_RESET_REDIRECT,
    });

    if (error) {
      setError(error.message);
    } else {
      setMessage('Check your email for a password reset link.');
    }

    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-[var(--radius-card)] bg-[var(--color-card)] p-8 shadow-lg">
        <h1 className="mb-6 text-center text-2xl font-bold tracking-tight text-white">
          Reset Password
        </h1>
        {error && (
          <div className="mb-4 rounded bg-red-900/50 p-3 text-sm text-red-200">
            {error}
          </div>
        )}
        {message && (
          <div className="mb-4 rounded bg-green-900/40 p-3 text-sm text-green-200">
            {message}
          </div>
        )}
        <form onSubmit={handleReset} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--color-muted)]">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 block w-full rounded border border-[var(--color-surface)] bg-[#111] p-2 text-white focus:border-white focus:outline-none focus:ring-1 focus:ring-white"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-[var(--radius-button)] bg-white py-2 font-semibold text-black transition-colors hover:bg-gray-200 disabled:opacity-50"
          >
            {loading ? 'Sending link...' : 'Send Reset Link'}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-[var(--color-muted)]">
          Remember your password?{' '}
          <Link href="/login" className="text-white hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
