'use client';
import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { CopyButton } from '@/components/learning/copy-button';
import { joinUrl } from '@/lib/join-link';

/** "Share" button for a class module's owner: opens the short join code, a QR code that lands students on the join screen, and copy buttons. */
export function ShareCourseCode({ code, title }: { code: string; title: string }) {
  const [open, setOpen] = useState(false);
  const url = joinUrl(code);
  return <>
    <Button type="button" variant="outline" size="sm" data-testid="share-course" onClick={() => setOpen(true)}>
      <Share2 className="size-4" aria-hidden />Share
    </Button>
    <Modal open={open} onClose={() => setOpen(false)} title="Share this course" description={`Students scan the QR code or enter the code to join “${title}”.`}>
      <div className="flex flex-col items-center gap-4 text-center">
        <p data-testid="share-code" className="select-all text-4xl font-extrabold tracking-wider text-violet-700">{code}</p>
        <div className="rounded-2xl border border-zinc-200 bg-white p-3">
          <QRCodeSVG data-testid="share-qr" value={url} size={192} level="M" marginSize={0} role="img" aria-label={`QR code that opens ${url}`} title={`Join ${title}`} />
        </div>
        <p data-testid="share-url" className="max-w-full break-all text-xs text-zinc-500">{url}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <CopyButton value={code} label="Copy code" />
          <CopyButton value={url} label="Copy link" />
        </div>
      </div>
    </Modal>
  </>;
}
