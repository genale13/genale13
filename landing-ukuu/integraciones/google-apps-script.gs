/**
 * UKUU Coaching · Recepción de los formularios de la landing en Google Sheets
 *
 * Instalación (unos 5 minutos):
 * 1. Crea una hoja de cálculo nueva en Google Sheets (por ejemplo, «Leads UKUU»).
 * 2. Menú Extensiones > Apps Script. Borra el contenido y pega este archivo completo.
 * 3. Si quieres un email por cada contacto nuevo, escribe tu dirección en NOTIFY_EMAIL.
 * 4. Implementar > Nueva implementación > Tipo: Aplicación web.
 *      Ejecutar como: Yo
 *      Quién tiene acceso: Cualquier usuario
 * 5. Autoriza los permisos y copia la URL que termina en /exec.
 * 6. Pega esa URL en formEndpoint (bloque de configuración al final de cada landing).
 *
 * Si modificas este script, publica una versión nueva en
 * Implementar > Gestionar implementaciones > Editar > Versión: nueva.
 */
const SHEET_NAME = 'Leads';
const NOTIFY_EMAIL = ''; // ej.: 'hola@coaching-ukuu.com' · vacío = sin aviso por email

const COLUMNS = [
  'fecha_recepcion', 'version', 'tema', 'nombre', 'email', 'whatsapp', 'pais', 'situacion', 'momento',
  'objetivo', 'experiencia', 'compromiso', 'mensaje', 'consentimiento_privacidad', 'consentimiento_comunicaciones',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'gbraid', 'wbraid',
  'pagina', 'fecha_envio'
];

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!data.nombre || !data.email) return respond_({ ok: false, error: 'faltan datos' });
    if (data.website) return respond_({ ok: true }); // campo trampa: envío de un bot

    const sheet = getSheet_();
    sheet.appendRow(COLUMNS.map(function (column) {
      return column === 'fecha_recepcion' ? new Date() : clean_(data[column]);
    }));
    if (NOTIFY_EMAIL) notify_(data);
    return respond_({ ok: true });
  } catch (err) {
    return respond_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/* Permite comprobar en el navegador que la aplicación web responde */
function doGet() {
  return respond_({ ok: true, servicio: 'Leads UKUU' });
}

function getSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(COLUMNS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/* Evita que un texto que empieza por =, +, - o @ se interprete como fórmula */
function clean_(value) {
  if (value === undefined || value === null) return '';
  let text = String(value).slice(0, 2000);
  if (/^[=+\-@]/.test(text)) text = "'" + text;
  return text;
}

function notify_(data) {
  const origin = [data.utm_source, data.utm_medium, data.utm_campaign].filter(String).join(' / ') || 'directo';
  const lines = [
    'Nuevo contacto desde la landing ' + (data.version || '') + ' (tema: ' + (data.tema || 'general') + ')',
    '',
    'Nombre: ' + data.nombre,
    'Email: ' + data.email,
    'WhatsApp: ' + (data.whatsapp || ''),
    'País: ' + (data.pais || ''),
    'Lo que más le describe hoy: ' + (data.momento || ''),
    'Compromiso: ' + (data.compromiso || ''),
    'Objetivos: ' + (data.objetivo || ''),
    'Mensaje: ' + (data.mensaje || ''),
    '',
    'Origen: ' + origin
  ];
  MailApp.sendEmail(NOTIFY_EMAIL, 'Nuevo contacto UKUU: ' + data.nombre, lines.join('\n'));
}

function respond_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
