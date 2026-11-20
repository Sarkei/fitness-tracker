/**
 * Top-level KI-Coach Hub (`/coach`).
 * Optional: `?type=workout|nutrition` und `?coachOnboarding=1`.
 */

import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import CoachPage from '@/src/components/coach/CoachPage';
import CoachChatPage from '@/src/components/coach/CoachChatPage';

/**
 * `/coach` ist jetzt der KI-Chat.
 * Die fruehere Plan-Ansicht liegt im Trainingsbereich; fuer Deep-Links bleibt sie
 * ueber `/coach?plans=1` (optional mit `type` und `coachOnboarding=1`) erreichbar.
 */
export default function CoachHubPage() {
  const [params] = useSearchParams();
  const zeigePlaene = params.get('plans') === '1';
  const planType = useMemo(() => {
    const raw = params.get('type');
    return raw === 'workout' || raw === 'nutrition' ? raw : undefined;
  }, [params]);
  const autoStartOnboarding = params.get('coachOnboarding') === '1';

  if (!zeigePlaene) return <CoachChatPage />;
  return <CoachPage planType={planType} autoStartOnboarding={autoStartOnboarding} />;
}
