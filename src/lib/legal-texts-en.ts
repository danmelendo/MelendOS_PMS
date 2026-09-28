import { hotelPolicies } from "@domain/policies.ts";
import type { HotelLegal, LegalPage, LegalSection } from "./legal-texts";

// English version of the legal pages (same structure and data as the Spanish
// ones in legal-texts.ts). Spanish law applies either way; the Spanish text
// is the reference if the two ever differ.

const PENDING = "(to be completed by the establishment)";
const hour = (h: number) => `${String(h).padStart(2, "0")}:00`;

function holder(d: HotelLegal): string[] {
  return [
    `Owner: ${d.legal_name ?? PENDING}${d.legal_name && d.name !== d.legal_name ? `, trading as “${d.name}”` : ""}.`,
    `Tax ID (NIF): ${d.nif ?? PENDING}.`,
    `Registered address: ${d.address ?? PENDING}.`,
    `Contact: ${[d.email, d.phone].filter(Boolean).join(" · ") || PENDING}.`,
  ];
}

export function legalPageEn(page: LegalPage, d: HotelLegal): LegalSection[] {
  const policies = hotelPolicies({ payment: d.payment, cancellation: d.cancellation });
  const contact = d.email ?? "the establishment's contact email";
  const reference = "These texts are a translation; the Spanish version prevails.";

  if (page === "aviso-legal") {
    return [
      {
        heading: "Website owner",
        paragraphs: [
          "Under Spanish Law 34/2002 on information society services and e-commerce (LSSI), these are the details of the owner of this website:",
          ...holder(d),
        ],
      },
      {
        heading: "Purpose",
        paragraphs: [
          `This website lets you check availability and prices at ${d.name} and book directly with the establishment.`,
          "The website and booking engine run on Melend/OS, the establishment's technology provider, which is not a party to the accommodation contract.",
        ],
      },
      {
        heading: "Intellectual property and use",
        paragraphs: [
          "The texts, photographs and trademarks on this website belong to the establishment or their owners and may not be reproduced without permission.",
          "The establishment tries to keep the information accurate and up to date; the price and terms that apply are those shown when each booking is confirmed.",
        ],
      },
      {
        heading: "Applicable law",
        paragraphs: [
          "This website and the bookings made on it are governed by Spanish law.",
          reference,
        ],
      },
    ];
  }

  if (page === "privacidad") {
    return [
      { heading: "Data controller", paragraphs: holder(d) },
      {
        heading: "What data we process and why",
        paragraphs: [
          "Booking data (name, email, phone, dates and requests) to manage your booking and stay. Legal basis: performance of the contract (art. 6.1.b GDPR).",
          "Guest registration data (identity document, nationality, date of birth, address and, for minors, their relationship to an adult) to meet the legal registration duty and report it to the Spanish Ministry of the Interior. Legal basis: legal obligation (art. 6.1.c GDPR; Royal Decree 933/2021).",
          "Billing data to issue invoices. Legal basis: legal obligation.",
          "Messages you send to reception and, if you leave one, your review of the stay, to assist you and improve the service.",
          "Card payments are handled directly by the payment provider: the establishment never sees or stores your card details.",
          ...(d.assistant
            ? [
                "The booking assistant on this website is an automated program using artificial intelligence. It uses your messages to search availability and manage your booking; it does not take decisions with legal effects on its own: booking or cancelling always needs your confirmation.",
              ]
            : []),
          ...(d.loyalty
            ? [
                "If you join the loyalty club, your stays and points, to give you its benefits. Legal basis: the club terms you accept when joining.",
              ]
            : []),
        ],
      },
      {
        heading: "Who receives it",
        paragraphs: [
          "The Spanish Ministry of the Interior (guest registration) and the Spanish Tax Agency (invoicing), as required by law.",
          "The payment provider, to charge the booking.",
          "The establishment's technology providers, including Melend/OS, which process the data on its behalf as data processors under contract.",
        ],
      },
      {
        heading: "How long we keep it",
        paragraphs: [
          "Booking data, for as long as the relationship lasts and then during the legal claim periods.",
          "Guest registration data, three years, as the law requires.",
          "Billing data, for the periods set by tax and commercial law.",
        ],
      },
      {
        heading: "Your rights",
        paragraphs: [
          `You can ask for access, rectification, erasure, restriction or portability of your data, or object to its processing, by writing to ${contact}.`,
          "If you believe your rights have not been respected, you can complain to the Spanish Data Protection Agency (www.aepd.es).",
          reference,
        ],
      },
    ];
  }

  if (page === "cookies") {
    return [
      {
        heading: "What this website uses",
        paragraphs: [
          "This website only uses technical storage needed for it to work:",
          "Your session, if you sign in to your account.",
          "The access link to your booking, kept in your browser so you can come back to it without searching.",
          "Preferences such as the hotel you are viewing and your language.",
        ],
      },
      {
        heading: "What we do not use",
        paragraphs: [
          "We use no analytics, advertising or third-party tracking cookies. That is why we do not ask for consent: strictly necessary storage is exempt (art. 22.2 LSSI).",
          "You can delete this data from your browser settings; if you do, you will need to open your booking again with the link in your email.",
          reference,
        ],
      },
    ];
  }

  const pay: string[] = [];
  if (policies.paymentModes.includes("prepay"))
    pay.push(
      "Online payment: the full amount is paid when booking, by card, on the payment provider's secure page.",
    );
  if (policies.paymentModes.includes("at_hotel"))
    pay.push(
      "Pay at the hotel: the booking is confirmed straight away and paid at the establishment.",
    );
  const h = policies.freeCancellationHours;
  const late =
    policies.penalty === "none"
      ? "is free of charge"
      : policies.penalty === "full"
        ? "costs the full amount of the booking"
        : "costs the price of the first night";
  return [
    {
      heading: "Prices",
      paragraphs: [
        "Prices are per stay, by the night, and include taxes. Extras (breakfast, parking…) are shown separately before you confirm.",
        "Promo codes apply to the room price, not to extras, one per booking and while valid.",
      ],
    },
    { heading: "Payment", paragraphs: pay },
    {
      heading: "Cancellation",
      paragraphs: [
        h > 0
          ? `You can cancel for free up to ${h >= 48 && h % 24 === 0 ? `${h / 24} days (${h} hours)` : `${h} hours`} before the check-in time. After that, cancelling ${late}.`
          : `This rate has no free cancellation: cancelling ${late}.`,
        "Not showing up without cancelling counts as a late cancellation.",
        "The terms that apply are those shown when you confirm the booking: they are kept with it even if the establishment changes them later.",
        "You can cancel from your booking link, in “My booking” or by writing to the establishment. If you paid online, any refund due goes back to the same card.",
        "As an accommodation service for specific dates, the 14-day right of withdrawal does not apply (art. 103.l of the Spanish consumer protection law).",
      ],
    },
    {
      heading: "Arrival and departure",
      paragraphs: [
        `Check-in from ${hour(d.checkin_hour)} and check-out by ${hour(d.checkout_hour)}.`,
        "By law, every guest must show an identity document on arrival. You can send your details in advance with the online check-in from your booking link.",
      ],
    },
    {
      heading: "Changes and contact",
      paragraphs: [
        `To change dates or terms, write to the establishment (${contact}) or use the chat of your booking.`,
        ...holder(d),
        reference,
      ],
    },
  ];
}
