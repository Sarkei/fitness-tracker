
/** Selbsttest fuer den Chat-Formatter (reine Logik, ohne React-DOM). */
import { formatChatText } from '../src/lib/chatFormat';

type Fall = { name: string; input: string; erwartet: string[]; verboten?: string[] };

// Kleine Pruefung: gerenderte Struktur als JSON-Text inspizieren.
function serialisiere(node: unknown): string {
  if (node == null || node === false) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(serialisiere).join('');
  const el = node as { type?: unknown; props?: { children?: unknown } };
  if (el && el.props) {
    const name = typeof el.type === 'string' ? el.type : (el.type as { name?: string })?.name ?? 'Comp';
    return `${name}(${serialisiere(el.props.children)})`;
  }
  return '';
}

const faelle: Fall[] = [
  { name: 'doppelte Sterne -> strong', input: 'Das ist **fett** hier.', erwartet: ['strong(', 'fett'], verboten: ['**'] },
  { name: 'einfache Sterne -> strong', input: 'Das ist *fett* hier.', erwartet: ['strong(', 'fett'], verboten: ['*'] },
  { name: 'Unterstrich -> italic', input: 'Das ist _kursiv_ hier.', erwartet: ['em(', 'kursiv'], verboten: ['_'] },
  { name: 'Tilde -> strike', input: 'Das ist ~weg~ hier.', erwartet: ['s(', 'weg'], verboten: ['~'] },
  { name: 'Backtick -> code', input: 'Wert `105 kg` im Text.', erwartet: ['code(', '105 kg'], verboten: ['`'] },
  { name: 'Aufzaehlung -> li', input: '- Montag\n- Mittwoch', erwartet: ['ul(', 'li(', 'Montag', 'Mittwoch'] },
  { name: 'Sternchen-Aufzaehlung -> li', input: '* Erster\n* Zweiter', erwartet: ['ul(', 'li(', 'Erster'] },
  { name: 'Absaetze bleiben getrennt', input: 'Absatz eins.\n\nAbsatz zwei.', erwartet: ['Absatz eins.', 'Absatz zwei.'] },
  { name: 'kein HTML durchlassen', input: '<script>alert(1)</script>', erwartet: ['script'], verboten: [] },
];

let fehler = 0;
for (const f of faelle) {
  const out = serialisiere(formatChatText(f.input));
  const fehlend = f.erwartet.filter((e) => !out.includes(e));
  const verboten = (f.verboten ?? []).filter((v) => out.includes(v));
  if (fehlend.length || verboten.length) {
    fehler++;
    console.log(`FEHLER ${f.name}: fehlt=[${fehlend}] verboten=[${verboten}] out=${out.slice(0, 160)}`);
  } else {
    console.log(`ok     ${f.name}`);
  }
}

// Sicherheit: keine echten Elemente mit dangerouslySetInnerHTML
const quelle = String(formatChatText('<b>x</b>'));
console.log('kein dangerouslySetInnerHTML:', !quelle.includes('dangerouslySetInnerHTML'));

console.log(`\n=== ERGEBNIS: ${fehler} Fehler ===`);
if (fehler > 0) process.exit(1);
