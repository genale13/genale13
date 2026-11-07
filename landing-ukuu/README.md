# Landing UKUU Coaching · ALINEA PRO®

Dos versiones de la landing para captar contactos y agendar la **sesión de exploración gratuita** (45 minutos, Google Meet) con Calendly. HTML estructurado con un CSS neutro, listo para aplicar la máscara de marca.

## Contenido de la carpeta

| Archivo | Para qué sirve |
|---|---|
| `version-a-ads/index.html` | **Versión A · Conversión Google Ads.** Corta y sin menú, con el formulario visible desde el principio. El titular cambia según el grupo de anuncios (`?tema=`). Marcada `noindex`. URL propuesta: `https://www.coaching-ukuu.com/alinea-pro/` |
| `version-b-seo/index.html` | **Versión B · SEO y contenido.** Larga, cubre todos los temas del Keyword Planner y tiene 17 preguntas frecuentes con datos estructurados. URL propuesta: `https://www.coaching-ukuu.com/coaching-profesional-online/` |
| `integraciones/google-apps-script.gs` | Script que guarda cada formulario en Google Sheets y avisa por email. |
| `brief/` | Análisis de palabras clave y plan inicial (documento de trabajo). |

Cada página es un único archivo autónomo: el CSS va en el `<style>` del `<head>` y el JavaScript en los dos `<script>` del final.

## Cómo funciona el recorrido

1. La persona completa el formulario (versión A: 5 campos; versión B: 10 campos).
2. Los datos se envían a Google Sheets y se registra el evento `generate_lead`.
3. En el mismo lugar aparece Calendly, prellenado con nombre, email y respuestas.
4. Al reservar, la página muestra la confirmación y registra `calendly_event_scheduled`.

Si Calendly no carga, aparece un botón «Abrir el calendario» que abre el mismo calendario con los datos ya incluidos.

## 1. Antes de publicar: marcadores pendientes

Busca `{{` en cada archivo. Los marcadores que se ven en la página aparecen resaltados en amarillo.

| Marcador | Dónde | Qué poner |
|---|---|---|
| `{{CALENDLY_URL}}` | Configuración (A y B) | Enlace del evento «Sesión de exploración» (sección 2) |
| `{{URL_APPS_SCRIPT}}` | Configuración (A y B) | URL `/exec` de la aplicación web (sección 3) |
| `{{GTM_ID}}` | Configuración (A y B) | ID del contenedor de Google Tag Manager, por ejemplo `GTM-ABC1234` |
| `{{RESPONSABLE_TRATAMIENTO}}` | Texto legal bajo el formulario | Nombre legal, país e identificación fiscal del responsable |
| `{{EMAIL_PRIVACIDAD}}` | Texto legal bajo el formulario | Email para ejercer los derechos de protección de datos |
| `{{URL_PRIVACIDAD}}`, `{{URL_AVISO_LEGAL}}`, `{{URL_COOKIES}}` | Formulario y pie de página | Páginas legales del sitio |
| `{{URL_IMAGEN_OG}}` | `<head>` | Imagen para compartir en redes (1200 × 630 px) |
| `{{EMAIL_CONTACTO}}`, `{{URL_LINKEDIN}}`, `{{URL_INSTAGRAM}}` | Pie de página (B) | Contacto y redes sociales |
| `{{URL_CONTACTO}}` | «Otros acompañamientos» (B) | Página o enlace de contacto |

Pendiente sin marcador:

- **Foto de Beatriz:** reemplaza el bloque `img-placeholder`; el comentario de al lado tiene el `<img>` listo.
- **Logo:** reemplaza el texto «UKUU Coaching» de la cabecera; hay un comentario con el `<img>`.
- **Testimonios:** reemplaza las tarjetas amarillas por testimonios reales (con permiso) o elimina la sección entera.
- **Número de sesiones de ALINEA PRO®:** comentario `PENDIENTE` en el recuadro «En la práctica».
- **WhatsApp flotante (opcional):** escribe el número en `whatsapp`; si queda vacío, el botón no aparece.
- **«Orientación para jóvenes» y «Coaching ejecutivo» (B):** son textos propuestos; valídalos.
- **Banner de cookies:** ver sección 5.

## 2. Calendly

1. Crea un evento individual **«Sesión de exploración»** de 45 minutos con ubicación Google Meet. Conecta Google Calendar en Calendly para que el enlace de Meet se genere solo.
2. En «Preguntas para el invitado», después de nombre y email, crea estas preguntas **en este orden**. Usa preguntas de texto («Una línea» o «Varias líneas»): el prellenado no funciona bien con opciones múltiples si el texto no coincide exactamente.

