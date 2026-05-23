'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type RecoveryStatus = 'checking' | 'ready' | 'invalid';

export function UpdatePasswordForm() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState<RecoveryStatus>('checking');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let mounted = true;

    const markReady = () => {
      if (mounted) {
        setStatus('ready');
        setError('');
      }
    };

    const markInvalid = (message: string) => {
      if (mounted) {
        setStatus('invalid');
        setError(message);
      }
    };

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') && session) {
        markReady();
      }
    });

    const establishSession = async () => {
      const code = searchParams.get('code');

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          markInvalid(error.message);
          return;
        }
        markReady();
        return;
      }

      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (error) {
          markInvalid(error.message);
          return;
        }

        markReady();
        return;
      }

      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (user) {
        markReady();
      } else {
        markInvalid(
          error?.message ||
            'This password update link is invalid or has expired. Request a new reset link.'
        );
      }
    };

    establishSession();

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [searchParams, supabase]);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setMessage('Password updated successfully. Redirecting to sign in...');
    setLoading(false);

    window.setTimeout(async () => {
      await supabase.auth.signOut();
      router.push('/login');
      router.refresh();
    }, 1200);
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-[var(--radius-card)] bg-[var(--color-card)] p-8 shadow-lg">
        <h1 className="mb-6 text-center text-2xl font-bold tracking-tight text-white">
          Update Password
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
        {status === 'checking' && (
          <div className="rounded bg-[var(--color-surface)] p-3 text-sm text-[var(--color-muted)]">
            Checking your password update link...
          </div>
        )}
        {status === 'invalid' && (
          <p className="text-center text-sm text-[var(--color-muted)]">
            <Link href="/forgot-password" className="text-white hover:underline">
              Request a new reset link
            </Link>
          </p>
        )}
        {status === 'ready' && (
          <form onSubmit={handleUpdatePassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--color-muted)]">
                New password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="mt-1 block w-full rounded border border-[var(--color-surface)] bg-[#111] p-2 text-white focus:border-white focus:outline-none focus:ring-1 focus:ring-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-muted)]">
                Confirm new password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                className="mt-1 block w-full rounded border border-[var(--color-surface)] bg-[#111] p-2 text-white focus:border-white focus:outline-none focus:ring-1 focus:ring-white"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-[var(--radius-button)] bg-white py-2 font-semibold text-black transition-colors hover:bg-gray-200 disabled:opacity-50"
            >
              {loading ? 'Updating password...' : 'Update Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
