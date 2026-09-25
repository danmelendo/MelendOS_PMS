// Fictitious demo accounts, shared by scripts/seed-auth.mjs (creates them),
// the demo-login Edge Function (the only accounts it opens) and the demo
// account picker. Production never enables demo access.

export interface DemoAccount {
  email: string;
  label: string;
  kind: "staff" | "guest";
  /** Staff role and hotel (seed key), for tenant_members. */
  role?: "admin" | "reception";
  tenant?: "lumen" | "albora";
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    email: "admin@lumen.demostays.example",
    label: "Dirección · Hotel Lumen",
    kind: "staff",
    role: "admin",
    tenant: "lumen",
  },
  {
    email: "recepcion@lumen.demostays.example",
    label: "Recepción · Hotel Lumen",
    kind: "staff",
    role: "reception",
    tenant: "lumen",
  },
  {
    email: "admin@albora.demostays.example",
    label: "Dirección · Albora Hotel & Spa",
    kind: "staff",
    role: "admin",
    tenant: "albora",
  },
  {
    email: "recepcion@albora.demostays.example",
    label: "Recepción · Albora Hotel & Spa",
    kind: "staff",
    role: "reception",
    tenant: "albora",
  },
  {
    email: "alex@guest.demostays.example",
    label: "Alex Río · huésped de los dos hoteles",
    kind: "guest",
  },
];

export const isDemoAccount = (email: string) =>
  DEMO_ACCOUNTS.some((a) => a.email === email.trim().toLowerCase());
