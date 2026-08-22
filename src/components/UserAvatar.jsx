import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function UserAvatar({ profile, size = 48, className = '' }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    if (!profile?.avatar_path) { setSrc(''); return undefined; }
    const { data } = supabase.storage.from('uploads').getPublicUrl(profile.avatar_path);
    setSrc(data?.publicUrl ? `${data.publicUrl}?v=${encodeURIComponent(profile.avatar_path)}` : '');
    return undefined;
  }, [profile?.avatar_path]);
  const initials = (profile?.full_name || 'S').trim().split(/\s+/).slice(-2).map(x => x[0]).join('').toUpperCase();
  return <span className={`sumi-user-avatar ${className}`} style={{ width: size, height: size }} aria-hidden="true">
    {src ? <img src={src} alt="" onError={()=>setSrc('')} /> : <b>{initials}</b>}
  </span>;
}
