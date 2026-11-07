# Landing UKUU Coaching · ALINEA PRO®

Dos versiones finales de la landing para captar contactos y agendar la **sesión de exploración gratuita** (45 minutos, Google Meet) con Calendly, con el diseño de marca de UKUU: logo, paleta exacta y estilo de la página de referencia.

## Contenido de la carpeta

| Archivo | Para qué sirve |
|---|---|
| `final/chatgpt-version-a-ads.html` | **Versión final A · Google Ads.** Corta y sin menú, con el formulario visible desde el principio. El titular cambia según el grupo de anuncios (`?tema=`). Marcada `noindex`. URL propuesta: `https://www.coaching-ukuu.com/alinea-pro/` |
| `final/chatgpt-version-b-seo.html` | **Versión final B · SEO.** Larga, cubre todos los temas del Keyword Planner y tiene 17 preguntas frecuentes con datos estructurados. URL propuesta: `https://www.coaching-ukuu.com/coaching-profesional-online/` |
| `final/assets/logo-ukuu.png` | Logo con fondo transparente (960 px) para tu biblioteca de medios. En las páginas ya va incrustado. |
| `version-a-ads/`, `version-b-seo/` | Wireframes neutros anteriores: misma estructura y textos, sin diseño. |
| `integraciones/google-apps-script.gs` | Script que guarda cada formulario en Google Sheets y avisa por email. |
| `brief/` | Análisis de palabras clave y plan inicial (documento de trabajo). |

Cada página es un único archivo autónomo: CSS en el `<head>`, logo incrustado y JavaScript al final. Las tipografías vienen de Google Fonts y la foto de Beatriz, de su sitio actual.

## Diseño de marca

- **Paleta exacta del logo:** oro `#E3A33B`, jade `#6FAF98`, sol `#F29A2E`, crema `#FBF6EC`.
- **Tonos derivados, solo para texto y contraste:** tinta `#1F2D28`, texto suave `#52635C`, jade profundo `#2C6A56`, jade noche `#15332B`, oro profundo `#8F5E10`. El oro, el jade y el sol no se usan para texto pequeño sobre crema porque no tienen contraste suficiente; los botones naranjas llevan texto oscuro.
- **Tipografías:** Outfit (títulos), Plus Jakarta Sans (texto) y JetBrains Mono (etiquetas), las mismas de la página de referencia.
- **Elementos tomados de la página de referencia:** franja superior, etiquetas en mono, sección oscura de resultados, tarjeta oscura «En la práctica», tarjeta de la coach con foto, preguntas con icono redondo, banda final oscura, barra de progreso de lectura y botón de WhatsApp.
- **Motivo del logo:** el sendero jade que lleva al sol. El método ALINEA PRO® se dibuja como un sendero de 5 etapas cuya última parada es el sol, y el subrayado del titular va del jade al sol.
- Todo se ajusta desde las variables de `:root`, al inicio del `<style>`.

## Datos ya configurados (tomados de la página de referencia)

| Dato | Valor | Dónde |
|---|---|---|
| Calendly | `https://calendly.com/ukuu-coaching` | `calendlyUrl` (A y B). Es la página general: cambia al enlace directo del evento, por ejemplo `…/sesion-de-exploracion`, para que la persona llegue directo al calendario. |
| WhatsApp | +57 318 105 1204 | `whatsapp` en B (botón flotante, tarjeta de la coach y pie). En A está vacío a propósito para no distraer del formulario. |
| Foto de Beatriz | Alojada en `static.wixstatic.com` (sitio actual) | Portada de B y sección «Quién te acompaña». Si cambias de plataforma, sube la foto y actualiza la URL. Si no carga, se muestran las iniciales. |

> **Importante:** la página de referencia muestra un enlace público a la hoja de Google Sheets de contactos. Quítalo de esa página: expone los datos de las personas que se registran. Las versiones finales no enlazan la hoja.

## Cómo funciona el recorrido

1. La persona completa el formulario (versión A: 5 campos; versión B: 10 campos).
2. Los datos se envían a Google Sheets y se registra el evento `generate_lead`.
3. En el mismo lugar aparece Calendly, prellenado con nombre, email y respuestas.
4. Al reservar, la página muestra la confirmación y registra `calendly_event_scheduled`.

