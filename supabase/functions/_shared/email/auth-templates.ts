// Sign-in emails sent by Auth (GoTrue): invitation of the staff, password
// reset, sign-in link, email confirmation and email change. Same look as the
// guest emails (layout.ts), with the Melend/OS mark because they come from the
// platform, not from one hotel. Spanish, with one line in English (guests
// reset their password from "Mi reserva" too).
//
// They are Go templates: {{ .ConfirmationURL }} and {{ .Email }} are filled in
// by Auth. scripts/email-templates.ts writes them to public/email-templates/,
// the web serves them and each installation points Auth to them
// (AUTH_TEMPLATES_URL, deploy/vps/instance/docker-compose.override.yml).
import { button, esc, SERIF, shell } from "./layout.ts";

const NAVY = "#16233f";
const GOLD = "#c9a45c";

export type AuthEmailKind = "invite" | "recovery" | "magic_link" | "confirmation" | "email_change";

interface AuthCopy {
  subject: string;
  title: string;
  intro: string;
  cta: string;
  note: string;
  english: string;
}

const COPY: Record<AuthEmailKind, AuthCopy> = {
  invite: {
    subject: "Te han invitado al panel de Melend/OS",
    title: "Te damos la bienvenida",
    intro:
      "Te han dado acceso al panel de gestión de tu hotel. Elige tu contraseña para entrar por primera vez.",
    cta: "Aceptar la invitación",
    note: "El enlace caduca en 24 horas. Si no esperabas esta invitación, ignora este email.",
    english:
      "You have been invited to your hotel's Melend/OS panel: use the button to choose your password.",
  },
  recovery: {
    subject: "Restablece tu contraseña",
    title: "Restablece tu contraseña",
    intro: "Hemos recibido una petición para cambiar la contraseña de esta cuenta.",
    cta: "Elegir una contraseña nueva",
    note: "El enlace caduca en 1 hora y solo sirve una vez. Si no lo has pedido tú, ignora este email: tu contraseña no cambia.",
    english:
      "Someone asked to reset the password of this account. If it was not you, ignore this email.",
  },
  magic_link: {
    subject: "Tu enlace para entrar",
    title: "Tu enlace para entrar",
    intro: "Usa este botón para entrar sin contraseña.",
    cta: "Entrar",
    note: "El enlace caduca en 1 hora y solo sirve una vez. Si no lo has pedido tú, ignora este email.",
    english: "Use the button to sign in. If you did not ask for it, ignore this email.",
  },
  confirmation: {
    subject: "Confirma tu email",
    title: "Confirma tu email",
    intro: "Confirma que esta dirección es tuya para terminar de crear la cuenta.",
    cta: "Confirmar mi email",
    note: "Si no has creado ninguna cuenta, ignora este email.",
    english: "Confirm this address to finish creating your account.",
  },
  email_change: {
    subject: "Confirma tu nuevo email",
    title: "Confirma tu nuevo email",
    intro:
      "Has pedido cambiar el email de tu cuenta a {{ .NewEmail }}. Confírmalo para que el cambio se aplique.",
    cta: "Confirmar el cambio",
    note: "Si no lo has pedido tú, ignora este email y el email de tu cuenta seguirá siendo el mismo.",
    english: "Confirm the new email address of your account.",
  },
};

/** The Melend/OS mark, as text: images of the logo are blocked by many clients. */
const HEADER = `<tr><td class="px" style="background:${NAVY};padding:26px 32px"><span style="font-family:${SERIF};font-size:24px;color:#ffffff;letter-spacing:.01em">Melend<span style="color:${GOLD}">/OS</span></span></td></tr>`;

export function authEmail(kind: AuthEmailKind): { subject: string; html: string } {
  const c = COPY[kind];
  // {{ … }} are Auth's placeholders: kept as they are (esc does not touch braces).
  const body = `<tr><td class="px" style="padding:32px 32px 8px">
<p class="t1" style="margin:0 0 10px;font-family:${SERIF};font-size:22px;color:#0f172a">${esc(c.title)}</p>
<p class="t2" style="margin:0;font-size:16px;line-height:1.55;color:#334155">${esc(c.intro)}</p>
<p class="t3" style="margin:10px 0 0;font-size:13px;color:#64748b">{{ .Email }}</p>
</td></tr>
<tr><td align="center" class="px" style="padding:28px 32px 8px">${button("{{ .ConfirmationURL }}", c.cta, NAVY)}</td></tr>
<tr><td class="px t3" style="padding:12px 32px 0;font-size:13px;line-height:1.5;color:#64748b">${esc(c.note)}</td></tr>
<tr><td class="px" style="padding:24px 32px 28px"><div class="t3 line" style="padding-top:16px;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.5;color:#94a3b8">${esc(c.english)}</div></td></tr>`;
  return {
    subject: c.subject,
    html: shell({
      lang: "es",
      title: c.subject,
      preheader: c.intro,
      header: HEADER,
      body,
      below: "Melend/OS &middot; Gestión hotelera",
    }),
  };
}

export const AUTH_EMAIL_KINDS = Object.keys(COPY) as AuthEmailKind[];
