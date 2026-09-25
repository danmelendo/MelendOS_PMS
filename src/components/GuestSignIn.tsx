import { useState } from "react";
import { LogIn } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useBrand } from "@/lib/brand";

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
      <p className="mt-4 text-center text-xs text-neutral-400">
        Cuenta de demostración: alex@guest.demostays.example
      </p>
    </div>
  );
}
