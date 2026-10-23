# Fitness Tracker Style Guide (1:1)

Diese Datei beschreibt den visuellen Stil des `fitness_tracker` so, dass du ihn in andere Projekte (z. B. `budget_tracker`) kopieren kannst.

Ziel: **gleicher Look**, nur andere Logik.

## 1) Design-Prinzipien

- Minimalistisch, kontraststark, sportlich.
- Sehr viele `uppercase` Labels mit `font-black` und `tracking-widest`.
- Brand-Farbe ist Teal (`#14b8a6`) als Akzent.
- Wenig bis kein Shadow-Glow bei Buttons (global deaktiviert).
- Große Radien (`rounded-xl`, `rounded-2xl`, `rounded-3xl`) und klare Border-Layer.
- Voller Mobile-Fokus mit Safe-Area + Bottom-Nav.

## 2) Kernfarben / Tokens

## Light
- `--background: #f1f5f9`
- `--foreground: #0f172a`
- `--text-primary: var(--foreground)`
- `--card-bg: #ffffff`
- `--border-muted: #e2e8f0`
- `--text-muted: #334155`
- `--text-placeholder: #64748b`

## Dark
- `--background: #171717`
- `--foreground: #f5f5f5`
- `--text-primary: var(--foreground)`
- `--card-bg: #262626`
- `--border-muted: #404040`
- `--text-muted: #a3a3a3`
- `--text-placeholder: #737373`

## Brand
- `--color-brand: #14b8a6` (teal-500)
- `--color-brand-muted: #99f6e4` (teal-200)

## 3) Typografie

- Font: `Inter`
- Headings häufig: `font-black uppercase tracking-tight`
- Micro Labels: `text-[8px]` oder `text-[9px]`, `font-black uppercase tracking-widest`
- Standard-Text auf Oberfläche: `text-[var(--text-primary)]`
- Sekundärtext: `text-[var(--text-muted)]`

## 4) Copy-Paste: globale CSS-Basis

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
@import "tailwindcss";

:root {
  --background: #f1f5f9;
  --foreground: #0f172a;
  --text-primary: var(--foreground);
  --card-bg: #ffffff;
  --border-muted: #e2e8f0;
  --text-muted: #334155;
  --text-placeholder: #64748b;

  --vv-bottom-inset: 0px;
  --vv-top-inset: 0px;
  --vv-height: 100dvh;
  --mobile-tab-bar-h: 3.75rem;
  --mobile-quick-sheet-bottom: calc(4.25rem + env(safe-area-inset-bottom, 0px));
  --shell-pad-bottom: max(5.25rem, calc(var(--mobile-tab-bar-h) + env(safe-area-inset-bottom, 0px)));
}

.dark {
  --background: #171717;
  --foreground: #f5f5f5;
  --text-primary: var(--foreground);
  --card-bg: #262626;
  --border-muted: #404040;
  --text-muted: #a3a3a3;
  --text-placeholder: #737373;
}

html, body, #root {
  min-height: 100dvh;
  min-height: -webkit-fill-available;
}

body {
  background-color: var(--background);
  color: var(--foreground);
  font-family: "Inter", ui-sans-serif, system-ui, sans-serif;
}

.safe-area-pt {
  padding-top: max(0.5rem, env(safe-area-inset-top));
}

