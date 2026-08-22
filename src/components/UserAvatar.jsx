import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function UserAvatar({ profile, size = 48, className = '' }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let alive = true;
    if (!profile?.avatar_path) { setSrc(''); return undefined; }
    supabase.storage.from('uploads').createSignedUrl(profile.avatar_path, 3600)
      .then(({ data }) => { if (alive) setSrc(data?.signedUrl || ''); })
      .catch(() => { if (alive) setSrc(''); });
    return () => { alive = false; };
  }, [profile?.avatar_path]);
  const initials = (profile?.full_name || 'S').trim().split(/\s+/).slice(-2).map(x => x[0]).join('').toUpperCase();
  return <span className={`sumi-user-avatar ${className}`} style={{ width: size, height: size }} aria-hidden="true">
    {src ? <img src={src} alt="" /> : <b>{initials}</b>}
  </span>;
}
