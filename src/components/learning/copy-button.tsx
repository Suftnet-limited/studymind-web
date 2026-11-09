'use client';
import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Copies `value` to the clipboard and confirms. Falls back to a hidden textarea where the Clipboard API is unavailable. */
export function CopyButton({ value, label, copiedLabel = 'Copied' }: { value: string; label: string; copiedLabel?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  useEffect(() => {
    if (state === 'idle') return;
    const t = setTimeout(() => setState('idle'), 2500);
    return () => clearTimeout(t);
  }, [state]);
  async function copy() {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
      else {
        const area = document.createElement('textarea');
        area.value = value; area.setAttribute('readonly', ''); area.style.position = 'fixed'; area.style.opacity = '0';
        document.body.appendChild(area); area.select();
        const ok = document.execCommand('copy'); document.body.removeChild(area);
        if (!ok) throw new Error('copy failed');
      }
      setState('copied');
    } catch { setState('failed'); }
  }
  return <>
    <Button type="button" variant="outline" size="sm" onClick={copy}>
      {state === 'copied' ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      {state === 'copied' ? copiedLabel : label}
    </Button>
    <span role="status" aria-live="polite" className="sr-only">{state === 'copied' ? 'Copied to clipboard' : state === 'failed' ? 'Copy failed. Select the text and copy it manually.' : ''}</span>
    {state === 'failed' && <span className="text-xs text-red-700">Copy failed — select the text and copy it manually.</span>}
  </>;
}
