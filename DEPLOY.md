# Publicar la demo (enlace para clientes, sin instalar nada)

La demo funciona **sin backend** (mock en el navegador), así que el `build` es un sitio
**estático**: se aloja en cualquier hosting estático y el cliente solo abre una URL. No necesita
npm, ni IDE, ni servidor.

## Opción recomendada: Netlify Drop (arrastrar y soltar)

1. Genera el build:
   ```bash
   npm install      # solo la primera vez
   npm run build    # crea la carpeta dist/
   ```
2. Abre **https://app.netlify.com/drop**.
3. **Arrastra la carpeta `dist/`** a la página.
4. En segundos obtienes una URL pública (p. ej. `https://nombre-aleatorio.netlify.app`).
   En _Site settings → Change site name_ puedes ponerle un nombre más presentable.
5. Comparte ese enlace con el cliente. Funciona en ordenador y móvil.

> El archivo `public/_redirects` (`/*  /index.html  200`) ya está incluido: hace que las rutas
> internas (`/web`, `/today`, …) carguen bien al abrirlas o recargar. Se copia solo a
> `dist/` en cada build, no toques nada.

## Qué verá el cliente

- Aviso flotante **«Modo demo»** con botón para **reiniciar datos**.
- Web pública (`/web`), app del huésped (`/stays`) y panel de gestión (`/today`, entra ya como
  administrador demo).
- Sus cambios (reservas, ediciones, estados) **persisten en su navegador** y puede reiniciarlos
  cuando quiera. Cada visitante tiene su propia copia de los datos (no se comparten).

## Alternativas equivalentes

- **Cloudflare Pages** / **Vercel**: también leen `_redirects`; sube `dist/` o conecta el repo.
- **GitHub Pages**: copia `dist/` a la rama `gh-pages` (necesita un `404.html` igual a `index.html`
  como fallback en lugar de `_redirects`).

## Actualizar la demo

Vuelve a `npm run build` y repite el arrastre de `dist/` (Netlify Drop crea un sitio nuevo) o,
para una URL estable que se actualice sola, conecta el repositorio a Netlify/Vercel/Cloudflare
Pages con `build command: npm run build` y `publish directory: dist`.
