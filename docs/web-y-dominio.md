# Web y dominio de cada hotel

Lo que vendemos es el **motor de reservas integrado en la web del hotel**, no una web de marca (decisión del 28/09/2026). Cada hotel tiene su motor en un subdominio y puede usar además la **web de plantilla**, incluida en todos los planes, con sus fotos y una edición básica.

## Cómo sabe la web qué hotel mostrar

La web pública (`/web`) y la app del huésped (`/stays`) resuelven el hotel por el nombre de host (`src/lib/hotel-web.ts`, `hostHotel`):

1. **Dominio propio**: `tenants.domain`, por ejemplo `reservas.suhotel.com`. El hotel crea un CNAME hacia `VITE_PLATFORM_CNAME`.
2. **Subdominio de la plataforma**: `<slug>.<VITE_PLATFORM_DOMAIN>`, por ejemplo `hostal-sol.reservas.melendo.app`. Necesita un DNS comodín hacia el alojamiento del frontend.
3. **Ninguno** (`localhost` o el dominio de la demo): modo demo, con selector entre hoteles guardado en el navegador.

En los casos 1 y 2 el hotel queda fijado: no hay selector y solo se ven sus establecimientos. En desarrollo, `http://<slug>.localhost:5174` se comporta como el caso 2.

La identidad del hotel (nombre, color, textos, logo, foto de portada y galería) está en `tenants.brand`, y su web principal en `settings.website_url`, a donde lleva «Volver a la web». Ya no está fija en el código.

## La web de plantilla

Incluida en todos los planes. Es la misma `/web` para todos los hoteles, rellenada con sus datos:

- **Del PMS**: establecimientos, habitaciones, precios, disponibilidad, experiencias (si el hotel tiene el módulo) y reseñas.
- **De «Tu web»** (Admin → Web y dominio): logo, foto de portada, título y subtítulo, «Sobre nosotros», galería (hasta 24 fotos), color, teléfono, email, dirección con «Cómo llegar» y redes sociales.

Las fotos se reducen en el navegador (lado mayor de 2.000 px, WebP) y se guardan en el bucket público `hotel-media`, en la carpeta del hotel. Solo su dirección puede subir, cambiar o borrar ahí (políticas de Storage con `hotel_media_tenant()`). En el dominio de un hotel no se ven los enlaces de la demo («Panel de gestión», «App del huésped»). Diseño a medida no: si hace falta, es un servicio aparte.

## El widget para la web que ya tiene el hotel

Para el hotel que ya tiene su web (WordPress, Wix…): Admin → Web y dominio → «Añadir a tu web actual» da el fragmento, con opciones.

```html
<div id="melendos-booking"></div>
<script src="https://reservas.suhotel.com/embed.js" data-hotel="hostal-sol" async></script>
```

- `public/embed.js` (JS sin dependencias) pone el **buscador** (iframe `/embed/search`: fechas con precios medios y personas) en el `div`, y un botón flotante que abre el **asistente** (iframe `/embed/assistant`, el mismo `AgentChat` en modo `embedded`).
- Al pulsar «Buscar», el huésped pasa a la ficha del hotel en el motor (`/web/hotel/<id>?checkIn=&checkOut=&guests=&hotel=<slug>`). El pago y la reserva se hacen siempre en el dominio del motor.
- Los iframes hablan con la página del hotel por `postMessage` (`melendos:height`, `melendos:navigate`, `melendos:close`). El script solo acepta mensajes de su propio origen y solo navega a URLs de ese origen.
- Opciones: `data-search="false"`, `data-assistant="false"`, `data-color` y `data-label`.
- Página de ejemplo para demos de venta: `/ejemplo-web?hotel=<slug>`, una web «de otra agencia» con el widget pegado.

## Quién la cambia

- Solo dirección, desde el panel en **Admin → Web y dominio**, con `save_hotel_web()`. La función valida el formato (color `#RRGGBB`, URLs http(s), longitudes y dominio) y comprueba que el dominio no lo use otro hotel. Cada cambio queda en `audit_log`.
- La escritura directa sobre `tenants` está cerrada para `anon` y `authenticated`. Antes, la política `tenants_admin_update` dejaba a dirección cambiar su plan o sus paquetes contratados.

## Conectar el dominio propio

Hay que crear en el DNS del hotel un registro `CNAME` con el nombre `reservas` y el valor `VITE_PLATFORM_CNAME`. El panel muestra el registro exacto y lo comprueba con DNS público (Cloudflare DNS over HTTPS, desde el navegador). El certificado HTTPS lo emite el alojamiento del frontend al añadir el dominio.

## Pendiente para producción

- Publicar el frontend (Vercel o Netlify) con `VITE_PLATFORM_DOMAIN`, el comodín `*.reservas.<dominio>` y `VITE_PLATFORM_CNAME`.
- Dar de alta en el alojamiento cada dominio propio, para su certificado. Se puede automatizar con la API del proveedor cuando haya clientes.
- Los enlaces que envía el servidor (pago, «Mi reserva») usan `PUBLIC_WEB_URL` o el dominio del hotel. Hay que revisarlos cuando el frontend esté publicado.
