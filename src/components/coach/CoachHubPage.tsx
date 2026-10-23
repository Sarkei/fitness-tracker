/**
 * Top-level KI-Coach Hub (`/coach`).
 * Optional: `?type=workout|nutrition` und `?coachOnboarding=1`.
 */

import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import CoachPage from '@/src/components/coach/CoachPage';

export default function CoachHubPage() {
  const [params] = useSearchParams();
  const planType = useMemo(() => {
    const raw = params.get('type');
    return raw === 'workout' || raw === 'nutrition' ? raw : undefined;
  }, [params]);
  const autoStartOnboarding = params.get('coachOnboarding') === '1';

  return <CoachPage planType={planType} autoStartOnboarding={autoStartOnboarding} />;
}