Si Calendly no carga, aparece un botón «Abrir el calendario» que abre el mismo calendario con los datos ya incluidos.

## 1. Antes de publicar

### Marcadores pendientes

Busca `{{` en cada archivo. Los que se ven en la página aparecen resaltados en amarillo.

| Marcador | Dónde | Qué poner |
|---|---|---|
| `{{URL_APPS_SCRIPT}}` | Configuración (A y B) | URL `/exec` de la aplicación web (sección 3) |
| `{{GTM_ID}}` | Configuración (A y B) | ID del contenedor de Google Tag Manager, por ejemplo `GTM-ABC1234` |
| `{{RESPONSABLE_TRATAMIENTO}}` | Texto legal bajo el formulario | Nombre legal, país e identificación fiscal del responsable |
| `{{EMAIL_PRIVACIDAD}}` | Texto legal bajo el formulario | Email para ejercer los derechos de protección de datos |
| `{{URL_PRIVACIDAD}}`, `{{URL_AVISO_LEGAL}}`, `{{URL_COOKIES}}` | Formulario y pie de página | Páginas legales del sitio |
| `{{URL_IMAGEN_OG}}` | `<head>` | Imagen para compartir en redes (1200 × 630 px) |
| `{{EMAIL_CONTACTO}}`, `{{URL_LINKEDIN}}`, `{{URL_INSTAGRAM}}` | Pie de página (B) | Contacto y redes sociales |
| `{{URL_CONTACTO}}` | «Otros acompañamientos» (B) | Página o enlace de contacto |

Pendiente sin marcador:

- **Testimonios:** la sección está oculta (`hidden`) hasta tener testimonios reales y con permiso. Para activarla, quita `hidden` y reemplaza el texto de las tarjetas.
- **Número de sesiones de ALINEA PRO®:** comentario `PENDIENTE` en la tarjeta «En la práctica».
- **«Orientación para jóvenes» y «Coaching ejecutivo» (B):** son textos propuestos; valídalos.
- **Banner de cookies:** ver sección 5.

### Datos que no coinciden entre el formulario de briefing y la página de referencia

Las versiones finales usan las respuestas del formulario. Confírmalos antes de publicar:

| Dato | Formulario (usado) | Página de referencia |
|---|---|---|
| Credencial ICF | ACC (credencial de coach) | «ICF ACTP» (acreditación de un programa de formación) |
| Sesión gratuita | 45 minutos, «sesión de exploración» | 30 minutos, «sesión diagnóstica» |
| Sesiones del proceso | 45 minutos; número por definir | 60 minutos; de 8 a 12 sesiones |
| Nombre | Beatriz Terán | Beatríz Terán |

## 2. Calendly

1. Crea (o revisa) el evento individual **«Sesión de exploración»** de 45 minutos con ubicación Google Meet. Conecta Google Calendar en Calendly para que el enlace de Meet se genere solo.
2. En «Preguntas para el invitado», después de nombre y email, crea estas preguntas **en este orden**. Usa preguntas de texto («Una línea» o «Varias líneas»): el prellenado no funciona bien con opciones múltiples si el texto no coincide exactamente.

| Orden | Pregunta en Calendly | Se rellena con |
|---|---|---|
| a1 | WhatsApp (con prefijo de país) | WhatsApp |
| a2 | ¿Qué es lo que más te describe hoy? | Situación elegida en el formulario |
| a3 | ¿Estás en disposición de comprometerte con un proceso estructurado en los próximos meses? | Respuesta de compromiso |
| a4 | ¿Qué te gustaría conseguir? *(opcional)* | Objetivos (solo versión B) |
| a5 | Contexto adicional *(opcional)* | País, situación, experiencia, mensaje, versión y tema |

3. Pon el enlace directo del evento en `calendlyUrl` de las dos versiones.
4. Los emails de confirmación y de recordatorio salen de Calendly; las opciones disponibles dependen de tu plan.

## 3. Google Sheets (formularios)

1. Abre la hoja de contactos que ya usas (o crea una nueva) y ve a **Extensiones > Apps Script**.
2. Sigue las instrucciones del encabezado de `integraciones/google-apps-script.gs`: pega el script, implementa como aplicación web y copia la URL que termina en `/exec`.
3. Pega esa URL en `formEndpoint` de las dos versiones.
4. Prueba: envía un formulario de prueba y comprueba que aparece una fila nueva en la pestaña «Leads».

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
| `whatsapp_click` | Clic en WhatsApp | `tema`, `ubicacion` |

