import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { BedDouble, LogIn, Mail } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useBrand } from "@/lib/brand";
import { DEMO_ACCESS } from "@/lib/demo-access";
import { DemoAccountPicker } from "@/components/DemoAccountPicker";

// Guest app sign-in (real backend). Guests who booked without an account can
// still manage that booking from the link in their confirmation.
export function GuestSignIn() {
  const { signIn } = useAuth();
  const { brand } = useBrand();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await signIn(email.trim(), password);
    setBusy(false);
    if (error) setError("Email o contraseña incorrectos");
  };

  return (
    <div className="px-5 pt-10">
      <h1 className="text-2xl font-semibold tracking-tight">Tu cuenta en {brand.name}</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Inicia sesión para ver tus estancias, hacer el check-in online y usar el club.
      </p>
      {DEMO_ACCESS ? (
        <div className="mt-6 bg-white p-5 shadow-sm ring-1 ring-neutral-100">
          <DemoAccountPicker kind="guest" tone="guest" />
        </div>
      ) : (
        <form
          onSubmit={submit}
          className="mt-6 space-y-3 bg-white p-5 shadow-sm ring-1 ring-neutral-100"
        >
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-neutral-400">
              Email
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              className="w-full border border-neutral-200 px-3 py-2.5 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-neutral-400">
              Contraseña
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="w-full border border-neutral-200 px-3 py-2.5 text-sm"
            />
          </label>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 bg-[var(--brand)] py-3 font-semibold text-white disabled:opacity-50"
          >
            <LogIn className="h-4 w-4" /> {busy ? "Entrando…" : "Iniciar sesión"}
          </button>
        </form>
      )}

      <div className="mt-8 space-y-3 border-t border-neutral-200 pt-6 text-sm">
        <p className="flex gap-2 text-neutral-500">
          <Mail className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            ¿Reservaste sin cuenta? Abre el enlace de tu email de confirmación para ver o gestionar
            tu reserva.
          </span>
        </p>
        <Link
          to="/web/hotels"
          className="flex w-full items-center justify-center gap-2 border border-neutral-300 bg-white py-3 font-semibold text-neutral-800"
        >
          <BedDouble className="h-4 w-4" /> Ver habitaciones y reservar
        </Link>
        <Link
          to="/web"
          className="block py-2 text-center text-neutral-500 underline-offset-4 hover:underline"
        >
          Volver a la web del hotel
        </Link>
      </div>
    </div>
  );
}
