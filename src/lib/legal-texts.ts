import { hotelPolicies } from "@domain/policies.ts";

// Legal pages of the hotel's booking web, built from what the hotel already
// has in Melend/OS (fiscal identity from Facturación, booking policies and
// modules). A template: each hotel should have its adviser review it; the
// panel says so, the public pages do not.

export interface HotelLegal {
  name: string;
  legal_name: string | null;
  nif: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  domain: string | null;
  checkin_hour: number;
  checkout_hour: number;
  payment: Record<string, unknown>;
  cancellation: Record<string, unknown>;
  loyalty: boolean;
  assistant: boolean;
}

export const LEGAL_PAGES = {
  "aviso-legal": "Aviso legal",
  privacidad: "Política de privacidad",
  cookies: "Política de cookies",
  condiciones: "Condiciones de reserva",
} as const;
export type LegalPage = keyof typeof LEGAL_PAGES;
export const isLegalPage = (p: string): p is LegalPage => p in LEGAL_PAGES;

export interface LegalSection {
  heading: string;
  paragraphs: string[];
}

const PENDING = "(pendiente de completar por el establecimiento)";
const hour = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** Who runs the website and handles the data. */
function holder(d: HotelLegal): string[] {
  return [
    `Titular: ${d.legal_name ?? PENDING}${d.legal_name && d.name !== d.legal_name ? `, que opera como «${d.name}»` : ""}.`,
    `NIF: ${d.nif ?? PENDING}.`,
    `Domicilio: ${d.address ?? PENDING}.`,
    `Contacto: ${[d.email, d.phone].filter(Boolean).join(" · ") || PENDING}.`,
  ];
}

