import React from 'react';
import { Button } from './forms/Button';
import { useVoiceInput } from '../lib/useVoiceInput';
import { IconMic } from './icons/FrogIcons';

export function VoiceMicButton({ onTranscript, onInterim, size = 'sm' }) {
  const voice = useVoiceInput();
  if (!voice.supported) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Button
        variant={voice.listening ? 'danger' : 'secondary'}
        size={size}
        icon={<IconMic size={16} />}
        onClick={() => voice.start(onTranscript, onInterim)}
      >
        {voice.listening ? 'Đang nghe...' : 'Nói'}
      </Button>
      {voice.error && (
        <div style={{ font: 'var(--text-caption)', color: 'var(--status-danger)' }}>{voice.error}</div>
      )}
    </div>
  );
}
