// Shared look of every email (guest emails and the sign-in emails of Auth):
// a white card on a light grey page, inline styles for the clients that
// ignore <style>, plus
//   - "light only" colour scheme, which Apple Mail and others respect;
//   - a designed dark version (prefers-color-scheme, and Outlook's
//     [data-ogsc]/[data-ogsb]) for the apps that darken emails anyway, so they
//     do not invert it on their own (grey boxes, washed-out labels);
//   - a phone layout: less padding and side-by-side boxes stacked.
// Classes: t1 headings, t2 body text, t3 muted, box tinted panel, line border,
// ok/ko/info status pills.

export const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
export const SERIF = "Georgia,'Times New Roman',serif";
export const MONO = "'SFMono-Regular',Consolas,'Liberation Mono',monospace";

export const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

const CSS = `:root{color-scheme:light only;supported-color-schemes:light only}
body{margin:0;padding:0;-webkit-text-size-adjust:100%}
a{text-decoration:none}
@media (max-width:540px){
.outer{padding:0!important}
.card{border-radius:0!important;border-left:0!important;border-right:0!important}
.px{padding-left:20px!important;padding-right:20px!important}
.col{display:block!important;width:100%!important;box-sizing:border-box}
.gap{display:block!important;width:100%!important;height:10px!important;line-height:10px!important}
.hotel{font-size:22px!important}
}
@media (prefers-color-scheme:dark){
.bg{background:#0b1220!important}
.card{background:#111827!important;border-color:#1f2937!important}
.t1{color:#f8fafc!important}
.t2{color:#cbd5e1!important}
.t3{color:#94a3b8!important}
.box{background:#172033!important;border-color:#263248!important}
.line{border-color:#1f2937!important}
.ok{background:#14532d!important;color:#bbf7d0!important}
.ko{background:#7f1d1d!important;color:#fecaca!important}
.info{background:#1e293b!important;color:#e2e8f0!important}
}
[data-ogsb] .bg{background:#0b1220!important}
[data-ogsb] .card{background:#111827!important}
[data-ogsc] .t1{color:#f8fafc!important}
[data-ogsc] .t2{color:#cbd5e1!important}
[data-ogsc] .t3{color:#94a3b8!important}
[data-ogsb] .box{background:#172033!important}
[data-ogsb] .ok{background:#14532d!important}
[data-ogsc] .ok{color:#bbf7d0!important}
[data-ogsb] .ko{background:#7f1d1d!important}
[data-ogsc] .ko{color:#fecaca!important}
[data-ogsb] .info{background:#1e293b!important}
[data-ogsc] .info{color:#e2e8f0!important}`;

export interface ShellOptions {
  lang: string;
  title: string;
  /** Hidden line the inbox shows next to the subject. */
  preheader: string;
  /** Header rows (<tr>…</tr>): the hotel's, or Melend/OS's. */
  header: string;
  /** Body rows (<tr>…</tr>). */
  body: string;
  /** Small print under the card. */
  below: string;
}

export function shell(o: ShellOptions): string {
  return `<!doctype html>
<html lang="${esc(o.lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><title>${esc(o.title)}</title>
<style>${CSS}</style></head>
<body class="bg" style="margin:0;padding:0;background:#eef1f5;font-family:${FONT};color:#1f2937">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(o.preheader)}</div>
<table role="presentation" class="bg" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f5"><tr><td class="outer" align="center" style="padding:32px 12px">
<table role="presentation" class="card" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
${o.header}
${o.body}
</table>
<p class="t3" style="margin:16px 12px 0;font-size:11px;line-height:1.5;color:#94a3b8">${o.below}</p>
</td></tr></table>
</body></html>`;
}

/** A status pill: ok (green), ko (red) or info (neutral). */
export function pill(kind: "ok" | "ko" | "info", label: string): string {
  const [bg, fg] =
    kind === "ok"
      ? ["#dcfce7", "#166534"]
      : kind === "ko"
        ? ["#fee2e2", "#991b1b"]
        : ["#f1f5f9", "#334155"];
  return `<span class="${kind}" style="display:inline-block;padding:4px 10px;border-radius:999px;background:${bg};color:${fg};font-size:12px;font-weight:600">${esc(label)}</span>`;
}

/** A button that looks the same in every client (the link fills the cell). */
export function button(href: string, label: string, accent: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:8px;background:${accent}">
<a href="${esc(href)}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;background:${accent}">${esc(label)}</a>
</td></tr></table>`;
}
