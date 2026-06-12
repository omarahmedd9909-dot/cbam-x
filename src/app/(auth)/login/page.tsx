'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Globe, ArrowRight, Mail, CheckCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const supabase = createClient();

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError('');

    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    });

    if (signInError) {
      setError(signInError.message);
    } else {
      setSent(true);
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'hsl(var(--surface-sunken))' }}>
      {/* Header */}
      <header className="flex items-center gap-3 px-8 py-6">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'hsl(var(--accent))' }}
        >
          <Globe className="w-4 h-4 text-white" />
        </div>
        <span className="text-sm font-semibold" style={{ color: 'hsl(var(--ink-primary))' }}>
          CBAM X
        </span>
      </header>

      {/* Form */}
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="card">
            {sent ? (
              <div className="text-center py-4">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
                  style={{ background: 'hsl(var(--success-muted))' }}
                >
                  <CheckCircle className="w-6 h-6" style={{ color: 'hsl(var(--success))' }} />
                </div>
                <h2 className="text-base font-semibold mb-2" style={{ color: 'hsl(var(--ink-primary))' }}>
                  Check your email
                </h2>
                <p className="text-sm" style={{ color: 'hsl(var(--ink-secondary))' }}>
                  We&apos;ve sent a sign-in link to{' '}
                  <strong style={{ color: 'hsl(var(--ink-primary))' }}>{email}</strong>.
                  It expires in 1 hour.
                </p>
                <button
                  onClick={() => { setSent(false); setEmail(''); }}
                  className="mt-4 text-sm"
                  style={{ color: 'hsl(var(--accent))' }}
                >
                  Use a different email
                </button>
              </div>
            ) : (
              <>
                <div className="mb-6">
                  <h1 className="text-xl font-semibold mb-1" style={{ color: 'hsl(var(--ink-primary))' }}>
                    Sign in
                  </h1>
                  <p className="text-sm" style={{ color: 'hsl(var(--ink-secondary))' }}>
                    Enter your work email to receive a sign-in link.
                  </p>
                </div>

                <form onSubmit={handleMagicLink} className="space-y-4">
                  <div>
                    <label
                      htmlFor="email"
                      className="block text-xs font-medium mb-1.5"
                      style={{ color: 'hsl(var(--ink-secondary))' }}
                    >
                      Work email
                    </label>
                    <div className="relative">
                      <Mail
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                        style={{ color: 'hsl(var(--ink-tertiary))' }}
                      />
                      <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@company.com"
                        required
                        className="input pl-9"
                        autoComplete="email"
                        autoFocus
                      />
                    </div>
                  </div>

                  {error && (
                    <p className="text-xs rounded-md p-2" style={{
                      color: 'hsl(var(--danger))',
                      background: 'hsl(var(--danger-muted))'
                    }}>
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={loading || !email.trim()}
                    className="btn btn-primary w-full"
                  >
                    {loading ? 'Sending...' : (
                      <>
                        Send sign-in link
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>

                <p className="mt-4 text-center text-xs" style={{ color: 'hsl(var(--ink-tertiary))' }}>
                  No account yet?{' '}
                  <Link href="/signup" style={{ color: 'hsl(var(--accent))' }}>
                    Create one free
                  </Link>
                </p>
              </>
            )}
          </div>

          <p className="text-center text-xs mt-4" style={{ color: 'hsl(var(--ink-tertiary))' }}>
            By signing in, you agree to our{' '}
            <a href="https://cbamx.com/terms" style={{ color: 'hsl(var(--accent))' }}>
              Terms
            </a>{' '}
            and{' '}
            <a href="https://cbamx.com/privacy" style={{ color: 'hsl(var(--accent))' }}>
              Privacy Policy
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