| Orden | Pregunta en Calendly | Se rellena con |
|---|---|---|
| a1 | WhatsApp (con prefijo de país) | WhatsApp |
| a2 | ¿Qué es lo que más te describe hoy? | Situación elegida en el formulario |
| a3 | ¿Estás en disposición de comprometerte con un proceso estructurado en los próximos meses? | Respuesta de compromiso |
| a4 | ¿Qué te gustaría conseguir? *(opcional)* | Objetivos (solo versión B) |
| a5 | Contexto adicional *(opcional)* | País, situación, experiencia, mensaje, versión y tema |

3. Copia el enlace del evento en `calendlyUrl` de las dos versiones.
4. Los emails de confirmación y de recordatorio salen de Calendly; las opciones disponibles dependen de tu plan.

## 3. Google Sheets (formularios)

1. Sigue las instrucciones del encabezado de `integraciones/google-apps-script.gs`.
2. Pega la URL que termina en `/exec` en `formEndpoint` de las dos versiones.
3. Prueba: envía un formulario de prueba y comprueba que aparece una fila nueva en la pestaña «Leads».

El envío se hace en segundo plano: la persona pasa a Calendly sin esperar. Si el envío fallara, Calendly guarda igualmente nombre, email y respuestas. El formulario incluye un campo trampa invisible contra bots.

## 4. Medición: Google Tag Manager, GA4 y Google Ads

Eventos que la página envía al `dataLayer` (todos incluyen `landing_version`, A o B):

| Evento | Cuándo | Parámetros |
|---|---|---|
| `lead_form_start` | Primera interacción con el formulario | `tema` |
| `lead_form_error` | Intento de envío con errores | `tema` |
| `generate_lead` | Formulario válido enviado | `form_id`, `tema`, `momento`, `compromiso` (y `user_data` si activas `enhancedConversions`) |
| `calendly_date_selected` | Elige fecha y hora | `tema` |
| `calendly_event_scheduled` | Reserva confirmada | `tema` |
| `calendly_load_error` | Calendly no cargó | `tema` |
| `cta_click` | Clic en un botón que lleva al formulario | `cta_text`, `tema` |
| `faq_open` | Abre una pregunta frecuente | `faq_question` |
| `whatsapp_click` | Clic en WhatsApp | `tema` |

Configuración sugerida en GTM:

1. Variables de capa de datos: `tema`, `landing_version`, `momento`, `compromiso`.
2. Activadores de evento personalizado para `generate_lead` y `calendly_event_scheduled`.
3. GA4: una etiqueta de evento para cada uno, marcados como eventos clave.
4. Google Ads: con un presupuesto pequeño, empieza con `generate_lead` como conversión principal (da más volumen para aprender) y `calendly_event_scheduled` como secundaria. Cuando tengas unas 30 reservas al mes, pasa la reserva a principal.
5. Conversiones mejoradas: pon `enhancedConversions: true` y usa la variable `user_data` en la etiqueta de Google Ads, solo si tu banner de cookies gestiona el consentimiento.

## 5. Cookies y consentimiento (España y UE)

Si usas GA4 o Google Ads, los visitantes de España deben aceptar las cookies de medición y publicidad antes de que se activen (Consent Mode v2). Usa un gestor de consentimiento como Cookiebot, CookieYes o Complianz y pega su script donde lo indica el comentario del `<head>`, antes de la configuración. Revisa los textos legales con tu asesor.

## 6. Google Ads: URL finales y titulares (versión A)

| Grupo de anuncios | URL final | Titular que verá la persona |
|---|---|---|
| Coaching profesional / laboral online | `https://www.coaching-ukuu.com/alinea-pro/?tema=coaching` | Recupera la confianza para liderar tu siguiente etapa profesional |
| Reorientación profesional | `…/alinea-pro/?tema=reorientacion` | Decide hacia dónde quieres llevar tu carrera |
| Transición / cambio de carrera | `…/alinea-pro/?tema=transicion` | Da el siguiente paso en tu carrera con estructura y confianza |
| Cambiar de trabajo a los 40 / 50 | `…/alinea-pro/?tema=edad` | No necesitas empezar de cero para cambiar de rumbo |
| Estancamiento profesional | `…/alinea-pro/?tema=estancamiento` | Sabes que puedes aportar más. Decide tu siguiente paso |
| Propósito / fortalezas | `…/alinea-pro/?tema=proposito` | Alinea tu trabajo con quien eres hoy |
| Liderazgo personal | `…/alinea-pro/?tema=liderazgo` | Lidera tu carrera con criterio propio |

