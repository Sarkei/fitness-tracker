import { useCallback, useRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ScanBarcode,
  Camera,
  Image,
  Plus,
  Scale,
  Droplets,
  Dumbbell,
  Footprints,
  MoonStar,
  Users,
  User,
  Brain,
  BarChart2,
  Utensils,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/src/lib/utils';
import { useI18n } from '@/src/lib/i18n';
import { emitNutritionQuick, emitQuickAction } from '@/src/lib/mobileQuickActions';
import type { NavItem } from '@/src/lib/navigationFocus';
import { useMobileOverlaySheet } from '@/src/lib/mobileViewport';

type QuickBtn = {
  id: string;
  labelKey: string;
  icon: LucideIcon;
  onClick: () => void;
};

type Section = {
  id: string;
  titleKey: string;
  items: QuickBtn[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** Overflow-Nav (Stats/Social/Profil/…) — Coach wird zusätzlich immer angeboten */
  overflowItems?: NavItem[];
  profilePicUrl?: string;
  pathname: string;
  labelFor: (item: NavItem) => string;
};

function ActionTile({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl border border-[var(--border-muted)] bg-[var(--background)] px-2 py-2 text-[11px] sm:text-xs font-black uppercase tracking-wide text-[var(--text-primary)] touch-manipulation active:bg-brand/10"
    >
      <Icon size={18} className="text-brand shrink-0" />
      <span className="text-center leading-tight">{label}</span>
    </button>
  );
}

export default function MobileQuickActionsSheet({
  open,
  onClose,
  overflowItems = [],
  profilePicUrl,
  pathname,
  labelFor,
}: Props) {
  const { t } = useI18n();
  const panelRef = useRef<HTMLDivElement>(null);
  const onEscape = useCallback(() => onClose(), [onClose]);
  useMobileOverlaySheet(open, { onEscape, panelRef });

  if (!open) return null;

  const runNutrition = (mode: Parameters<typeof emitNutritionQuick>[0]) => {
    onClose();
    emitNutritionQuick(mode);
  };

  const runAction = (action: Parameters<typeof emitQuickAction>[0]) => {
    onClose();
    emitQuickAction(action);
  };

  const sections: Section[] = [
    {
      id: 'nutrition',
      titleKey: 'nav.quick.cat.nutrition',
      items: [
        { id: 'barcode', labelKey: 'nav.quick.barcode', icon: ScanBarcode, onClick: () => runNutrition('barcode') },
        { id: 'photo', labelKey: 'nav.quick.photo', icon: Camera, onClick: () => runNutrition('ai-camera') },
        { id: 'upload', labelKey: 'nav.quick.upload', icon: Image, onClick: () => runNutrition('ai-upload') },
        { id: 'food', labelKey: 'nav.quick.logFood', icon: Plus, onClick: () => runNutrition('manual') },
      ],
    },
    {
      id: 'body',
      titleKey: 'nav.quick.cat.body',
      items: [
        { id: 'weight', labelKey: 'nav.quick.weight', icon: Scale, onClick: () => runAction({ type: 'weight' }) },
        { id: 'water', labelKey: 'nav.quick.water', icon: Droplets, onClick: () => runAction({ type: 'water', deltaMl: 250 }) },
        { id: 'steps', labelKey: 'nav.quick.steps', icon: Footprints, onClick: () => runAction({ type: 'steps' }) },
        { id: 'sleep', labelKey: 'nav.quick.sleep', icon: MoonStar, onClick: () => runAction({ type: 'sleep' }) },
      ],
    },
    {
      id: 'workout',
      titleKey: 'nav.quick.cat.workout',
      items: [
        { id: 'workout', labelKey: 'nav.quick.workout', icon: Dumbbell, onClick: () => runAction({ type: 'workout-log' }) },
      ],
    },
  ];

  return (
    <div data-mobile-quick-menu className="contents lg:hidden">
      <button
        type="button"
        aria-label={t('common.dismiss')}
        className="fixed inset-0 z-[54] bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="menu"
        tabIndex={-1}
        aria-label={t('nav.quick.title')}
        className="mobile-quick-actions-sheet fixed z-[55] left-2 right-2 rounded-2xl border border-[var(--border-muted)] bg-[var(--card-bg)] shadow-2xl overflow-hidden flex flex-col max-h-[min(72dvh,calc(var(--vv-height,100dvh)-7rem))] outline-none"
        onMouseDown={e => e.stopPropagation()}
        onClick={e => e.stopPropagation()}
      >
        <div className="shrink-0 px-4 py-3 border-b border-[var(--border-muted)] flex items-center justify-between gap-2">
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[var(--text-primary)]">
            {t('nav.quick.title')}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] min-h-[36px] px-2"
          >
            {t('nut.mission.close')}
          </button>
        </div>

        <div className="overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] p-2 space-y-3">
          {overflowItems.length > 0 && (
          <div>
            <p className="px-2 pb-2 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">
              {t('nav.quick.cat.navigation')}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {overflowItems.map(item => {
                const active =
                  pathname === item.path ||
                  (item.path !== '/' && pathname.startsWith(item.path));
                const isProfile = item.path === '/profile';
                const Icon =
                  item.path === '/coach'
                    ? Brain
                    : item.path === '/social'
                      ? Users
                      : item.path === '/stats'
                        ? BarChart2
                        : item.path === '/workouts'
                          ? Dumbbell
                          : item.path === '/nutrition'
                            ? Utensils
                            : User;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    role="menuitem"
                    onClick={onClose}
                    className={cn(
                      'flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-center text-[11px] font-black uppercase tracking-widest touch-manipulation',
                      active
                        ? 'border-2 border-brand bg-brand/15 text-[var(--text-primary)]'
                        : 'border-[var(--border-muted)] bg-[var(--background)] text-[var(--text-primary)]',
                    )}
                  >
                    {isProfile && profilePicUrl ? (
                      <img
                        src={profilePicUrl}
                        alt=""
                        className="h-6 w-6 rounded-lg object-cover ring-1 ring-[var(--border-muted)]"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <Icon size={20} className={item.path === '/coach' ? 'text-brand' : undefined} />
                    )}
                    <span className="leading-tight">{labelFor(item)}</span>
                  </Link>
                );
              })}
            </div>
          </div>
          )}

          {sections.map(section => (
            <div key={section.id}>
              <p className="px-2 pb-2 text-[9px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">
                {t(section.titleKey)}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {section.items.map(item => (
                  <ActionTile key={item.id} icon={item.icon} label={t(item.labelKey)} onClick={item.onClick} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
