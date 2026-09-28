import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useBrand } from "@/lib/brand";

// Sales demo: a hotel's own website (built by someone else, with its own
// look) with the Melend/OS widget pasted in, exactly as the panel's snippet
// does. /ejemplo-web?hotel=<slug>
export const Route = createFileRoute("/ejemplo-web")({
  component: ExampleSite,
});

function ExampleSite() {
  const { brand, ready } = useBrand();

  // The snippet, as the hotel pastes it.
  useEffect(() => {
    if (!ready || !brand.id) return;
    const script = document.createElement("script");
    script.src = "/embed.js";
    script.async = true;
    script.dataset.hotel = brand.id;
    script.dataset.color = brand.accent;
    document.body.appendChild(script);
    return () => {
      // Leaving the page in this app: take the widget away with it.
      script.remove();
      document
        .querySelectorAll('iframe[src*="/embed/"]')
        .forEach((f) => f.parentElement?.removeChild(f));
      document.querySelectorAll("button").forEach((b) => {
        if (b.textContent === "¿Te ayudo a reservar?" && b.parentElement === document.body)
          b.remove();
      });
      (window as { __melendosWidget?: boolean }).__melendosWidget = false;
    };
  }, [ready, brand.id, brand.accent]);

  if (!ready) return null;
  return (
    <div className="min-h-screen bg-[#faf7f2] font-serif text-[#2b2620]">
      <p className="bg-[#2b2620] px-4 py-2 text-center font-sans text-xs text-white/80">
        Ejemplo de demostración: la web propia de {brand.name}, hecha por otra agencia, con el motor
        de reservas de Melend/OS pegado en una línea.
      </p>
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <p className="text-2xl tracking-wide">{brand.name}</p>
        <nav className="hidden gap-6 font-sans text-sm uppercase tracking-widest sm:flex">
          <span>Inicio</span>
          <span>El hotel</span>
          <span>Galería</span>
          <span>Contacto</span>
        </nav>
      </header>
      <section className="mx-auto max-w-5xl px-6 pb-10 pt-6">
        <h1 className="max-w-2xl text-4xl leading-tight sm:text-5xl">
          {brand.tagline || "Tu casa en la ciudad"}
        </h1>
        <p className="mt-4 max-w-xl font-sans text-[#5c5348]">
          {brand.about || brand.heroSubtitle}
        </p>
      </section>
      <section className="mx-auto max-w-5xl px-6 pb-16">
        <p className="mb-3 font-sans text-sm font-semibold uppercase tracking-widest text-[#8a7b68]">
          Reserva al mejor precio, directo con nosotros
        </p>
        {/* ← Here goes the search box of the widget */}
        <div id="melendos-booking" />
      </section>
      <section className="mx-auto grid max-w-5xl gap-6 px-6 pb-24 sm:grid-cols-3">
        {["Ubicación inmejorable", "Desayuno casero", "Atención cercana"].map((t) => (
          <div key={t} className="border-t border-[#d9cfc2] pt-4">
            <p className="text-lg">{t}</p>
            <p className="mt-1 font-sans text-sm text-[#5c5348]">
              Texto de la web del hotel, que sigue siendo suya: Melend/OS solo pone el buscador y el
              asistente.
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}