export function legalPage(page: LegalPage, d: HotelLegal): LegalSection[] {
  const policies = hotelPolicies({ payment: d.payment, cancellation: d.cancellation });
  const contact = d.email ?? "el email de contacto del establecimiento";

  if (page === "aviso-legal") {
    return [
      {
        heading: "Titular de la web",
        paragraphs: [
          "En cumplimiento de la Ley 34/2002, de servicios de la sociedad de la información y de comercio electrónico (LSSI), se informa de los datos del titular de esta web:",
          ...holder(d),
        ],
      },
      {
        heading: "Objeto",
        paragraphs: [
          `Esta web permite consultar la disponibilidad y los precios de ${d.name} y reservar directamente con el establecimiento.`,
          "La web y el motor de reservas funcionan con Melend/OS, proveedor tecnológico del establecimiento, que no es parte del contrato de alojamiento.",
        ],
      },
      {
        heading: "Propiedad intelectual y uso",
        paragraphs: [
          "Los textos, fotografías y marcas de esta web pertenecen al establecimiento o a sus titulares. No se permite reproducirlos sin autorización.",
          "El establecimiento procura que la información sea exacta y esté actualizada; el precio y las condiciones que valen son los que se muestran al confirmar cada reserva.",
        ],
      },
      {
        heading: "Legislación",
        paragraphs: [
          "Esta web y las reservas hechas en ella se rigen por la legislación española.",
        ],
      },
    ];
  }

  if (page === "privacidad") {
    return [
      { heading: "Responsable del tratamiento", paragraphs: holder(d) },
      {
        heading: "Qué datos tratamos y para qué",
        paragraphs: [
          "Datos de la reserva (nombre, email, teléfono, fechas y peticiones) para gestionar tu reserva y tu estancia. Base legal: la ejecución del contrato (art. 6.1.b del RGPD).",
          "Datos del registro de viajeros (documento de identidad, nacionalidad, fecha de nacimiento, domicilio y, en los menores, el parentesco) para cumplir la obligación de registro y comunicarlos al Ministerio del Interior. Base legal: obligación legal (art. 6.1.c del RGPD; Real Decreto 933/2021).",
          "Datos de facturación para emitir las facturas. Base legal: obligación legal.",
          "Los mensajes que envíes a recepción y, si la dejas, tu reseña de la estancia, para atenderte y mejorar el servicio.",
          "El pago con tarjeta lo gestiona directamente la entidad de pago: el establecimiento no ve ni guarda los datos de tu tarjeta.",
          ...(d.assistant
            ? [
                "El asistente de reservas de esta web es un programa automático con inteligencia artificial. Usa tus mensajes para buscar disponibilidad y gestionar tu reserva; no toma decisiones con efectos jurídicos por sí mismo: reservar o cancelar requiere siempre tu confirmación.",
              ]
            : []),
          ...(d.loyalty
            ? [
                "Si te unes al club de fidelización, tus estancias y puntos para darte sus ventajas. Base legal: las condiciones del club que aceptas al unirte.",
              ]
            : []),
        ],
      },
      {
        heading: "A quién se comunican",
        paragraphs: [
          "Al Ministerio del Interior (registro de viajeros) y a la Agencia Tributaria (facturación), por obligación legal.",
          "A la entidad de pago, para cobrar la reserva.",
          "A los proveedores tecnológicos del establecimiento, entre ellos Melend/OS, que tratan los datos por cuenta del establecimiento como encargados del tratamiento y con contrato.",
        ],
      },
      {
        heading: "Cuánto tiempo los guardamos",
        paragraphs: [
          "Los datos de la reserva, mientras dure la relación y, después, durante los plazos legales de reclamación.",
          "Los del registro de viajeros, tres años, como exige la normativa.",
          "Los de facturación, durante los plazos que fija la normativa fiscal y mercantil.",
        ],
      },
      {
        heading: "Tus derechos",
        paragraphs: [
          `Puedes pedir el acceso, la rectificación, la supresión, la limitación, la portabilidad de tus datos u oponerte a su tratamiento escribiendo a ${contact}.`,
          "Si crees que no se han respetado tus derechos, puedes reclamar ante la Agencia Española de Protección de Datos (www.aepd.es).",
        ],
      },
    ];
  }

  if (page === "cookies") {
    return [
      {
        heading: "Qué usa esta web",
        paragraphs: [
          "Esta web solo usa almacenamiento técnico, necesario para que funcione:",
          "La sesión, si entras con tu cuenta.",
          "El enlace de acceso a tu reserva, guardado en tu navegador para que puedas volver a ella sin buscarla.",
          "Preferencias como el hotel que estás viendo.",
        ],
      },
      {
        heading: "Lo que no usamos",
        paragraphs: [
          "No usamos cookies de analítica, publicidad ni seguimiento de terceros. Por eso no te pedimos consentimiento: el almacenamiento estrictamente necesario está exento (art. 22.2 de la LSSI).",
          "Puedes borrar estos datos desde la configuración de tu navegador; si lo haces, tendrás que volver a abrir tu reserva con el enlace del email.",
        ],
      },
    ];
  }

  // Booking conditions.
  const pay: string[] = [];
  if (policies.paymentModes.includes("prepay"))
    pay.push(
      "Pago online: se paga el importe total al reservar, con tarjeta, en la pasarela segura de la entidad de pago.",
    );
  if (policies.paymentModes.includes("at_hotel"))
    pay.push(
      "Pago en el hotel: la reserva queda confirmada al momento y se paga en el establecimiento.",
    );
  const h = policies.freeCancellationHours;
  const late =
    policies.penalty === "none"
      ? "no tiene gastos"
      : policies.penalty === "full"
        ? "tiene un coste del importe total de la reserva"
        : "tiene un coste del importe de la primera noche";
  return [
    {
      heading: "Precios",
      paragraphs: [
        "Los precios son por estancia, por noches, y llevan los impuestos incluidos. Los extras (desayuno, aparcamiento…) se indican aparte antes de confirmar.",
        "Los códigos promocionales se aplican al precio de la habitación, no a los extras, uno por reserva y mientras estén vigentes.",
      ],
    },
    { heading: "Pago", paragraphs: pay },
    {
      heading: "Cancelación",
      paragraphs: [
        h > 0
          ? `Puedes cancelar gratis hasta ${h >= 48 && h % 24 === 0 ? `${h / 24} días (${h} horas)` : `${h} horas`} antes de la hora de llegada. Después, la cancelación ${late}.`
          : `Esta tarifa no tiene cancelación gratuita: cancelar ${late}.`,
        "No presentarse sin cancelar se trata como una cancelación fuera de plazo.",
        "Las condiciones que valen son las que se muestran al confirmar la reserva: se guardan con ella aunque el establecimiento las cambie después.",
        "Puedes cancelar desde el enlace de tu reserva, en «Mi reserva» o escribiendo al establecimiento. Si pagaste online, la devolución que corresponda se hace en la misma tarjeta.",
        "Al tratarse de un servicio de alojamiento para unas fechas concretas, no se aplica el derecho de desistimiento de 14 días (art. 103.l del texto refundido de la Ley General para la Defensa de los Consumidores y Usuarios).",
      ],
    },
    {
      heading: "Llegada y salida",
      paragraphs: [
        `Entrada a partir de las ${hour(d.checkin_hour)} y salida hasta las ${hour(d.checkout_hour)}.`,
        "Por ley, todos los huéspedes deben identificarse con su documento a la llegada. Puedes adelantar los datos con el check-in online desde el enlace de tu reserva.",
      ],
    },
    {
      heading: "Cambios y contacto",
      paragraphs: [
        `Para cambiar fechas o condiciones, escribe al establecimiento (${contact}) o usa el chat de tu reserva.`,
        ...holder(d),
      ],
    },
  ];
}
