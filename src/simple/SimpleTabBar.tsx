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
  { to: '/workouts', label: 'Training (alt)', hint: 'Vorlagen, Verlauf, Übungsbibliothek' },
  { to: '/nutrition', label: 'Ernährung (alt)', hint: 'Vorlagen, Tagesreview, Details' },
  { to: '/stats', label: 'Statistik', hint: 'Fortschritt und Auswertungen' },
  { to: '/profile', label: 'Profil & Ziele', hint: 'Kalorienziel, Makros, Einstellungen' },
];

export default function SimpleTabBar() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const isTab = TABS.some((t) => t.to === location.pathname);

  return (
    <>
      {/* Mobil: Tab-Leiste unten */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border-muted)] bg-[var(--card-bg)]/95 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-md items-stretch">
          {TABS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition ${
                  isActive ? 'text-brand' : 'text-[var(--text-muted)]'
                }`
              }
            >
              <Icon className="h-5 w-5" strokeWidth={2.2} />
              {label}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-semibold ${
              isTab ? 'text-[var(--text-muted)]' : 'text-brand'
            }`}
          >
            <MoreHorizontal className="h-5 w-5" strokeWidth={2.2} />
            Mehr
          </button>
        </div>
      </nav>

      {/* Desktop: schmale Leiste oben */}
      <nav className="sticky top-0 z-40 hidden border-b border-[var(--border-muted)] bg-[var(--card-bg)]/90 backdrop-blur lg:block">
        <div className="mx-auto flex max-w-3xl items-center gap-1 px-6 py-2">
          <span className="mr-4 text-sm font-black uppercase tracking-tighter text-brand">VRTX</span>
          {TABS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
                  isActive ? 'bg-brand/10 text-brand' : 'text-[var(--text-muted)] hover:text-[var(--foreground)]'
                }`
              }
            >
              <Icon className="h-4 w-4" strokeWidth={2.2} /> {label}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="ml-auto rounded-full p-2 text-[var(--text-muted)] hover:text-[var(--foreground)]"
            aria-label="Mehr"
          >
            <MoreHorizontal className="h-5 w-5" />
          </button>
        </div>
      </nav>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-md rounded-t-3xl border border-[var(--border-muted)] bg-[var(--card-bg)] p-4 sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-black uppercase tracking-tighter">Mehr</p>
              <button className="rounded-full p-1.5 text-[var(--text-muted)]" onClick={() => setOpen(false)} aria-label="Schließen">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-1">
              {MORE.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className="block rounded-2xl px-3 py-2.5 transition hover:bg-[var(--surface-gray)]"
                >
                  <span className="block text-sm font-semibold">{item.label}</span>
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