Configuración sugerida en GTM:

1. Variables de capa de datos: `tema`, `landing_version`, `momento`, `compromiso`.
2. Activadores de evento personalizado para `generate_lead` y `calendly_event_scheduled`.
3. GA4: una etiqueta de evento para cada uno, marcados como eventos clave.
4. Google Ads: con un presupuesto pequeño, empieza con `generate_lead` como conversión principal (da más volumen para aprender) y `calendly_event_scheduled` como secundaria. Cuando tengas unas 30 reservas al mes, pasa la reserva a principal.
5. Conversiones mejoradas: pon `enhancedConversions: true` y usa la variable `user_data` en la etiqueta de Google Ads, solo si tu banner de cookies gestiona el consentimiento.

## 5. Cookies y consentimiento (España y UE)

Si usas GA4 o Google Ads, los visitantes de España deben aceptar las cookies de medición y publicidad antes de que se activen (Consent Mode v2). Usa un gestor de consentimiento como Cookiebot, CookieYes o Complianz y pega su script donde lo indica el comentario del `<head>`, antes de la configuración. Revisa los textos legales con tu asesor.

## 6. SEO

### 6.1 Ficha de cada versión

| | Versión A (Google Ads) | Versión B (SEO) |
|---|---|---|
| URL propuesta | `/alinea-pro/` | `/coaching-profesional-online/` |
| Indexación | `noindex, follow` (no compite con B) | `index, follow`, `canonical` y `hreflang` `es` / `x-default` |
| Title | Coaching profesional online · ALINEA PRO® \| UKUU Coaching (57 caracteres) | Coaching profesional online y reorientación profesional \| UKUU (62) |
| Meta description | Proceso individual de coaching online para recuperar la confianza, decidir tu siguiente etapa profesional y avanzar con un plan. Primera sesión gratuita. (153) | Coaching profesional online y reorientación profesional en español: recupera la confianza y decide tu siguiente etapa con un plan. Primera sesión gratis. (153) |
| H1 | Recupera la confianza para liderar tu siguiente etapa profesional (cambia con `?tema=`) | Recupera la confianza para liderar tu siguiente etapa profesional |
| Palabra clave principal | La del grupo de anuncios | coaching profesional online + reorientación profesional |

Como pide el documento «Mi cliente soñado», el H1 habla de la situación de la persona; la palabra clave va en el sobretítulo, el title, la meta description, la URL y los H2.

### 6.2 Mapa de palabras clave de la versión B

| Sección | Palabras clave principales | Secundarias y long tail |
|---|---|---|
| Portada (sobretítulo, title, meta) | coaching profesional online, reorientación profesional | coaching de carrera, coaching laboral |
| ¿Qué te está pasando realmente? | estancamiento, desconexión, dudas | no sé qué hacer con mi vida profesional |
| Reorientación profesional | reorientación profesional, transición profesional | transición laboral, cambio de carrera profesional, cambio de rumbo profesional, cómo dar un giro profesional, cómo planear un cambio de carrera |
| A los 40 o a los 50 | cambiar de trabajo a los 40, cambiar de trabajo a los 50 | cambiar de profesión a los 40 y a los 45, cómo cambiar de trabajo sin empezar de cero, orientación profesional para adultos |
| Estancamiento profesional | estancamiento profesional, estancamiento laboral | mi trabajo ya no me motiva, mi trabajo ya no me satisface, no sé hacia dónde orientar mi carrera |
| Liderazgo personal y fortalezas | liderazgo personal, coaching de fortalezas | desarrollo profesional y personal, autoconocimiento profesional |
| Propósito profesional | propósito profesional | cómo encontrar mi propósito profesional, cómo definir mi rumbo profesional, plan de carrera personal |
| ALINEA PRO® paso a paso | coaching profesional online | plan de acción, toma de decisiones |
| Preguntas frecuentes (17) | long tail del CSV | ¿es tarde a los 40 o a los 50?, ¿cuánto cuesta un coach de carrera?, ¿cómo sé si debo cambiar de trabajo?, coaching o terapia, etc. |

### 6.3 Datos estructurados y técnica

