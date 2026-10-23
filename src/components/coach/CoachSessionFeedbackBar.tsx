import { useState } from 'react';
import { motion } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { useI18n } from '@/src/lib/i18n';
import { api } from '@/src/lib/api';

import type { AthleteWeekSnapshot } from '@/src/lib/coach/coachTypes';

type Props = {
  planId: string;
  sessionKey: string;
  onDone: () => void;
  onFactsRefreshed?: (snapshot: AthleteWeekSnapshot) => void;
};

export default function CoachSessionFeedbackBar({ planId, sessionKey, onDone, onFactsRefreshed }: Props) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);

  const submit = async (rating: 'easy' | 'ok' | 'hard') => {
    setBusy(true);
    try {
      const res = await api<{ factsSnapshot?: AthleteWeekSnapshot }>(
        `/api/coach/plans/${planId}/session-feedback`,
        {
          method: 'POST',
          body: JSON.stringify({ sessionKey, rating }),
        },
      );
      if (res.factsSnapshot) onFactsRefreshed?.(res.factsSnapshot);
      onDone();
    } catch {
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-brand/30 bg-brand/5 p-4 space-y-3"
    >
      <p className="text-[10px] font-black uppercase tracking-widest text-brand">{t('coach.feedback.title')}</p>
      <div className="grid grid-cols-3 gap-2">
        {(['easy', 'ok', 'hard'] as const).map((r) => (
          <button
            key={r}
            type="button"
            disabled={busy}
            onClick={() => void submit(r)}
            className={cn(
              'min-h-[44px] rounded-xl text-[9px] font-black uppercase tracking-widest disabled:opacity-50',
              r === 'easy' && 'bg-green-100 text-green-800',
              r === 'ok' && 'bg-blue-100 text-blue-800',
              r === 'hard' && 'bg-orange-100 text-orange-800',
            )}
          >
            {busy ? <Loader2 size={14} className="mx-auto animate-spin" /> : t(`coach.feedback.${r}`)}
          </button>
        ))}
      </div>
    </motion.div>
  );
}