Sin `?tema=`, o con un valor desconocido, se muestra el titular general. Cada variante cambia también el sobretítulo y el párrafo de entrada; los textos se editan en `variants`, dentro de la configuración. El tema, las UTM y el gclid se guardan en Google Sheets y se pasan a Calendly.

**Presupuesto:** con 300.000 al mes (si es en COP) y pujas de primera posición de entre 1.800 y 10.900 COP por clic, la cuenta tendrá entre 30 y 165 clics al mes. Conviene empezar con 2 o 3 grupos (reorientación profesional, coaching profesional y 40/50) y dejar liderazgo, propósito y estancamiento para la versión SEO.

## 7. Aplicar la máscara de marca

- Colores, tipografías, tamaños, radios y espacios están en variables al inicio del `<style>` (`:root`). Al cambiarlas, toda la página adopta la marca.
- Para usar Google Fonts, añade su `<link>` en el `<head>` y cambia `--font-heading` y `--font-body`.
- Clases principales (convención BEM):

| Bloque | Elementos y modificadores |
|---|---|
| `.site-header` | `__inner`, `__logo`; `.site-nav` y `.site-nav__link` (B) |
| `.hero` | `__grid`, `__content`, `__lead`, `__actions`, `__cta` (A), `__aside` (B) |
| `.btn` | `--primary`, `--secondary`, `--small`, `--block` |
| `.section` | `--alt`, `__header`, `__intro`, `__closing`, `__actions` |
| `.card`, `.panel`, `.steps`, `.topic` (B), `.about`, `.testimonial` | Contenido de las secciones |
| `.lead-box`, `.lead-form`, `.field`, `.choice`, `.consent` | Formulario |
| `.booking` | `__widget`, `__thanks`, `__fallback`, `__confirm`, `__placeholder` |
| `.faq` | `__item`, `__question`, `__answer` |
| `.cta-band`, `.site-footer`, `.sticky-cta` (A), `.wa-float` | Cierre y botones flotantes |
| `.ph` | Marcadores pendientes (quitar al publicar) |

- **WordPress (Elementor), Wix o Webflow:** lo más limpio es publicar el archivo como página completa con una plantilla en blanco. Si la plataforma solo admite bloques HTML, pega el `<style>` en el CSS personalizado del sitio, el contenido de `<body>` en un bloque HTML y los dos `<script>` finales al pie de la página.
- No cambies los `id` ni los `name` del formulario y del bloque de reserva: el script los usa.

## 8. Tono y contenido (según «Mi cliente soñado UKUU»)

- **Priorizar:** confianza, dirección profesional, decisiones, reconectar con tus recursos, capacidades y fortalezas, acción concreta, siguiente etapa profesional.
- **Evitar como eje:** motivación pasajera, éxito genérico, fórmulas mágicas, empezar de cero, corregir lo que está mal en ti, reflexionar indefinidamente, reinventarte; urgencia o presión; promesas de empleo o de salario.
- Tuteo, español neutro y fórmulas sin género para el lector («sientes cansancio» en lugar de «estás cansado»). Para Beatriz, femenino («coach certificada», «ingeniera»).
- «Miedo», «motivación» o «crisis» aparecen solo como voz del visitante (preguntas frecuentes, subtítulos), nunca como promesa.
- Las preguntas frecuentes de la versión B llevan marcado `FAQPage`. Google ya casi no las muestra como resultado enriquecido, pero el marcado le ayuda a entender la página.

## 9. Lista de verificación final

- [ ] Ningún `{{` en los archivos publicados.
- [ ] Formulario de prueba: fila nueva en Google Sheets y email de aviso.
- [ ] Calendly aparece prellenado y, al reservar, se ve la confirmación.
- [ ] Modo vista previa de GTM: llegan `generate_lead` y `calendly_event_scheduled`.
- [ ] Versión A con `noindex`; versión B con su `canonical`.
- [ ] Banner de cookies activo para visitantes de la UE.
- [ ] En móvil, el botón fijo aparece al bajar y se oculta junto al formulario.
- [ ] Datos estructurados de la versión B validados en validator.schema.org.
