'use client';

import { useState } from 'react';
import { cx } from './cx';

interface AvatarProps {
  name: string;
  src?: string | null;
  size?: 24 | 32 | 40 | 56 | 64;
  className?: string;
}

function initial(name: string): string {
  const clean = name.replace(/^@/, '').trim();
  return (clean[0] ?? '?').toUpperCase();
}

const TONES = ['tone-saffron', 'tone-rose', 'tone-sand', 'tone-green', 'tone-plum'] as const;

/** A warm tint for the letter, the same for a name every time. */
export function toneFor(name: string): (typeof TONES)[number] {
  let sum = 0;
  for (const ch of name.replace(/^@/, '').toLowerCase()) sum = (sum * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[sum % TONES.length]!;
}

/** A circle with the picture, or the first letter while it loads or when there is none. */
export function Avatar({ name, src, size = 32, className }: AvatarProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const showImg = Boolean(src) && !failed;
  return (
    <span
      className={cx('avatar relative', toneFor(name), className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      aria-hidden="true"
    >
      {!loaded ? initial(name) : null}
      {showImg ? (
        // Instagram CDN pictures: a plain img, the URL is already sized.
        <img
          src={src!}
          alt=""
          className={cx('absolute inset-0 h-full w-full object-cover', !loaded && 'opacity-0')}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          referrerPolicy="no-referrer"
        />
      ) : null}
    </span>
  );
}

export function UserChip({
  username,
  src,
  sub,
  size = 24,
}: {
  username: string;
  src?: string | null;
  sub?: string;
  size?: 24 | 32 | 40;
}) {
  return (
    <span className="chip">
      <Avatar name={username} src={src} size={size} />
      <span className="flex min-w-0 flex-col">
        <span className="chip-name">@{username}</span>
        {sub ? <span className="chip-sub">{sub}</span> : null}
      </span>
    </span>
  );
}
