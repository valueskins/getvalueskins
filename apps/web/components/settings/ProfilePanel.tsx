'use client';

import type { MeResponse } from '@valueskins/shared';
import { formatDate } from '@/lib/format';
import { Badge } from '@/components/ui/Callout';
import { Icon } from '@/components/ui/Icon';
import { SupportEmail } from '@/components/shell/SupportEmail';
import { GENDER_LABELS } from '@/components/forms/ProfileForm';
import { Panel, Row } from './Rows';

/** Read-only: profile details are saved once (REPLACEMENT_PLAN 2.4). */
export function ProfilePanel({ me }: { me: MeResponse }) {
  const d = me.profileDetails;
  const isBrand = me.user.role === 'BRAND';
  return (
    <Panel
      id="profile"
      title="Profile"
      action={
        d ? (
          <Badge kind="draft">
            <Icon name="lock" />
            Saved
          </Badge>
        ) : null
      }
    >
      {d ? (
        <>
          <div>
            <Row k={isBrand ? 'Brand name' : 'Full name'}>{d.name}</Row>
            <Row k="City">{d.city}</Row>
            {isBrand ? (
              <>
                {d.website ? (
                  <Row k="Website">
                    <a href={d.website} target="_blank" rel="noreferrer" className="break-all">
                      {d.website}
                    </a>
                  </Row>
                ) : null}
                {d.pitch ? (
                  <Row k="Hiring pitch">
                    <span className="whitespace-pre-line">{d.pitch}</span>
                  </Row>
                ) : null}
              </>
            ) : (
              <>
                {d.age !== null ? (
                  <Row k="Age">
                    <span className="t-mono">{d.age}</span>
                  </Row>
                ) : null}
                {d.gender ? <Row k="Gender">{GENDER_LABELS[d.gender]}</Row> : null}
              </>
            )}
            {d.adultConfirmedAt ? (
              <Row k="18 or older">Confirmed on {formatDate(d.adultConfirmedAt)}</Row>
            ) : null}
          </div>
          <div className="callout callout-info">
            <Icon name="info" />
            <p>
              Saved on {formatDate(d.lockedAt)}. To correct this, write to us at <SupportEmail />.
            </p>
          </div>
        </>
      ) : (
        <p className="t-body c-ink-2">Your profile is not saved yet.</p>
      )}
    </Panel>
  );
}
