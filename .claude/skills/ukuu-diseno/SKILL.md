---
name: ukuu-diseno
description: Sistema de diseño y tono de UKUU Coaching y su programa ALINEA PRO® (paleta exacta del logo, tipografías, componentes y reglas de contenido en español). Úsalo siempre que se cree o modifique una landing, página, email, anuncio o cualquier pieza de UKUU Coaching, aunque no se mencione la palabra «diseño».
---

# UKUU Coaching · sistema de diseño y tono

## Referencias en este repositorio

- Versiones finales de la landing (CSS de marca completo en su `<style>`): `landing-ukuu/final/chatgpt-version-a-ads.html` y `landing-ukuu/final/chatgpt-version-b-seo.html`.
- Logo con fondo transparente: `landing-ukuu/final/assets/logo-ukuu.png` (en las páginas va incrustado como PNG en base64).
- Guía de integración, SEO, palabras clave y negativas: `landing-ukuu/README.md`.
- Análisis del cliente ideal y de palabras clave: `landing-ukuu/brief/analyse-et-plan.md`.

Antes de crear una pieza nueva, lee el `<style>` de una versión final y reutiliza sus variables y clases.

## Paleta (exacta, no la cambies)

| Uso | Color |
|---|---|
| Oro (letras del logo, acentos) | `#E3A33B` |
| Jade (sendero del logo, detalles) | `#6FAF98` |
| Sol (botones principales, puntos) | `#F29A2E` |
| Crema (fondo) | `#FBF6EC` |

Tonos derivados solo para texto y contraste: tinta `#1F2D28`, texto suave `#52635C`, jade profundo `#2C6A56`, jade noche `#15332B` (secciones oscuras), oro profundo `#8F5E10`.

- Nunca pongas texto pequeño en oro, jade o sol sobre crema: no tiene contraste suficiente.
- Los botones naranjas (degradado sol → oro) llevan texto en tinta, no en blanco.

## Tipografías

Outfit (títulos, 700–800), Plus Jakarta Sans (texto, 400–700) y JetBrains Mono (etiquetas pequeñas en mayúsculas). Todas desde Google Fonts.

## Componentes y motivos

- **Motivo del logo:** un sendero jade que lleva a un sol naranja. Úsalo para procesos (etapas unidas por una línea jade cuya última parada es el sol) y en el subrayado del titular (degradado jade → oro → sol, clase `.hl`).
- Etiquetas `.pill` en mono con punto naranja, franja superior oscura `.ticker`, sección oscura de resultados `.section--night`, tarjeta oscura `.practice` con lista de estrellas, tarjeta de la coach `.coach` con foto y chips, preguntas frecuentes con icono redondo, banda final `.cta-band` con un sol.
- Radios grandes (16–28 px), botones en forma de píldora y sombras suaves.

## Contenido y tono (documento «Mi cliente soñado UKUU»)

- Cliente ideal: «el profesional desalineado consciente», con una carrera estable que ya no encaja con quien es hoy (32–50 años como referencia, no como criterio).
- Mensaje central aprobado: «Recupera la confianza para liderar tu siguiente etapa profesional».
- Priorizar: confianza, dirección profesional, decisiones, reconectar con tus recursos, capacidades y fortalezas, acción concreta, siguiente etapa profesional.
- Evitar como eje: motivación pasajera, éxito genérico, fórmulas mágicas, empezar de cero, corregir lo que está mal en ti, reflexionar indefinidamente, reinventarte, urgencia o presión, promesas de empleo o salario.
- Español neutro, tuteo y fórmulas sin género para el lector («sientes cansancio», no «estás cansado»). Para la coach, femenino: Beatriz Terán, «coach certificada», «ingeniera».
- Hablar de la situación de la persona, no de categorías de coaching. Tono sobrio y respetuoso, sin dramatizar.
- No inventar testimonios, cifras ni credenciales.

## Datos confirmados

- Programa: ALINEA PRO® (marca registrada), proceso individual online por Google Meet, sesiones de 45 minutos, frecuencia flexible.
- Sesión de exploración gratuita de 45 minutos, sin compromiso. El precio se explica en esa sesión.
- Coach: Beatriz Terán, ingeniera de formación, credencial ICF ACC según el briefing (la página de referencia dice «ICF ACTP»: confirmar antes de publicar).
- Calendly: `https://calendly.com/ukuu-coaching` · WhatsApp: +57 318 105 1204.
