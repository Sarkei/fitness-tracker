/** Prueft den Formatter gegen eine echte Coach-Antwort. */
import { formatChatText } from '../src/lib/chatFormat';

const antwort = 'Klar, hier drei Tipps zum Abnehmen:\n\n- *Moderates Defizit statt Crash-Diät*: Ziel etwa *300–500 kcal* unter deinem Bedarf pro Tag – so nimmst du nachhaltig ca. 0,25–0,5 kg pro Woche ab.\n- *Protein hoch halten*: rund *1,6–2 g Protein pro kg Körpergewicht* am Tag – hält satt und schützt die Muskeln.\n- *Alltag bewegen*: dein Schrittziel von *10.000 Schritten* täglich plus 2–3 Krafteinheiten pro Woche sind ein solider Grundstock.\n\nWenn du willst, passe ich dein Kalorienziel von aktuell 2.500 kcal auf ein Abnehm-Defizit an.';


function ser(n: unknown): string {
  if (n == null || n === false) return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(ser).join('');
  const el = n as { type?: unknown; props?: { children?: unknown } };
  if (el && el.props) {
    const name = typeof el.type === 'string' ? el.type : 'Comp';
    return `${name}(${ser(el.props.children)})`;
  }
  return '';
}

const out = ser(formatChatText(antwort));
console.log('Laenge:', out.length);
console.log('ul-Elemente:', (out.match(/ul\(/g) || []).length);
console.log('li-Elemente:', (out.match(/li\(/g) || []).length);
console.log('strong-Elemente:', (out.match(/strong\(/g) || []).length);
console.log('Sterne uebrig:', (out.match(/\*/g) || []).length);
console.log('\nAuszug:\n' + out.slice(0, 300));

const ok = out.includes('ul(') && (out.match(/li\(/g) || []).length === 3
  && (out.match(/strong\(/g) || []).length >= 5 && !out.includes('*');
console.log('\n=== ' + (ok ? 'BESTANDEN' : 'FEHLGESCHLAGEN') + ' ===');
if (!ok) process.exit(1);
