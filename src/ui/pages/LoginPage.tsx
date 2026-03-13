import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';

import { useAuth } from '@/auth/authStore';
import { signInWithPassword } from '@/auth/supabaseAuth';
import { env } from '@/env';
import { setRole, setTokens } from '@/lib/apiClient';

type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  tokenType?: string;
  expiresIn?: number;
  organizations?: Array<{ id: string; name: string; role?: string }>;
};

export function LoginPage() {
  const nav = useNavigate();
  const loc = useLocation();
  const auth = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);

  useEffect(() => {
    // Check if URL has hash fragment with access_token (successful recovery)
    // or if the Supabase event fires.
    const checkRecovery = async () => {
      if (typeof window !== 'undefined' && window.location.hash.includes('type=recovery')) {
        setIsRecoveryMode(true);
      }
      
      try {
        const { onAuthStateChange } = await import('@/auth/supabaseAuth');
        onAuthStateChange(() => {
          // You could also check event types here if exported, 
          // but we rely on the URL hash mostly.
        });
      } catch (e) {
        // ignore
      }
    };
    checkRecovery();
  }, [loc]);

  async function loginWithBackend(emailValue: string, passwordValue: string) {
    const res = await fetch(`${env.apiBaseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailValue, password: passwordValue }),
    });

    const json = (await res.json().catch(() => null)) as LoginResponse | { message?: string } | null;

    if (!res.ok) {
      const msg = (json as any)?.message || 'Falha no login.';
      throw new Error(Array.isArray(msg) ? msg.join(', ') : msg);
    }

    const data = json as LoginResponse;
    if (!data?.accessToken || !data?.refreshToken) {
      throw new Error('Resposta de login inválida (tokens ausentes).');
    }

    setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });

    const firstOrg = data.organizations?.[0]?.id;
    if (firstOrg) auth.setOrgId(firstOrg);

    const firstRole = String(data.organizations?.[0]?.role || '').toLowerCase();
    if (firstRole) {
      setRole(firstRole === 'owner' ? 'admin' : firstRole);
    }
  }

  async function onUpdatePassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { supabase } = await import('@/lib/supabaseClient');
      if (!supabase) throw new Error('Supabase Client not found');
      
      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) throw updateErr;
      
      alert('Senha atualizada com sucesso! Você já pode entrar.');
      setIsRecoveryMode(false);
      setPassword('');
      nav('/app');
    } catch (err: any) {
      setError(err?.message || 'Falha ao atualizar senha.');
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Prefer backend JWT auth when API is configured.
      if (env.apiBaseUrl) {
        try {
          await loginWithBackend(email, password);

          // Keep Supabase session in sync for role-based guards/pages that still depend on it.
          if (env.supabaseUrl && env.supabaseAnonKey) {
            await signInWithPassword(email, password).catch(() => ({ error: null } as any));
          }

          nav('/app');
          return;
        } catch (backendErr: any) {
          // Se der erro de credenciais no backend novo, vamos tentar no Supabase antigo antes de falhar
          if (env.supabaseUrl && env.supabaseAnonKey) {
            const { error: sbError } = await signInWithPassword(email, password);
            if (sbError) {
              // Falhou nos dois
              throw new Error('Falha no login. Verifique seu e-mail e senha.');
            }
            // Funcionou no Supabase, prossegue
            nav('/app');
            return;
          }
          throw backendErr;
        }
      }

      // Fallback: Supabase auth (legacy path).
      if (!env.supabaseUrl || !env.supabaseAnonKey) {
        throw new Error('API indisponível e Supabase não configurado.');
      }

      const { error } = await signInWithPassword(email, password);
      if (error) throw new Error(error.message || 'Falha no login.');

      nav('/app');
    } catch (err: any) {
      setError(err?.message || 'Falha no login.');
    } finally {
      setLoading(false);
    }
  }

  if (isRecoveryMode) {
    return (
      <div className="mx-auto w-full max-w-md">
        <div className="rounded-2xl border border-white/10 bg-neutral-950/50 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.06)] backdrop-blur">
          <div className="text-xl font-semibold text-white">Criar Nova Senha</div>
          <div className="mt-1 text-sm text-white/60">Digite a senha que você deseja usar para acessar o sistema.</div>

          <form onSubmit={onUpdatePassword} className="mt-6 grid gap-4">
            <label className="text-sm text-white/80">
              Nova Senha
              <div className="relative mt-1">
                <input
                  className="input !mt-0 w-full pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type={showPassword ? 'text' : 'password'}
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white/80"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>

            <button disabled={loading} className="btn-primary">
              {loading ? 'Salvando…' : 'Salvar Nova Senha'}
            </button>

            {error ? <div className="text-sm text-red-200">{error}</div> : null}
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="rounded-2xl border border-white/10 bg-neutral-950/50 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.06)] backdrop-blur">
        <div className="text-xl font-semibold text-white">Entrar</div>
        <div className="mt-1 text-sm text-white/60">Acesse a área do advogado.</div>

        <form onSubmit={onSubmit} className="mt-6 grid gap-4">
          <label className="text-sm text-white/80">
            E-mail
            <input
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
              required
            />
          </label>

          <label className="text-sm text-white/80">
            Senha
            <div className="relative mt-1">
              <input
                className="input !mt-0 w-full pr-10"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white/80"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </label>

          <button disabled={loading} className="btn-primary">
            {loading ? 'Entrando…' : 'Entrar'}
          </button>

          {error ? <div className="text-sm text-red-200">{error}</div> : null}

          <div className="text-center mt-2">
            <button
              type="button"
              onClick={async () => {
                if (!email) {
                  setError('Digite seu e-mail acima para receber o link de redefinição.');
                  return;
                }
                setLoading(true);
                setError(null);
                try {
                  const { error: resetErr } = await import('@/auth/supabaseAuth').then(m => m.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/app/login' }));
                  if (resetErr) throw resetErr;
                  alert('Um link seguro para definir sua senha foi enviado para seu e-mail!');
                } catch (e: any) {
                  setError(e?.message || 'Falha ao enviar e-mail de redefinição.');
                } finally {
                  setLoading(false);
                }
              }}
              className="text-xs text-white/50 hover:text-white/80 hover:underline"
            >
              Primeiro Acesso / Esqueci a Senha
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
