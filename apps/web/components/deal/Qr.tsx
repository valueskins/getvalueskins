'use client';

import { useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/Skeleton';

/**
 * A QR code for a upi:// link. The qrcode library is loaded only when this
 * renders, which is only on the brand's pay step.
 */
export function Qr({ value, label, size = 196 }: { value: string; label: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setFailed(false);
    import('qrcode')
      .then((mod) =>
        mod.toDataURL(value, { margin: 0, width: size * 2, errorCorrectionLevel: 'M' }),
      )
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (failed)
    return <p className="t-small c-ink-2">The QR code could not be drawn. Use Pay with UPI app.</p>;
  return (
    <div className="qr">
      {src ? (
        // A data URL drawn in the browser: next/image adds nothing here.
        <img
          src={src}
          alt={label}
          width={size}
          height={size}
          style={{ width: size, height: size }}
        />
      ) : (
        <Skeleton className="block" style={{ width: size, height: size }} />
      )}
    </div>
  );
}