- **JSON-LD (B):** `ProfessionalService` (UKUU Coaching), `Person` (Beatriz Terán, credencial ICF ACC y foto), `Service` (ALINEA PRO®), `WebPage` y `FAQPage` con las 17 preguntas visibles. Google ya casi no muestra las FAQ como resultado enriquecido, pero el marcado le ayuda a entender la página.
- **Enlaces internos:** enlaza `/coaching-profesional-online/` desde la home, el menú y los artículos del blog, con anclas variadas (coaching profesional online, reorientación profesional, cambiar de trabajo a los 40).
- **Imágenes:** el logo va incrustado (12 KB). Si subes la foto a tu propio sitio, usa WebP de unos 80 KB y conserva el `alt`.
- **Rendimiento:** CSS y JS integrados, sin librerías. Calendly solo se carga después de enviar el formulario, así que no penaliza la carga inicial.
- **Search Console:** envía la URL de B y el sitemap, revisa consultas y CTR a las 4–6 semanas y ajusta title y meta description según lo que muestren.

### 6.4 Contenidos de apoyo (blog)

Muchas búsquedas del CSV tienen poco volumen en Ads pero sirven para SEO. Cada artículo debe enlazar a la versión B:

1. ¿Cambiar de trabajo a los 40 o a los 50? Cómo hacerlo sin empezar de cero
2. Cómo saber si debo cambiar de trabajo o de profesión
3. Estancamiento profesional: qué es y cómo salir de él
4. Reorientación profesional: qué es y cómo planear un cambio de carrera
5. Cómo identificar tus fortalezas profesionales
6. Coaching de carrera o psicoterapia: diferencias y cuándo elegir cada uno
7. ¿Cuánto cuesta un coach de carrera? Qué incluye un proceso

## 7. Google Ads (versión A)

### 7.1 Grupos de anuncios, palabras clave y URL finales

Volúmenes y pujas de primera posición del Keyword Planner (1 oct. 2025 – 30 sept. 2026). Corchetes = concordancia exacta; comillas = concordancia de frase. Las palabras sin datos van en frase.

| Grupo · URL final | Palabras clave |
|---|---|
| **Coaching profesional** · `/alinea-pro/?tema=coaching` | [coaching profesional] 880 · 2 809–14 570 COP · ya en tu cuenta · [coaching laboral] 880 · 1 782–7 932 · ya en tu cuenta · [coaching de carrera] 40 · ya en tu cuenta · [coaching profesional online] 40 · 4 719–24 179 (competencia alta) · [asesor de carrera] 30 · [coach laboral online] 20 · "coaching de carrera online" · "sesiones de coaching profesional" · "coaching individual para profesionales" · "coaching para profesionales con experiencia" |
| **Reorientación profesional** · `?tema=reorientacion` | [reorientación profesional] 1 000 · 1 180–13 640 · competencia baja · +108 % en 3 meses · "orientación profesional para adultos" · "orientación profesional para cambiar de carrera" · "asesoría para cambio de carrera" |
| **Transición y cambio de carrera** · `?tema=transicion` | [transición laboral] 70 · [transición profesional] 30 · [transición de carrera] 20 · [cambio de carrera profesional] 10 · "cambio de rumbo profesional" · "coaching para cambiar de carrera" · "coaching para transición profesional" · "cómo dar un giro profesional" · "cómo planear un cambio de carrera" |
| **Cambiar de trabajo a los 40 / 50** · `?tema=edad` | [cambiar de trabajo a los 50] 140 · 1 147–7 661 · [cambiar de trabajo a los 40] 110 · 1 876–7 949 · [cambiar de profesión a los 40] 30 · [cambiar de carrera a los 35] 10 · [cambiar de carrera a los 40] 10 · "cambiar de carrera a los 45" · "cambiar de carrera a los 50" · "orientación profesional a los 40" · "cómo cambiar de trabajo sin empezar de cero" |
| **Estancamiento profesional** · `?tema=estancamiento` | [estancamiento laboral] 40 · [estancamiento profesional] 20 · [me siento estancado en mi trabajo] 10 · [mi trabajo ya no me motiva] 10 · [no me siento realizado en mi trabajo] 10 · "cómo salir del estancamiento profesional" · "quiero cambiar de trabajo pero no sé qué hacer" · "cómo saber si debo cambiar de trabajo" |
| **Propósito y fortalezas** · `?tema=proposito` | [propósito profesional] 90 · [autoconocimiento profesional] 30 · [coaching de fortalezas] 30 · 5 350–13 322 (competencia alta) · "cómo encontrar mi propósito profesional" · "cómo identificar mis fortalezas profesionales" · "cómo alinear mi trabajo con mis valores" · "plan de carrera personal" |
| **Liderazgo personal** · `?tema=liderazgo` | [coaching de liderazgo personal] 10 · "liderazgo personal" 320 · 702–4 430 · "desarrollo profesional y personal" 260 · 1 732–6 401 · ya en tu cuenta. Estas dos últimas son sobre todo informativas: puja baja o déjalas para SEO. |

