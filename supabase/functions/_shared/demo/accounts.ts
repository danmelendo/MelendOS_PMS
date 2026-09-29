// Fictitious demo accounts, shared by scripts/seed-auth.mjs (creates them),
// the demo-login Edge Function (the only accounts it opens) and the demo
// account picker. Production never enables demo access.

export interface DemoAccount {
  email: string;
  label: string;
  kind: "staff" | "guest";
  /** Staff role and hotels (seed keys), for tenant_members. */
  role?: "admin" | "reception" | "group" | "platform";
  tenants?: ("lumen" | "albora")[];
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    email: "grupo@demostays.example",
    label: "Dirección de grupo · los dos hoteles",
    kind: "staff",
    role: "group",
    tenants: ["lumen", "albora"],
  },
  {
    email: "admin@lumen.demostays.example",
    label: "Dirección · Hotel Lumen",
    kind: "staff",
    role: "admin",
    tenants: ["lumen"],
  },
  {
    email: "recepcion@lumen.demostays.example",
    label: "Recepción · Hotel Lumen",
    kind: "staff",
    role: "reception",
    tenants: ["lumen"],
  },
  {
    email: "admin@albora.demostays.example",
    label: "Dirección · Albora Hotel & Spa",
    kind: "staff",
    role: "admin",
    tenants: ["albora"],
  },
  {
    email: "recepcion@albora.demostays.example",
    label: "Recepción · Albora Hotel & Spa",
    kind: "staff",
    role: "reception",
    tenants: ["albora"],
  },
  {
    // Melend/OS support: full control of every hotel (platform_admins).
    email: "soporte@demostays.example",
    label: "Administrador · soporte de Melend/OS",
    kind: "staff",
    role: "platform",
    tenants: ["lumen", "albora"],
  },
  {
    email: "alex@guest.demostays.example",
    label: "Alex Río · huésped de los dos hoteles",
    kind: "guest",
  },
];

export const isDemoAccount = (email: string) =>
  DEMO_ACCOUNTS.some((a) => a.email === email.trim().toLowerCase());
