import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/auth/authStore';
import { setRole, setTokens } from '@/lib/apiClient';
import { Eye, EyeOff } from 'lucide-react';

import { signInWithPassword } from '@/auth/supabaseAuth';
import { env } from '@/env';
import { getErrorMessage } from '@/lib/errors';
import { readPasswordAction, type PasswordAction } from '@/lib/authPasswordAction';
import { clearInitialPasswordAction, initialPasswordAction } from '@/lib/supabaseClient';
import { updatePasswordForConfirmedSession, type ConfirmedPasswordSession } from '@/lib/authPasswordUpdate';


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
  const [passwordAction, setPasswordAction] = useState<PasswordAction>(initialPasswordAction);
  const [confirmedPassword, setConfirmedPassword] = useState('');
  const confirmedSession = useRef<ConfirmedPasswordSession | null>(null);
  const boundUserId = useRef<string | null>(null);
  const actionBlocked = useRef(false);
  const sessionEpoch = useRef(0);
  const passwordAttempt = useRef(0);

  useEffect(() => {
    let alive = true;
    let unsubscribe: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let verification = 0;
    const action = readPasswordAction({ search: loc.search, hash: loc.hash }) || initialPasswordAction;
    const invalidatePending = () => { sessionEpoch.current++; passwordAttempt.current++; confirmedSession.current = null; };
    const invalidateAction = () => {
      verification++; invalidatePending(); actionBlocked.current = true;
      clearInitialPasswordAction();
      if (timer) clearTimeout(timer);
      setIsRecoveryMode(false); setPasswordAction(null);
      setPassword(''); setConfirmedPassword(''); setShowPassword(false); setLoading(false);
      setError('A conta mudou durante a confirmação. Abra novamente o link de acesso para definir a senha da conta correta.');
    };
    void (async () => {
      const { supabase } = await import('@/lib/supabaseClient');
      if (!alive || !supabase) return;
      const verifyAction = async (nextAction: Exclude<PasswordAction, null>) => {
        if (actionBlocked.current) return;
        const attempt = ++verification;
        const epoch = sessionEpoch.current;
        try {
          const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
          if (!alive || attempt !== verification || epoch !== sessionEpoch.current || actionBlocked.current) return;
          const session = sessionData.session;
          if (sessionError || !session?.user.id || !session.access_token) {
            setIsRecoveryMode(false);
            setError('O link de acesso não confirmou uma sessão. Abra o link recebido por e-mail; se estiver vencido, solicite outro à administração.');
            return;
          }
          if (boundUserId.current && boundUserId.current !== session.user.id) { invalidateAction(); return; }
          boundUserId.current = session.user.id;
          const candidate = Object.freeze({ userId: session.user.id, accessToken: session.access_token });
          const { data: userData, error: userError } = await supabase.auth.getUser(candidate.accessToken);
          if (!alive || attempt !== verification || epoch !== sessionEpoch.current || actionBlocked.current) return;
          if (!userError && userData.user?.id === candidate.userId) {
            confirmedSession.current = candidate;
            setPasswordAction(nextAction); setIsRecoveryMode(true); setError(null);
          } else {
            setIsRecoveryMode(false);
            setError('O link de acesso não confirmou uma sessão. Abra o link recebido por e-mail; se estiver vencido, solicite outro à administração.');
          }
        } catch {
          // This action also runs from a deferred Auth callback, outside the initialization promise.
          if (!alive || attempt !== verification || epoch !== sessionEpoch.current || actionBlocked.current) return;
          setIsRecoveryMode(false);
          setError('Não foi possível validar o link de acesso.');
        }
      };
      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        if (!alive) return;
        if ((event === 'SIGNED_OUT' && (action || boundUserId.current)) || (boundUserId.current && session?.user.id !== boundUserId.current)) {
          invalidateAction(); return;
        }
        if (actionBlocked.current) return;
        if (session && (event === 'PASSWORD_RECOVERY' || action)) {
          boundUserId.current = session.user.id;
          if (confirmedSession.current) return;
          if (timer) clearTimeout(timer);
          // Auth callbacks hold the SDK lock. Verify with the server after the callback returns.
          timer = setTimeout(() => { void verifyAction(event === 'PASSWORD_RECOVERY' ? 'recovery' : action!); }, 0);
        }
      });
      unsubscribe = () => data.subscription.unsubscribe();
      if (action) await verifyAction(action);
    })().catch(() => { if (alive && action) setError('Não foi possível validar o link de acesso.'); });
    return () => { alive = false; verification++; invalidatePending(); if (timer) clearTimeout(timer); unsubscribe?.(); };
  }, [loc.search, loc.hash]);

  async function loginWithBackend(emailValue: string, passwordValue: string) {
    const res = await fetch(`${env.apiBaseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailValue, password: passwordValue }),
    });

    const json = (await res.json().catch(() => null)) as LoginResponse | { message?: string } | null;

    if (!res.ok) {
      const msg = (json as { message?: string })?.message || 'Falha no login.';
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
    const session = confirmedSession.current;
    const epoch = sessionEpoch.current;
    const attempt = ++passwordAttempt.current;
    const isCurrent = () => confirmedSession.current === session && !!session && epoch === sessionEpoch.current && attempt === passwordAttempt.current && !actionBlocked.current;
    if (!session || !isCurrent()) {
      setError('Abra novamente o link de acesso para confirmar a conta antes de definir a senha.');
      return;
    }
    if (password.length < 8 || password !== confirmedPassword) {
      setError('Use pelo menos 8 caracteres e confirme a mesma senha.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { supabase } = await import('@/lib/supabaseClient');
      if (!isCurrent()) return;
      if (!supabase || !env.supabaseUrl || !env.supabaseAnonKey) throw new Error('Autenticação indisponível: Supabase não configurado.');
      const verification = await supabase.auth.getUser(session.accessToken).catch(() => null);
      if (!isCurrent()) return;
      if (!verification || verification.error || verification.data.user?.id !== session.userId) throw new Error('Não foi possível confirmar a conta. Abra novamente o link de acesso.');
      await updatePasswordForConfirmedSession({ supabaseUrl: env.supabaseUrl, anonKey: env.supabaseAnonKey, session, password });
      if (!isCurrent()) return;
      alert('Senha atualizada com sucesso! Você já pode entrar.');
      if (!isCurrent()) return;
      setIsRecoveryMode(false);
      setPassword('');
      setConfirmedPassword('');
      clearInitialPasswordAction();
      nav(passwordAction === 'invite' ? '/app/configuracoes' : '/app');
    } catch (err: unknown) {
      if (isCurrent()) setError(getErrorMessage(err, 'Falha ao atualizar senha.'));
    } finally {
      if (isCurrent()) setLoading(false);
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
            await signInWithPassword(email, password).catch(() => ({ error: null }));
          }

          nav('/app');
          return;
        } catch (backendErr: unknown) {
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
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Falha no login.'));
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
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white/80"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>

            <label className="text-sm text-white/80">Confirmar nova senha
              <input className="input" value={confirmedPassword} onChange={event => setConfirmedPassword(event.target.value)} type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={8} required />
            </label>

            {passwordAction === 'invite' && <p className="text-sm text-white/60">Depois de criar sua senha, aceite o convite do escritório em Configurações para acessar a agenda e os clientes autorizados.</p>}

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
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
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
                } catch (e: unknown) {
                  setError(getErrorMessage(e, 'Falha ao enviar e-mail de redefinição.'));
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