Todas las URL empiezan por `https://www.coaching-ukuu.com/alinea-pro/`. Sin `?tema=`, o con un valor desconocido, se muestra el titular general; los textos se editan en `variants`, dentro de la configuración. El tema, las UTM y el gclid se guardan en Google Sheets y se pasan a Calendly.

### 7.2 Palabras clave negativas

Crea una lista de negativas a nivel de campaña («UKUU · negativas ALINEA PRO») con estas palabras en concordancia amplia negativa, salvo las que van entre comillas (frase negativa). Revisa el informe de términos de búsqueda cada semana y añade lo que no encaje.

| Motivo | Negativas |
|---|---|
| Formación para ser coach | curso, cursos, certificación, diplomado, máster, master, maestría, formación, escuela, academia, universidad, estudiar, título, acreditación, "ser coach", "cómo ser coach", "hacerse coach", "trabajar como coach" |
| Recursos e intención informativa | pdf, libro, libros, ebook, frases, citas, imágenes, plantilla, plantillas, ejemplo, ejemplos, dinámicas, actividades, tesis, ensayo, monografía, resumen, wikipedia, "qué es", definición, significado, concepto |
| Empleo y búsqueda de trabajo | empleo, ofertas, vacantes, vacante, "bolsa de trabajo", sueldo, salario, "cuánto gana", currículum, curriculum, cv, "hoja de vida", "carta de presentación", "entrevista de trabajo", headhunter, "agencia de empleo", "agencia de colocación" |
| Servicios públicos (sobre todo España) | sepe, inem, paro, subsidio, prestación, "oficina de empleo", "servicio público de empleo", "plan de empleo", fundae, ayuntamiento |
| Derecho laboral (confusión con «asesoría laboral») | "asesoría laboral", "asesoria laboral", "asesor laboral", abogado, abogados, "derecho laboral", nómina, nóminas, despido, finiquito, liquidación, indemnización, convenio, "contrato de trabajo", "seguridad social", "baja laboral", "inspección de trabajo" |
| Salud mental (el coaching no es terapia) | psicólogo, psicóloga, psicología, psicoterapia, terapia, terapeuta, psiquiatra, ansiedad, depresión, "salud mental", tratamiento |
| Otros públicos o servicios | niños, adolescentes, colegio, bachillerato, "test vocacional", "orientación vocacional", "coaching empresarial", "para empresas", "team building", "coaching deportivo", "coaching de pareja", "coaching nutricional", "coaching financiero", "coaching educativo", "coaching ontológico", pnl |

Notas:

- UKUU también ofrece orientación para jóvenes y coaching ejecutivo. Esas búsquedas son negativas en **esta** campaña porque la landing habla de ALINEA PRO®; si quieres anunciarlas, crea campañas y páginas propias.
- «gratis» y «gratuito» no están en la lista porque la primera sesión es gratuita. Si atraen clics sin intención, añádelas después de revisar los términos de búsqueda.
- La versión A acepta personas en búsqueda de empleo como público secundario; por eso «desempleo» no está bloqueada. Añádela si esas búsquedas no convierten.

### 7.3 Presupuesto y puja

- Con 300.000 al mes (si es en COP) y pujas de primera posición de entre 1.800 y 10.900 COP por clic, la cuenta tendrá entre 30 y 165 clics al mes.
- Empieza con 3 grupos: reorientación profesional, coaching profesional y 40/50. Deja liderazgo, propósito y estancamiento para la versión SEO hasta tener más presupuesto.
- Segmentación: España, México, Chile, Colombia y Estados Unidos, idioma español. Empieza con «Maximizar clics» con límite de CPC y pasa a «Maximizar conversiones» cuando tengas 15–30 conversiones al mes.
- Los picos de búsqueda son en octubre y de enero a marzo: conviene tener la campaña lista antes de enero.

