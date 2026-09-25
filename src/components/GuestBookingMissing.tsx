import { Link } from "@tanstack/react-router";

/** Shown while a guest booking loads, or when the link does not open it. */
export function GuestBookingMissing({ loading }: { loading: boolean }) {
  if (loading) return <p className="py-20 text-center text-sm text-neutral-400">Cargando…</p>;
  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <h1 className="text-xl font-semibold">No encontramos esta reserva</h1>
      <p className="mt-2 text-sm text-neutral-500">
        El enlace no es válido en este dispositivo o ha caducado. Ábrelo desde el correo o el
        mensaje que te enviamos, o escríbenos con tu referencia de reserva.
      </p>
      <Link
        to="/web"
        className="mt-6 inline-flex bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white"
      >
        Volver al inicio
      </Link>
    </div>
  );
}
