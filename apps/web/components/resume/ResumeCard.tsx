'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ApiError } from '@/lib/api/client';
import { errorText } from '@/lib/api/errors';
import { useResume } from '@/lib/api/queries';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { useMediaQuery } from '@/components/ui/useMediaQuery';
import { ResumeContent, ResumeSkeleton, ResumeUnavailable } from './ResumeContent';

/** How long the pointer rests on the name before the card opens, and how long it may leave. */
export const HOVER_OPEN_MS = 300;
export const HOVER_CLOSE_MS = 150;

interface ResumeCardProps {
  userId: string;
  username: string;
  profilePictureUrl?: string | null;
}

/**
 * A username that opens the person's resume. On a desktop it opens after a
 * short pause on hover; on a touch screen a tap opens it as a bottom sheet;
 * from the keyboard Enter or Space opens it and Escape closes it, returning
 * focus to the name. The data loads only when it first opens.
 */
export function ResumeCard({ userId, username, profilePictureUrl }: ResumeCardProps) {
  const [open, setOpen] = useState(false);
  const touch = useMediaQuery('(hover: none), (pointer: coarse)');
  const resume = useResume(userId, open);
  const trigger = useRef<HTMLButtonElement>(null);
  const wrapper = useRef<HTMLSpanElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);
  const titleId = useId();
  const cardId = useId();

  const clearTimer = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };

  const close = (focusTrigger: boolean) => {
    clearTimer();
    setOpen(false);
    if (focusTrigger) trigger.current?.focus();
  };

  useEffect(() => clearTimer, []);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close(true);
      }
    }
    function onDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (wrapper.current?.contains(target) || sheet.current?.contains(target)) return;
      close(false);
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open]);

  useEffect(() => {
    if (open && touch) sheet.current?.focus();
  }, [open, touch]);

  const hoverHandlers = touch
    ? {}
    : {
        onMouseEnter: () => {
          clearTimer();
          if (!open) timer.current = window.setTimeout(() => setOpen(true), HOVER_OPEN_MS);
        },
        onMouseLeave: () => {
          clearTimer();
          if (open) timer.current = window.setTimeout(() => setOpen(false), HOVER_CLOSE_MS);
        },
      };

  const notFound = resume.error instanceof ApiError && resume.error.status === 404;
  const content = resume.data ? (
    <ResumeContent data={resume.data} titleId={titleId} />
  ) : notFound ? (
    <ResumeUnavailable />
  ) : resume.isError ? (
    <div className="resume-sec border-t-0">
      <p className="t-small c-ink-2">{errorText(resume.error)}</p>
    </div>
  ) : (
    <ResumeSkeleton />
  );

  return (
    <span className="resume-anchor" ref={wrapper} {...hoverHandlers}>
      <button
        ref={trigger}
        type="button"
        className="chip-btn"
        aria-expanded={open}
        aria-controls={open ? cardId : undefined}
        aria-haspopup="dialog"
        onClick={() => {
          clearTimer();
          setOpen((v) => !v);
        }}
      >
        <Avatar name={username} src={profilePictureUrl} size={24} />
        <span className="chip-name">@{username}</span>
        <span className="sr-only">, show profile</span>
      </button>
      {open && !touch ? (
        <div id={cardId} className="popover" role="dialog" aria-label={`About @${username}`}>
          {content}
        </div>
      ) : null}
      {open && touch
        ? createPortal(
            <div
              className="overlay"
              onMouseDown={(e) => e.target === e.currentTarget && close(true)}
            >
              <div
                id={cardId}
                ref={sheet}
                className="sheet-bottom"
                role="dialog"
                aria-modal="true"
                aria-label={`About @${username}`}
                tabIndex={-1}
              >
                <div className="sheet-grip" aria-hidden="true" />
                <div className="flex justify-end px-2 pt-1">
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon"
                    aria-label="Close"
                    onClick={() => close(true)}
                  >
                    <Icon name="x" />
                  </button>
                </div>
                {content}
              </div>
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
