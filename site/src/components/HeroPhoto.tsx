// Background of the night headers: a small hotel with its sign lit against a
// dark sky (photo by Ana Vieyra on Unsplash, Unsplash License; see README).
// On wide screens the photo sits top right and melts into the night on its
// left (its sky is the same navy), so the sign shows above the content; on
// phones it covers the header, dimmed so the headline keeps its contrast.
export function HeroPhoto({ priority = false }: { priority?: boolean }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <img
        src="/hero-hotel-1600.webp"
        srcSet="/hero-hotel-1600.webp 1600w, /hero-hotel-2560.webp 2560w"
        sizes="(min-width: 1024px) 72vw, 100vw"
        alt=""
        width={2560}
        height={1707}
        decoding="async"
        fetchPriority={priority ? "high" : "auto"}
        loading={priority ? "eager" : "lazy"}
        className="absolute inset-0 h-full w-full object-cover object-[68%_30%] lg:inset-auto lg:-top-28 lg:right-0 lg:h-auto lg:w-[72%] lg:[mask-composite:intersect] lg:[mask-image:linear-gradient(90deg,transparent,black_32%),linear-gradient(0deg,transparent,black_35%)]"
      />
      {/* Contrast for the headline on the left */}
      <div className="absolute inset-0 bg-[linear-gradient(90deg,oklch(0.16_0.04_262/0.94)_0%,oklch(0.16_0.04_262/0.78)_34%,oklch(0.16_0.04_262/0.2)_62%,transparent_100%)]" />
      {/* Phones: the headline runs over the whole width, so the photo stays dimmer */}
      <div className="absolute inset-0 bg-[oklch(0.16_0.04_262/0.5)] lg:hidden" />
      {/* Melt into the section below */}
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-[linear-gradient(0deg,oklch(0.185_0.042_262),transparent)]" />
    </div>
  );
}