## 8. Ajustar la marca o editar

- Colores, tipografías, tamaños, radios y sombras están en variables al inicio del `<style>` (`:root`).
- Clases principales (convención BEM):

| Bloque | Elementos y modificadores |
|---|---|
| `.ticker` | Franja superior: `__inner`, `__dot` |
| `.site-header` | `--sticky` (B), `__inner`, `__logo`; `.site-nav` y `.site-nav__link` (B) |
| `.hero` | `__grid`, `__content`, `__lead`, `__actions`, `__cta` (A) |
| `.pill`, `.tag`, `.hl` | Etiquetas en mono (`.pill--night` en fondos oscuros) y subrayado del titular |
| `.btn` | `--primary` (sol), `--jade`, `--ghost`, `--small`, `--block` |
| `.section` | `--white`, `--tint`, `--night`, `__header`, `__header--center`, `__intro`, `__closing`, `__actions` |
| `.route-card` (B) y `.path` | Tarjeta «sendero» y proceso por etapas (`.path--compact`, `.path__step`) |
| `.grid` | `--2`, `--3`, `--five` (5 tarjetas: 5, 3 + 2 o 1 por fila) |
| `.card` | `--night`, `__label`, `__quote`, `__title`, `__mark` |
| `.practice`, `.star-list`, `.quote-block`, `.fit`, `.topic` (B) | Bloques de contenido |
| `.coach`, `.chips`, `.photo-fallback` | Quién te acompaña |
| `.booking-panel` (B), `.mini-steps`, `.lead-box`, `.lead-form`, `.field`, `.choice`, `.consent` | Formulario |
| `.booking` | `__widget`, `__thanks`, `__fallback`, `__confirm`, `__placeholder` |
| `.faq`, `.cta-band`, `.site-footer`, `.sticky-cta` (A), `.wa-float` (B), `.progress` | Resto |
| `.ph` | Marcadores pendientes (quitar al publicar) |

- **Wix, WordPress (Elementor) o Webflow:** lo más limpio es publicar el archivo como página completa con una plantilla en blanco. En Wix, la opción habitual es un bloque «Incrustar código» (HTML) a ancho completo; si el editor limita la altura o los scripts, publica la página en un subdominio estático y enlázala desde el sitio.
- No cambies los `id` ni los `name` del formulario y del bloque de reserva: el script los usa.

## 9. Tono y contenido (según «Mi cliente soñado UKUU»)

- **Priorizar:** confianza, dirección profesional, decisiones, reconectar con tus recursos, capacidades y fortalezas, acción concreta, siguiente etapa profesional.
- **Evitar como eje:** motivación pasajera, éxito genérico, fórmulas mágicas, empezar de cero, corregir lo que está mal en ti, reflexionar indefinidamente, reinventarte; urgencia o presión; promesas de empleo o de salario.
- Tuteo, español neutro y fórmulas sin género para el lector («sientes cansancio» en lugar de «estás cansado»). Para Beatriz, femenino («coach certificada», «ingeniera»).
- «Miedo», «motivación» o «crisis» aparecen solo como voz del visitante (preguntas frecuentes, subtítulos), nunca como promesa.

## 10. Lista de verificación final

- [ ] Ningún `{{` en los archivos publicados.
- [ ] `calendlyUrl` apunta al evento «Sesión de exploración» y Calendly aparece prellenado.
- [ ] Formulario de prueba: fila nueva en Google Sheets y email de aviso.
- [ ] Modo vista previa de GTM: llegan `generate_lead` y `calendly_event_scheduled`.
- [ ] Versión A con `noindex`; versión B con su `canonical`.
- [ ] Banner de cookies activo para visitantes de la UE.
- [ ] Datos de la tabla «no coinciden» confirmados (credencial, duración, nombre).
- [ ] En móvil, el botón fijo aparece al bajar y se oculta junto al formulario (A).
- [ ] Datos estructurados de la versión B validados en validator.schema.org.
- [ ] Lista de negativas cargada en Google Ads antes de activar la campaña.
