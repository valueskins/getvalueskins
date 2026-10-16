'use client';

import { useState } from 'react';
import type { MeResponse } from '@valueskins/shared';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Callout';
import { Icon } from '@/components/ui/Icon';
import { EmailForm, EmailSent, useEmailFlow } from '@/components/onboarding/EmailStep';
import { Panel, Row } from './Rows';

export function EmailPanel({ me }: { me: MeResponse }) {
  const flow = useEmailFlow(me);
  const [editing, setEditing] = useState(false);
  const current = me.user.email;
  const verified = Boolean(me.user.emailVerifiedAt);
  // The API never sends a pending address equal to the verified one; this guards the local one.
  const pending = flow.sentTo && flow.sentTo !== current ? flow.sentTo : null;

  return (
    <Panel
      id="email"
      title="Email"
      action={
        !editing && !pending ? (
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            Change
          </Button>
        ) : null
      }
    >
      <div>
        <Row k={pending ? 'In use' : 'Email'}>
          <span className="flex flex-wrap items-center gap-2">
            {current ?? 'None yet'}
            {current && verified ? (
              <Badge kind="ok">
                <Icon name="check" />
                Verified
              </Badge>
            ) : null}
          </span>
        </Row>
      </div>
      {pending ? (
        <div className="callout callout-wait flex-col">
          <div>
            <p className="callout-title">Confirm {pending}</p>
            <p>
              We sent a link to the new address. It works for 24 hours. Until you open it, we keep
              using {current ?? 'your current email'}.
            </p>
          </div>
          <EmailSent
            compact
            sentTo={pending}
            onDifferent={() => {
              flow.setSentTo(null);
              setEditing(true);
            }}
          />
        </div>
      ) : null}
      {editing && !pending ? (
        <EmailForm
          label="New email"
          help="We send a link to the new address. Your current email stays in use until you open it."
          onSent={(address) => {
            flow.setSentTo(address);
            setEditing(false);
          }}
          secondary={
            <Button variant="text" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          }
        />
      ) : null}
    </Panel>
  );
}
