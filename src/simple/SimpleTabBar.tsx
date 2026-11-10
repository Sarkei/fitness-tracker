import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { CalendarCheck, Dumbbell, MoreHorizontal, Utensils, X } from 'lucide-react';

const TABS = [
  { to: '/', label: 'Heute', icon: CalendarCheck },
  { to: '/training', label: 'Training', icon: Dumbbell },
  { to: '/foods', label: 'Essen', icon: Utensils },
];

const MORE = [
  { to: '/coach', label: 'Coach & Pläne', hint: 'Trainings- und Ernährungsplan erzeugen' },
  { to: '/workouts', label: 'Training (ausführlich)', hint: 'Vorlagen, Verlauf, Übungsbibliothek' },
  { to: '/nutrition', label: 'Ernährung (ausführlich)', hint: 'Vorlagen, Tagesreview, Details' },
  { to: '/stats', label: 'Statistik', hint: 'Fortschritt und Auswertungen' },
  { to: '/profile', label: 'Profil & Ziele', hint: 'Kalorienziel, Makros, Einstellungen' },
];

export default function SimpleTabBar() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const isTab = TABS.some((t) => t.to === location.pathname);

  return (
    <>
      {/* Mobil: Leiste unten */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border-muted)] bg-[var(--card-bg)]/95 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-md items-stretch">
          {TABS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition ${
                  isActive ? 'text-[var(--simple-accent)]' : 'text-[var(--text-muted)]'
                }`
              }
            >
              <Icon className="h-5 w-5" strokeWidth={1.9} />
              {label}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-semibold ${
              isTab ? 'text-[var(--text-muted)]' : 'text-[var(--simple-accent)]'
            }`}
          >
            <MoreHorizontal className="h-5 w-5" strokeWidth={1.9} />
            Mehr
          </button>
        </div>
      </nav>

      {/* Desktop: Kopfzeile mit Pills, wie im Meal Planner */}
      <header className="sticky top-0 z-40 hidden border-b border-[var(--border-muted)] bg-[var(--background)]/90 backdrop-blur lg:block">
        <div className="mx-auto flex max-w-5xl items-center gap-6 px-8 py-3">
          <span
            className="text-lg tracking-tight text-[var(--foreground)]"
            style={{ fontFamily: 'var(--simple-serif)' }}
          >
            VRTX
          </span>
          <nav className="flex gap-1 rounded-2xl border border-[var(--border-muted)] bg-[var(--card-bg)] p-1">
            {TABS.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-xl px-4 py-1.5 text-sm font-medium transition ${
                    isActive
                      ? 'bg-[var(--simple-accent-soft)] text-[var(--simple-accent)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--foreground)]'
                  }`
                }
              >
                <Icon className="h-4 w-4" strokeWidth={1.9} /> {label}
              </NavLink>
            ))}
          </nav>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="ml-auto rounded-xl p-2 text-[var(--text-muted)] transition hover:text-[var(--foreground)]"
            aria-label="Mehr"
          >
            <MoreHorizontal className="h-5 w-5" strokeWidth={1.9} />
          </button>
        </div>
      </header>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 sm:items-center sm:p-6"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl border border-[var(--border-muted)] bg-[var(--card-bg)] p-3 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between px-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">Mehr</p>
              <button className="rounded-lg p-1.5 text-[var(--text-muted)]" onClick={() => setOpen(false)} aria-label="Schließen">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-0.5">
              {MORE.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className="block rounded-xl px-3 py-2.5 transition hover:bg-[var(--border-muted)]/40"
                >
                  <span className="block text-sm font-medium">{item.label}</span>
                  <span className="block text-xs text-[var(--text-muted)]">{item.hint}</span>
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