/* Fokus */
:where(
  a, button, input:not([type="hidden"]), select, textarea, summary,
  [role="button"], [tabindex]:not([tabindex="-1"])
):focus-visible {
  outline: 2px solid color-mix(in srgb, #14b8a6 70%, transparent);
  outline-offset: 2px;
}

/* Placeholder */
input::placeholder,
textarea::placeholder {
  color: var(--text-placeholder);
  opacity: 1;
  font-weight: 500;
}

/* Scrollbars hidden */
* { -ms-overflow-style: none; scrollbar-width: none; }
*::-webkit-scrollbar { display: none; }
```

## 5) Copy-Paste: UI Utility-Klassen

```css
@layer components {
  button,
  [role='button'],
  .ui-btn-brand {
    --tw-shadow: 0 0 #0000 !important;
    --tw-shadow-colored: 0 0 #0000 !important;
    box-shadow: none !important;
  }

  .ui-choice {
    @apply border-2 transition-colors border-[var(--border-muted)] hover:border-brand/50;
  }

  .ui-choice[data-selected='true'],
  .ui-choice-selected {
    @apply border-brand bg-brand/15 text-[var(--text-primary)];
  }

  .ui-btn-brand {
    @apply inline-flex items-center justify-center gap-2 border-2 border-brand bg-brand/15 text-brand font-black uppercase tracking-widest rounded-xl transition-colors hover:bg-brand/25 disabled:opacity-30;
  }

  .ui-mark-selected {
    @apply border-2 border-brand bg-brand/15 text-[var(--text-primary)];
  }
}
```

## 6) Komponenten-Stilrezepte (1:1)

## Buttons
- Primär: `.ui-btn-brand` + `min-h-[44px]` bis `min-h-[52px]`.
- Sekundär: `bg-neutral-800 border border-neutral-700 text-neutral-300`.
- Danger/Icon: `text-red-400`, kleiner Icon-Button mit `p-1`/`p-2`.

## Karten
- Standard: `rounded-2xl border border-neutral-800 bg-neutral-900/60`
- Aktiv/Selected: `border-brand/40 bg-brand/5 ring-1 ring-brand/30`
- Light-Variante: `bg-[var(--card-bg)] border border-[var(--border-muted)]`

## Inputs
- Höhe: meist `min-h-[48px]`
- Oberfläche: `bg-black/40` (dark sections) oder `bg-[var(--background)]` (light sections)
- Typo: `text-center text-lg font-black tabular-nums`
- Fokus: `focus:ring-2 focus:ring-brand` (+ `focus:outline-none`)

## Badges / Labels
- Label-Größe fast immer `text-[8px]`/`text-[9px]`
- Muster: `font-black uppercase tracking-widest`
- Akzent-Hintergrund: `bg-brand/10 text-brand`

## Overlays / Modals
- Backdrop: `bg-black/80` oder `bg-black/70 backdrop-blur-sm`
- Modal-Card: `rounded-3xl border border-neutral-800 bg-neutral-900`
- Mobile Sheets: `fixed inset-0`, `items-end sm:items-center`

## Sidebar (Desktop)
- Container: `fixed top-0 left-0 bottom-0 w-64`
- Surface: `bg-[var(--card-bg)] border-r border-[var(--border-muted)]`
- Nav-Link aktiv: `.ui-mark-selected`
- Nav-Link inaktiv: `text-[var(--text-muted)] hover:bg-[var(--border-muted)]`

## Bottom Bar (Mobile)
- `position: fixed` unten, immer Safe-Area berücksichtigen
- Surface: `bg-[var(--card-bg)] border-t border-[var(--border-muted)] backdrop-blur-xl`
- Aktiver Tab: `text-brand` + kleiner Teal-Indikator oben
- Center-FAB: runder Brand-Button mit Ring in Card-Farbe

## 7) Mobile Viewport / Safe-Area (wichtig)

```css
.mobile-bottom-nav {
  bottom: var(--vv-bottom-inset, 0px);
  padding-bottom: max(0.25rem, env(safe-area-inset-bottom, 0px));
}

html.app-standalone-pwa .mobile-bottom-nav {
  bottom: 0 !important;
  padding-bottom: max(0.375rem, env(safe-area-inset-bottom, 0px));
}

html.workout-session-active .mobile-bottom-nav {
  display: none !important;
}

html.workout-session-active,
html.workout-session-active body {
  overflow: hidden;
  overscroll-behavior: none;
}
```

## 8) Spacing / Radius / Density

- Primäre Border-Radien:
  - `rounded-lg` (small controls)
  - `rounded-xl` (buttons/inputs)
  - `rounded-2xl` (cards)
  - `rounded-3xl` (modals/high-emphasis surfaces)
- Interne Gaps meist `gap-1.5`, `gap-2`, `gap-3`.
- Vertical rhythm sehr kompakt auf Mobile, großzügiger auf Desktop.

## 9) Migration-Plan für budget_tracker (empfohlen)

1. **Tokens übernehmen**: oben stehende `:root`/`.dark` Variablen in `budget_tracker/src/index.css`.
2. **Utility-Klassen übernehmen**: `.ui-btn-brand`, `.ui-choice`, `.ui-mark-selected`.
3. **Shell-Layout angleichen**:
   - Desktop Sidebar mit gleicher Breite/Farblogik.
   - Mobile Bottom-Bar mit Safe-Area.
4. **Komponenten vereinheitlichen**:
   - Buttons → gleiche Height, Caps, Tracking.
   - Cards → gleiche Border/Radius/Background.
   - Inputs → gleiche Focus/Placeholder-Regeln.
5. **Theme-Schalter** im gleichen Stil (Sun/Moon Icon Button).
6. **Overlays** auf `bg-black/70..80 + backdrop-blur` umstellen.

## 10) Nicht vergessen

- Für 1:1-Gefühl immer dieselbe Schrift (`Inter`) und dieselbe Großbuchstaben-Optik verwenden.
- Wenn du einen Screen migrierst: zuerst Layout + Tokens, dann Komponenten, erst danach Detail-Spacing.

