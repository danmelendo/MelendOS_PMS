// English for the guest-facing texts (see i18n.ts). Key: the Spanish text
// exactly as it appears in the code; value: the English. {name} placeholders
// must appear in both.
export const EN: Record<string, string> = {
  // ── Shared labels (lib/stays) ──
  Habitación: "Room",
  Suite: "Suite",
  "Habitación familiar": "Family room",
  Familiar: "Family",
  "Vistas al mar": "Sea view",
  "Vistas a la ciudad": "City view",
  "Vistas al jardín": "Garden view",
  Balcón: "Balcony",
  "Terraza privada": "Private terrace",
  Bañera: "Bathtub",
  Minibar: "Minibar",
  "Sofá cama": "Sofa bed",
  "Aire acondicionado": "Air conditioning",
  Wifi: "Wi-Fi",
  Parking: "Parking",
  Spa: "Spa",
  Bar: "Bar",
  Gimnasio: "Gym",
  Piscina: "Pool",
  Rooftop: "Rooftop",
  Restaurante: "Restaurant",
  "Acceso a playa": "Beach access",
  "Pet friendly": "Pet friendly",
  Prereserva: "Held",
  Confirmada: "Confirmed",
  "En curso": "In progress",
  Completada: "Completed",
  Cancelada: "Cancelled",
  Expirada: "Expired",
  "se paga en el hotel": "pay at the hotel",
  "pagado online": "paid online",
  "pago online pendiente": "online payment pending",
  noche: "night",
  noches: "nights",
  persona: "guest",
  personas: "guests",
  huésped: "guest",
  huéspedes: "guests",

  // ── Layout ──
  Inicio: "Home",
  Habitaciones: "Rooms",
  "Mi reserva": "My booking",
  "Web del hotel": "Hotel website",
  "Panel de gestión": "Management panel",
  "Reservas con Melend/OS": "Bookings by Melend/OS",
  "Aviso legal": "Legal notice",
  "Política de privacidad": "Privacy policy",
  "Política de cookies": "Cookie policy",
  "Condiciones de reserva": "Booking conditions",
  Idioma: "Language",

  // ── Home ──
  "Ver habitaciones y precios": "See rooms and prices",
  "Gestionar mi reserva": "Manage my booking",
  "Sobre nosotros": "About us",
  "Nuestros hoteles": "Our hotels",
  "El hotel": "The hotel",
  "Ver habitaciones": "See rooms",
  desde: "from",
  "Dónde estamos": "Where we are",
  "Cómo llegar": "Directions",

  // ── Hotels ──
  "Hoteles y habitaciones": "Hotels and rooms",
  "Elige hotel para ver sus habitaciones y precios para tus fechas.":
    "Choose a hotel to see its rooms and prices for your dates.",
  Todas: "All",
  "Cargando…": "Loading…",
  "según fechas": "depending on dates",

  // ── Hotel page ──
  Fechas: "Dates",
  "Precio total para tus fechas, impuestos incluidos.":
    "Total price for your dates, taxes included.",
  "Código {code} aplicado: se descuenta de la habitación al confirmar la reserva.":
    "Code {code} applied: it is taken off the room price when you confirm the booking.",
  "No disponible": "Not available",
  "Habitación {name}": "Room {name}",
  Hasta: "Up to",
  Ver: "View",
  "No hay habitaciones para los filtros seleccionados.": "No rooms match the selected filters.",
  "Opiniones de huéspedes": "Guest reviews",
  "Ver más opiniones": "See more reviews",
  Suites: "Suites",
  Familiares: "Family",

  // ── Offers ──
  "Habitaciones en oferta": "Rooms on offer",
  "Rebajas por fechas y códigos del hotel.": "Date deals and the hotel's promo codes.",
  "Ahora no hay ofertas. En el calendario de fechas verás el precio de cada noche.":
    "No offers right now. The date calendar shows the price of each night.",
  "Noches del {from} al {to}": "Nights from {from} to {to}",
  "Completo en esas fechas.": "Fully booked on those dates.",
  "Ver todas las habitaciones en esas fechas": "See all rooms on those dates",
  "Descuento en tu habitación": "Discount on your room",
  "En todas las habitaciones": "On every room",
  "reservando hasta el {date}": "booking until {date}",
  "Copiar el código": "Copy the code",
  "Código aplicado": "Code applied",
  "Usar este código": "Use this code",
  "Se descuenta de la habitación al confirmar la reserva; los extras no llevan descuento.":
    "Taken off the room price when you confirm; extras are not discounted.",

  // ── Dates ──
  "Elige tus fechas": "Choose your dates",
  "Salida el {date}": "Check-out {date}",
  "Ahora elige la fecha de salida": "Now choose your check-out date",
  "Elige la fecha de entrada": "Choose your check-in date",
  "Precio medio por noche · «–» completo": "Average price per night · “–” fully booked",
  "según fechas y ocupación": "depending on dates and occupancy",

  // ── Room ──
  Características: "Features",
  "Sobre el hotel": "About the hotel",
  Total: "Total",
  "La salida debe ser posterior a la entrada.": "Check-out must be after check-in.",
  "No disponible para estas fechas": "Not available for these dates",
  Reservar: "Book",
  "Paga online o en el hotel · cancelación gratuita según la política del hotel":
    "Pay online or at the hotel · free cancellation under the hotel's policy",

  // ── Room ──
  "Ver más sobre {name}": "More about {name}",

  // ── Booking form ──
  "Hotel no disponible": "Hotel not available",
  "Habitación no disponible": "Room not available",
  "Reserva confirmada · pagas en el hotel": "Booking confirmed · you pay at the hotel",
  "No se pudo crear la reserva": "The booking could not be made",
  "Confirma tu reserva": "Confirm your booking",
  Entrada: "Check-in",
  Salida: "Check-out",
  Noches: "Nights",
  Huéspedes: "Guests",
  "Datos del huésped": "Guest details",
  "Nombre y apellidos": "Full name",
  Email: "Email",
  "Teléfono (opcional)": "Phone (optional)",
  "Te enviaremos la confirmación y el enlace para gestionar la reserva.":
    "We will send you the confirmation and the link to manage your booking.",
  "¿Tienes un código promocional?": "Have a promo code?",
  "−{amount} en la habitación": "−{amount} on the room",
  Quitar: "Remove",
  CÓDIGO: "CODE",
  Aplicar: "Apply",
  "Código no válido o caducado": "Invalid or expired code",
  "Los extras no llevan descuento.": "Extras are not discounted.",
  "Cancelar y volver al inicio": "Cancel and go back home",
  "El código promocional no es válido o ha caducado": "The promo code is invalid or has expired",
  "El código promocional ya no es válido": "The promo code is no longer valid",
  "La habitación no está libre en esas fechas": "The room is not free on those dates",
  "La habitación acaba de ocuparse": "The room has just been taken",

  // ── Payment ──
  "Total estancia": "Total stay",
  "¿Cómo quieres pagar?": "How would you like to pay?",
  "Pagar ahora online ({amount})": "Pay online now ({amount})",
  "Pagar en el hotel": "Pay at the hotel",
  "Pago seguro con tarjeta; la reserva se confirma al pagar.":
    "Secure card payment; the booking is confirmed when you pay.",
  "Reserva confirmada ya; pagas al llegar.": "Booking confirmed now; you pay on arrival.",
  "Cancelación gratuita hasta el {date}.": "Free cancellation until {date}.",
  "Después, se cobra la estancia completa.": "After that, the whole stay is charged.",
  "Después, se cobra la primera noche.": "After that, the first night is charged.",
  "Reservar y pagar {amount}": "Book and pay {amount}",
  "Confirmar reserva": "Confirm booking",

  // ── Checkout ──
  "No se pudo iniciar el pago": "The payment could not be started",
  "Confirmar y pagar": "Confirm and pay",
  "A pagar ahora": "To pay now",
  "Pago seguro en el entorno de pruebas de Redsys. Tarjeta de prueba: 4548 8120 4940 0004, caducidad 12/49, CVV 123.":
    "Secure payment in the Redsys test environment. Test card: 4548 8120 4940 0004, expiry 12/49, CVV 123.",
  "Pago seguro con la pasarela del hotel.": "Secure payment through the hotel's payment gateway.",
  "El pago no se ha completado. Puedes intentarlo de nuevo.":
    "The payment was not completed. You can try again.",
  "Confirmando el pago con el banco…": "Confirming the payment with the bank…",
  "Reserva confirmada · hacer el check-in online": "Booking confirmed · do the online check-in",
  "Redirigiendo al pago…": "Redirecting to payment…",
  "Pagar {amount}": "Pay {amount}",

  // ── Missing booking ──
  "No encontramos esta reserva": "We cannot find this booking",
  "El enlace no es válido en este dispositivo o ha caducado. Ábrelo desde el correo o el mensaje que te enviamos, o escríbenos con tu referencia de reserva.":
    "The link is not valid on this device or has expired. Open it from the email or message we sent you, or write to us with your booking reference.",
  "Volver al inicio": "Back to home",

  // ── Booking page ──
  "Detalle de reserva": "Booking details",
  "Check-in online": "Online check-in",
  Firmado: "Signed",
  "Hacer check-in": "Check in",
  Pendiente: "Pending",
  "Hablar con recepción": "Talk to reception",
  "Historial de la reserva": "Booking history",
  "Sin eventos todavía.": "No events yet.",
  "Reserva creada": "Booking created",
  "Prereserva creada": "Hold created",
  "Volver a la habitación": "Back to the room",
  "Habitación reservada para ti · tu sesión caduca en {time}":
    "Room held for you · your session expires in {time}",
  "Tu sesión va a caducar · quedan {time} para completar el pago":
    "Your session is about to expire · {time} left to complete the payment",
  "Tu sesión va a caducar en {n} minutos. Completa el pago o tendrás que volver a reservar.":
    "Your session expires in {n} minutes. Complete the payment or you will have to book again.",
  "Tu sesión va a caducar en 1 minuto. Completa el pago o tendrás que volver a reservar.":
    "Your session expires in 1 minute. Complete the payment or you will have to book again.",
  "Tu sesión de reserva ha caducado. Vuelve a reservar: si la habitación sigue libre, será tuya.":
    "Your booking session has expired. Book again: if the room is still free, it is yours.",
  "La reserva de la habitación ha caducado. Vuelve a reservar.":
    "Your room hold has expired. Please book again.",
  "Check-out realizado": "Checked out",
  "Pago no completado": "Payment not completed",
  "No presentado": "No-show",
  "Reserva confirmada": "Booking confirmed",
  "Registro de viajeros firmado": "Guest registration signed",
  "Check-in realizado": "Checked in",
  "Reserva cancelada": "Booking cancelled",
  "Puntos acreditados": "Points credited",
  "Recompensa canjeada": "Reward redeemed",

  // ── Cancellation ──
  "¿Por qué cancelas? (opcional)": "Why are you cancelling? (optional)",
  "Prefiero no decirlo": "I'd rather not say",
  "Cambio de planes": "Change of plans",
  "Enfermedad o motivo personal": "Illness or personal reasons",
  "Motivos de trabajo": "Work reasons",
  "Problemas con el viaje o el transporte": "Travel or transport problems",
  "Encontró otro alojamiento o mejor precio": "Found other accommodation or a better price",
  "Error al reservar o reserva duplicada": "Booking mistake or duplicate booking",
  "Meteorología o fuerza mayor": "Weather or force majeure",
  Otro: "Other",
  "Te devolveremos {amount} en la misma tarjeta.": "We will refund {amount} to the same card.",
  "No se pudo cancelar": "The booking could not be cancelled",
  "Solicitud enviada": "Request sent",
  "El hotel te responderá en breve.": "The hotel will reply shortly.",
  "No se pudo enviar la solicitud": "The request could not be sent",
  Cancelación: "Cancellation",
  "Gratis hasta el {date}.": "Free until {date}.",
  "El plazo gratuito terminó el {date}.": "Free cancellation ended on {date}.",
  "Después, el hotel cobra {amount}.": "After that, the hotel charges {amount}.",
  "¿Cancelar la reserva? No se puede deshacer.": "Cancel the booking? This cannot be undone.",
  "Sí, cancelar": "Yes, cancel",
  Volver: "Back",
  "Cancelar gratis": "Cancel for free",
  "Solicitud enviada: el hotel te responderá en breve.":
    "Request sent: the hotel will reply shortly.",
  "Enviar la solicitud": "Send the request",
  "Solicitar la cancelación al hotel": "Ask the hotel to cancel",

  // ── My booking ──
  "Consulta tu reserva, haz el check-in online, habla con recepción o pide lo que necesites.":
    "See your booking, check in online, talk to reception or ask for what you need.",
  "No encontramos una reserva con esa referencia y ese email.":
    "We cannot find a booking with that reference and email.",
  "Buscar mi reserva": "Find my booking",
  "Sin cuenta: con la referencia de 8 caracteres de tu confirmación y el email con el que reservaste.":
    "No account needed: use the 8-character reference in your confirmation and the email you booked with.",
  Referencia: "Reference",
  "Ej. {ref}": "E.g. {ref}",
  "Buscando…": "Searching…",
  "Ver mi reserva": "See my booking",
  "Entrar con mi cuenta": "Sign in to my account",
  "Todas tus estancias en el hotel en un solo sitio.": "All your stays at the hotel in one place.",
  "Hola, {name}": "Hello, {name}",
  Salir: "Sign out",
  "{n} puntos": "{n} points",
  "Próximas y en curso": "Upcoming and current",
  "No tienes reservas próximas.": "You have no upcoming bookings.",
  Anteriores: "Past",
  "Reservar otra estancia": "Book another stay",
  "Entrando…": "Signing in…",
  Entrar: "Sign in",
  "Escribe primero tu email": "Type your email first",

  // ── Assistant ──
  "Menos {x}": "Fewer {x}",
  "Más {x}": "More {x}",
  Personas: "Guests",
  "Busca disponibilidad del {from} al {to} para {people}.":
    "Check availability from {from} to {to} for {people}.",
  Buscar: "Search",
  "Elijo la habitación {room}{type} del {from} al {to} para {people}.":
    "I choose room {room}{type} from {from} to {to} for {people}.",
  Elegir: "Choose",
  "Quiero añadir estos extras: {list}.": "I would like to add these extras: {list}.",
  "Añadir a mi reserva": "Add to my booking",
  "¡Hola! Soy el asistente de reservas. Dime fechas y cuántas personas sois y te digo qué habitaciones hay libres y a qué precio.":
    "Hi! I am the booking assistant. Tell me your dates and how many of you there are, and I will tell you which rooms are free and at what price.",
  "No he podido responder ahora mismo. Inténtalo de nuevo en un momento.":
    "I could not answer right now. Please try again in a moment.",
  "¿Te ayudo a reservar?": "Can I help you book?",
  "Asistente de reservas": "Booking assistant",
  "Precios y disponibilidad en tiempo real": "Live prices and availability",
  Cerrar: "Close",
  "Escribiendo…": "Typing…",
  "Ej. 2 personas del 20 al 23 de noviembre": "E.g. 2 guests from 20 to 23 November",
  "Mensaje para el asistente": "Message to the assistant",
  Enviar: "Send",

  // ── Assistant ──
  "Pagar la reserva": "Pay for the booking",

  // ── Widget ──
  "El asistente de reservas no está disponible en este hotel.":
    "The booking assistant is not available at this hotel.",

  // ── Reviews ──
  "Todavía no hay valoraciones.": "No reviews yet.",
  "{n} valoraciones de estancias verificadas": "{n} reviews from verified stays",
  Limpieza: "Cleanliness",
  Personal: "Staff",
  Ubicación: "Location",
  Confort: "Comfort",
  "Calidad-precio": "Value for money",
  "Respuesta de {hotel}": "Reply from {hotel}",
  "Respuesta del hotel": "Reply from the hotel",
  "{n} de 5": "{n} out of 5",
  "Tu valoración": "Your review",
  "¿Qué tal tu estancia?": "How was your stay?",
  "Tu opinión se publica en la web del hotel con tu nombre y la inicial del apellido.":
    "Your review is published on the hotel's website with your first name and the initial of your surname.",
  "Nota general": "Overall rating",
  "Cuéntanos qué te gustó y qué mejorarías (opcional)":
    "Tell us what you liked and what could be better (optional)",
  "¡Gracias por tu valoración!": "Thank you for your review!",
  "Enviando…": "Sending…",
  "Publicar valoración": "Publish review",

  // ── Chat ──
  Asistente: "Assistant",
  Recepción: "Reception",
  leído: "read",
  "No encontramos esta reserva.": "We cannot find this booking.",
  Hola: "Hello",
  "Escríbenos lo que necesites o usa una petición rápida. Recepción te responde aquí mismo, las 24 horas.":
    "Tell us what you need or use a quick request. Reception answers right here, 24 hours a day.",
  Toallas: "Towels",
  "¿Podrían subirme toallas limpias, por favor?": "Could you bring me clean towels, please?",
  "¿Pueden hacer la habitación hoy?": "Could you clean the room today?",
  "Room service": "Room service",
  "Quisiera pedir room service.": "I would like to order room service.",
  "Algo no funciona": "Something is not working",
  "Hay algo en la habitación que no funciona:": "Something in the room is not working:",
  "Mi coche": "My car",
  "¿Podrían traerme el coche a la entrada?": "Could you bring my car to the entrance?",
  "Early check-in": "Early check-in",
  "Me gustaría hacer early check-in.": "I would like an early check-in.",
  "Late checkout": "Late checkout",
  "Me gustaría hacer late checkout.": "I would like a late checkout.",
  "Escribe a recepción…": "Write to reception…",
  "Mensaje para recepción": "Message to reception",
  "La conversación de esta reserva está cerrada.": "The conversation for this booking is closed.",
  "Volver a la reserva": "Back to the booking",

  // ── Chat ──
  "Limpieza de habitación": "Housekeeping",

  // ── Stay account ──
  "Comida y bebida": "Food and drink",
  Catering: "Catering",
  Lavandería: "Laundry",
  Otros: "Other",
  "Tu cuenta": "Your bill",
  Reserva: "Booking",
  "pendiente de confirmar": "awaiting confirmation",
  Pagado: "Paid",
  "Ampliación hasta el {date} ({amount}) pendiente de confirmar por recepción.":
    "Extension until {date} ({amount}) awaiting confirmation by reception.",
  "Estancia ampliada hasta el {date}.": "Stay extended until {date}.",
  "Pedir un servicio": "Order a service",
  "Ampliar estancia": "Extend my stay",
  "Abriendo el pago…": "Opening the payment…",
  "Pagar pendiente ({amount})": "Pay the balance ({amount})",
  "Pedido enviado": "Order sent",
  "Recepción lo confirmará en el chat.": "Reception will confirm it in the chat.",
  Pedir: "Order",
  "Este hotel no ofrece servicios durante la estancia.":
    "This hotel does not offer services during the stay.",
  "Nueva fecha de salida": "New check-out date",
  "Calculamos el precio de las noches extra en tu misma habitación. Recepción te lo confirma en el chat.":
    "We work out the price of the extra nights in your same room. Reception confirms it in the chat.",
  "Ampliación solicitada": "Extension requested",
  "{n} {nights} más por {amount}.": "{n} more {nights} for {amount}.",
  "Consultando…": "Checking…",
  "Solicitar ampliación": "Request extension",
  Facturas: "Invoices",
  anulada: "cancelled",
  "Ver y descargar": "View and download",

  // ── Invoices ──
  Factura: "Invoice",
  "Factura simplificada": "Simplified invoice",
  "Factura en sustitución de simplificadas": "Invoice replacing simplified ones",
  "Factura rectificativa": "Corrective invoice",
  "Factura rectificativa de simplificada": "Corrective simplified invoice",

  // ── Check-in ──
  "DNI / NIF": "Spanish ID (DNI / NIF)",
  NIE: "NIE (foreigner ID)",
  Pasaporte: "Passport",
  "Otro documento": "Other document",
  Hombre: "Male",
  Mujer: "Female",
  "Padre o madre": "Parent",
  "Tutor/a": "Guardian",
  "Abuelo/a": "Grandparent",
  "Bisabuelo/a": "Great-grandparent",
  "Hermano/a": "Sibling",
  "Tío/a": "Uncle / aunt",
  "Cuñado/a": "Brother / sister-in-law",
  "Suegro/a": "Parent-in-law",
  Cónyuge: "Spouse",
  "Hijo/a": "Child",
  "Nieto/a": "Grandchild",
  "Bisnieto/a": "Great-grandchild",
  "Sobrino/a": "Nephew / niece",
  "Yerno o nuera": "Son / daughter-in-law",
  "Corregir viajero": "Correct guest",
  "Nuevo viajero": "New guest",
  "Titular de la reserva": "Booking holder",
  Nombre: "First name",
  "Primer apellido": "Surname",
  "Segundo apellido": "Second surname",
  "Fecha de nacimiento": "Date of birth",
  Sexo: "Sex",
  Nacionalidad: "Nationality",
  "Parentesco con un adulto del grupo": "Relationship to an adult in the party",
  "Documento (opcional)": "Document (optional)",
  Documento: "Document",
  Número: "Number",
  "Nº de soporte": "Support number",
  "País de residencia": "Country of residence",
  "Municipio (código INE)": "Municipality (INE code)",
  Ciudad: "City",
  "Código postal": "Postcode",
  Dirección: "Address",
  "Piso, puerta… (opcional)": "Flat, door… (optional)",
  Teléfono: "Phone",
  Cancelar: "Cancel",
  "El código de municipio del INE tiene 5 cifras": "The INE municipality code has 5 digits",
  "Guardando…": "Saving…",
  "Guardar incompleto": "Save incomplete",
  Guardar: "Save",
  "Falta el nombre": "First name missing",
  "Falta el primer apellido": "Surname missing",
  "Nombre o apellidos de más de 50 caracteres": "Name or surnames longer than 50 characters",
  "Falta la fecha de nacimiento": "Date of birth missing",
  "Fecha de nacimiento no válida": "Invalid date of birth",
  "Tipo de documento no válido": "Invalid document type",
  "Falta el tipo de documento": "Document type missing",
  "Falta el número de documento": "Document number missing",
  "Número de documento de más de 15 caracteres": "Document number longer than 15 characters",
  "El DNI no es válido (revisa la letra)": "The DNI is not valid (check the letter)",
  "El NIE no es válido (revisa la letra)": "The NIE is not valid (check the letter)",
  "Con DNI hace falta el segundo apellido": "With a DNI the second surname is required",
  "Falta el número de soporte": "Support number missing",
  "El número de soporte tiene como máximo 9 caracteres":
    "The support number has at most 9 characters",
  "Nacionalidad no válida": "Invalid nationality",
  "Sexo no válido": "Invalid sex",
  "Falta la dirección": "Address missing",
  "Dirección de más de 100 caracteres": "Address longer than 100 characters",
  "Falta el código postal": "Postcode missing",
  "Falta el país de residencia": "Country of residence missing",
  "País no válido": "Invalid country",
  "Falta el código de municipio del INE (5 cifras)": "INE municipality code missing (5 digits)",
  "Falta la ciudad": "City missing",
  "Hace falta un teléfono o un email": "A phone or an email is required",
  "Email no válido": "Invalid email",
  "Teléfono demasiado largo": "Phone too long",
  "Falta el parentesco del menor con un adulto": "The minor's relationship to an adult is missing",
  "Parentesco no válido": "Invalid relationship",
  nombre: "first name",
  "primer apellido": "surname",
  "segundo apellido": "second surname",
  "tipo de documento": "document type",
  "número de documento": "document number",
  "número de soporte": "support number",
  "fecha de nacimiento": "date of birth",
  nacionalidad: "nationality",
  sexo: "sex",
  dirección: "address",
  "código postal": "postcode",
  "país de residencia": "country of residence",
  "municipio (INE)": "municipality (INE)",
  ciudad: "city",
  "teléfono o email": "phone or email",
  email: "email",
  parentesco: "relationship",
  "No se encontró la reserva. Ábrela desde el enlace de tu email de confirmación.":
    "Booking not found. Open it from the link in your confirmation email.",
  "Paso 1 de 2 · Datos de los viajeros · llegada el {date}":
    "Step 1 of 2 · Guest details · arrival {date}",
  "La ley obliga al hotel a registrar a cada huésped y enviar sus datos al Ministerio del Interior (SES.HOSPEDAJES). Rellénalos ahora y en recepción solo te pedirán el documento.":
    "Spanish law requires the hotel to register every guest and send their details to the Ministry of the Interior (SES.HOSPEDAJES). Fill them in now and at reception you will only be asked for your document.",
  "Por seguridad no volvemos a mostrar los datos guardados: si te equivocas, corrige solo lo que haga falta.":
    "For security, saved details are not shown again: if you made a mistake, correct only what is needed.",
  titular: "holder",
  "Sin documento": "No document",
  "Falta: {fields}": "Missing: {fields}",
  Completo: "Complete",
  Corregir: "Correct",
  "Viajero guardado": "Guest saved",
  "Añadir al titular": "Add the booking holder",
  "Añadir otro viajero": "Add another guest",
  "{n} de {people} {travellers} · {complete} completos":
    "{n} of {people} {travellers} · {complete} complete",
  viajero: "guest",
  viajeros: "guests",
  "Continuar a la firma": "Continue to signature",
  "Completa los datos de tu estancia para continuar.": "Complete your details to continue.",
  "Completa los datos de los {n} viajeros para continuar.":
    "Complete the details of the {n} guests to continue.",

  // ── Signature ──
  "Documento firmado · sube tu documentación": "Document signed · upload your documents",
  "No se pudo firmar": "The document could not be signed",
  "Paso 2 de 2 · Registro de viajeros y normas del hotel":
    "Step 2 of 2 · Guest registration and hotel rules",
  "Documento ya firmado por {name}": "Document already signed by {name}",
  Firma: "Signature",
  "Continuar · subir documentación": "Continue · upload documents",
  "Nombre del firmante": "Name of the signer",
  "Confirmo que mis datos son correctos y acepto las normas del hotel.":
    "I confirm my details are correct and I accept the hotel rules.",
  "Firmando…": "Signing…",
  "Firmar y completar check-in": "Sign and complete check-in",
  "Firma aquí con el dedo o el ratón": "Sign here with your finger or mouse",
  Borrar: "Clear",

  // ── Documents ──
  "DNI o Pasaporte (frontal)": "ID card or passport (front)",
  "DNI o Pasaporte (reverso)": "ID card or passport (back)",
  "Documentación enviada correctamente": "Documents sent",
  "Revisaremos tu documentación en las próximas horas.":
    "We will review your documents in the next few hours.",
  "Documento de identidad": "Identity document",
  "¡Documentación recibida!": "Documents received!",
  "Revisaremos tus documentos y confirmaremos tu check-in en las próximas horas.":
    "We will review your documents and confirm your check-in in the next few hours.",
  "Para completar el check-in necesitamos una copia de tu documento de identidad.":
    "To complete check-in we need a copy of your identity document.",
  "Subir archivo": "Upload file",
  "Demo: los archivos se guardan solo en tu navegador y no se envían a ningún servidor.":
    "Demo: files are kept only in your browser and are not sent to any server.",
  "Enviar documentación": "Send documents",
  "Hacerlo más tarde": "Do it later",

  // ── Legal ──
  "Información no disponible.": "Information not available.",

  // ── Invoice page ──
  "Descargar en PDF": "Download as PDF",
  "Factura no encontrada.": "Invoice not found.",

  // ── Assistant (server) ──
  "Todavía no he podido completar la gestión. ¿Me confirmas la habitación, las fechas, tu nombre, tu email y cómo prefieres pagar?":
    "I have not been able to complete it yet. Could you confirm the room, the dates, your name, your email and how you would like to pay?",
  "Solo puedo ayudarte con tu estancia en el hotel: habitaciones, precios, reservas y cancelaciones. ¿Buscas alguna fecha?":
    "I can only help with your stay at the hotel: rooms, prices, bookings and cancellations. Are you looking for particular dates?",
  "Ahora mismo no puedo completar la consulta. Puedes reservar en la web o escribir a recepción.":
    "I cannot complete this right now. You can book on the website or write to reception.",
  "He necesitado demasiados pasos para esta consulta. ¿Me la puedes concretar un poco más?":
    "That took me too many steps. Could you make your request a bit more specific?",
  "El asistente no está disponible en este hotel.": "The assistant is not available at this hotel.",
  "El asistente no está disponible ahora mismo.": "The assistant is not available right now.",
  "No se pudo abrir la conversación": "The conversation could not be opened",
  "Esta conversación es muy larga; empieza una nueva.":
    "This conversation is very long; please start a new one.",
  "El asistente no ha podido responder. Inténtalo de nuevo en un momento.":
    "The assistant could not answer. Please try again in a moment.",

  // ── Signature ──
  "Check-in online completado": "Online check-in completed",
};
