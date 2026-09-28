// Questions answered on the pages. Also published as FAQ structured data
// (src/seo.ts), so every answer here must be visible on its page.

export interface Faq {
  q: string;
  a: string;
}

export const PRICING_FAQ: Faq[] = [
  {
    q: "¿Qué cuenta como habitación?",
    a: "Cada habitación que se puede reservar y está activa. Las que das de baja por obras o temporada no cuentan ese mes.",
  },
  {
    q: "¿Cobráis comisión por reserva?",
    a: "No. Ni en la web, ni en la app, ni en el asistente. Solo pagas la cuota; la pasarela de pago cobra sus propias tarifas, que contratas tú.",
  },
  {
    q: "¿Qué pasa si me quiero ir?",
    a: "Con pago mensual no hay permanencia: te das de baja desde el mes siguiente y te llevas todos tus datos en formatos abiertos. El pago anual se abona por adelantado y no se devuelve.",
  },
  {
    q: "¿Necesito un SLA?",
    a: "Todos los planes tienen soporte por chat y email en horario laboral. Si tu hotel no puede esperar a que respondamos, contrata el nivel de urgencia que necesites; puedes subirlo o bajarlo cada mes.",
  },
  {
    q: "¿Y si no cumplís el SLA contratado?",
    a: "Te descontamos automáticamente de la siguiente factura el porcentaje que corresponda. Publicamos la disponibilidad de cada mes.",
  },
  {
    q: "¿Qué modelo de IA usa el asistente?",
    a: "El que mejor encaje con tu hotel y tu presupuesto; el sistema no depende de un proveedor. Tus datos no se usan para entrenar modelos de terceros.",
  },
  {
    q: "¿Puedo cambiar de plan?",
    a: "Sí, cuando quieras. Subir es inmediato y se prorratea; bajar se aplica desde el mes siguiente.",
  },
];

export const COMPLIANCE_FAQ: Faq[] = [
  {
    q: "¿Desde cuándo es obligatorio SES.HOSPEDAJES?",
    a: "Desde el 2 de diciembre de 2024 (Real Decreto 933/2021). Hoteles, hostales, pensiones, apartamentos turísticos y campings deben comunicar al Ministerio del Interior los datos de los viajeros, como tarde 24 horas después de su llegada, y los de las reservas.",
  },
  {
    q: "¿Cuándo tengo que facturar con VeriFactu?",
    a: "El 1 de enero de 2027 si tu negocio es una sociedad, y el 1 de julio de 2027 si eres autónomo, tras el aplazamiento del Real Decreto-ley 15/2025. Desde entonces, el programa con el que facturas tiene que registrar cada factura de forma encadenada e incluir un código QR.",
  },
  {
    q: "¿Cuánto cuesta cumplir con Melend/OS?",
    a: "Nada aparte: el registro de viajeros, la comunicación a SES.HOSPEDAJES y la facturación VeriFactu están incluidos en todos los planes. En la demo te enseñamos cómo se envía cada parte y cada factura.",
  },
];
