import { useEffect, useState } from 'react';

import { requireSupabase } from '@/lib/supabaseDb';

export function ClientAvatar({
  name,
  avatarPath,
  size = 36,
}: {
  name: string;
  avatarPath: string | null | undefined;
  size?: number;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!avatarPath) {
        setUrl(null);
        return;
      }
      try {
        const sb = requireSupabase();
        const { data, error } = await sb.storage.from('client_avatars').createSignedUrl(avatarPath, 60 * 60);
        if (error) throw error;
        if (!alive) return;
        setUrl(data?.signedUrl || null);
      } catch {
        if (!alive) return;
        setUrl(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [avatarPath]);

  const initials = (name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('');

  return (
    <div
      className="relative overflow-hidden rounded-full border border-white/10 bg-white/5"
      style={{ width: size, height: size }}
      aria-label="Foto do cliente"
      title={name}
    >
      {url ? (
        <img src={url} alt={name} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-white/70">{initials}</div>
      )}
    </div>
  );
}
