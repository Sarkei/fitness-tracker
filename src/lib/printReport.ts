/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Opens a print dialog with a simple progress report (no extra dependencies). */
export function printFitnessReport(opts: {
  title: string;
  displayName: string;
  htmlSections: string[];
}): boolean {
  const body = `
    <h1>${escapeHtml(opts.title)}</h1>
    <p style="opacity:.7;font-size:12px;">Generiert für ${escapeHtml(opts.displayName)} · ${new Date().toLocaleString()}</p>
    <hr style="margin:16px 0;border:none;border-top:1px solid #ccc" />
    ${opts.htmlSections.join('<hr style="margin:24px 0;border:none;border-top:1px solid #eee" />')}
  `;
  const w = window.open('', '_blank');
  if (!w) {
    return false;
  }
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(opts.title)}</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 24px; max-width: 720px; margin: 0 auto; color: #111; }
    h1 { font-size: 20px; margin: 0 0 8px; }
    h2 { font-size: 14px; margin: 0 0 12px; text-transform: uppercase; letter-spacing: .05em; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #f3f4f6; }
  </style></head><body>${body}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => {
    w.print();
  }, 250);
  return true;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
