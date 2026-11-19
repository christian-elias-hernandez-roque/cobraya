// CobraYa — esqueleto web (Hackatón México 2026)
// JavaScript + Node.js, solo librería estándar, sin dependencias.
// Uso:  npm start   (o: node server.js)  →  http://localhost:3000
//
// Flujo: teclado de monto → concepto opcional → QR por venta →
// "Simular pago recibido" → "¡Pago recibido!" → venta en "Ventas de hoy".
//
// ============================================================================
//  PUNTO DE INTEGRACIÓN REAL CON LA API DE PEY  (pendiente de credenciales)
// ============================================================================
//  Cuando lleguen las credenciales del arranque (sábado 14 nov 2026):
//    1. Crear el cobro real en `crearCobroReal()` (abajo):
//         POST https://api.pey.mx/codi/qr
//         Authorization: Bearer <api-key>
//         Body: { amount, concept, expiration: 600, numRef }
//       La respuesta 201 trae el QR real (imagen, texto o id — confirmar
//       en la documentación al hacer la primera llamada).
//    2. Recibir la confirmación en el webhook `POST /api/webhooks/pey`
//       (abajo): Pey manda type "codi.qr.payment_received" con numRef,
//       codiQrId y transactionId. La venta se busca por numRef.
//    3. Verificar la firma `webhook-signature: v1,…` antes de marcar
//       cualquier pago como recibido (algoritmo y secreto por confirmar).
//
//  SEGURIDAD — LA API KEY NUNCA VA EN EL CÓDIGO DEL CLIENTE:
//  La llave de Pey solo la usa este servidor, leyéndola de una variable de
//  entorno (PEY_API_KEY). Nunca se pone en public/app.js, en el HTML ni en
//  ningún archivo que se suba a GitHub. Sin credenciales, el servidor sigue
//  funcionando en modo demostración (QR demo, botón de simular pago).
// ============================================================================

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const VENTAS_FILE = path.join(DATA_DIR, 'ventas.json');

// --- Persistencia simple: las ventas de hoy se guardan en data/ventas.json ---
// (Esa carpeta está en .gitignore: las ventas no se suben al repo.)
function cargarVentas() {
  try {
    return JSON.parse(fs.readFileSync(VENTAS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function guardarVentas(ventas) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(VENTAS_FILE, JSON.stringify(ventas, null, 2));
}

// Fecha de hoy en hora de México, para filtrar "Ventas de hoy".
function hoyMX() {
  return new Date().toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' });
}

function nuevaVenta(monto, concepto) {
  const ventas = cargarVentas();
  const venta = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    // numRef: referencia única de la venta. Pey exige que sea numérica
    // de máximo 7 dígitos ("Numeric reference must be up to 7 digits",
    // error 400 verificado en la prueba real del 17 nov 2026), así que
    // se genera un número aleatorio de 7 dígitos. Se manda a Pey al crear
    // el cobro y Pey la devuelve en el webhook, así se sabe qué venta se pagó.
    numRef: String(Math.floor(1000000 + Math.random() * 9000000)),
    monto: Number(monto),
    concepto: (concepto || '').trim(),
    estado: 'pendiente', // pendiente | pagado | no-confirmado
    fecha: hoyMX(),
    creadoEn: new Date().toISOString(),
    pagadoEn: null,
    codiQrId: null,
    transactionId: null,
  };
  ventas.push(venta);
  guardarVentas(ventas);
  return venta;
}

// ============================================================================
//  INTEGRACIÓN PEY — crearCobroReal() (AQUÍ VA LA LLAMADA REAL)
// ============================================================================
//  TODO (después del arranque, con credenciales):
//    const res = await fetch('https://api.pey.mx/codi/qr', {
//      method: 'POST',
//      headers: {
//        'Authorization': `Bearer ${process.env.PEY_API_KEY}`, // solo servidor
//        'Content-Type': 'application/json',
//      },
//      body: JSON.stringify({
//        amount: venta.monto,
//        concept: venta.concepto || `Venta ${venta.numRef}`,
//        expiration: 600, // 10 minutos
//        numRef: venta.numRef,
//      }),
//    });
//    // 201 → el QR real. Guardar en la venta lo que devuelva (id/imagen).
//  Mientras no haya credenciales, se usa el QR de demostración que dibuja
//  el cliente (public/app.js) y el botón "Simular pago recibido".
const PEY_API_URL = 'https://api.pey.mx/codi/qr';

async function crearCobroReal(venta) {
  const apiKey = process.env.PEY_API_KEY;
  if (!apiKey) throw new Error('Falta PEY_API_KEY en el entorno del servidor.');
  const res = await fetch(PEY_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: venta.monto,
      concept: venta.concepto || `Venta ${venta.numRef}`,
      expiration: 600, // 10 minutos
      numRef: venta.numRef,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Pey respondió ${res.status}: ${JSON.stringify(data)}`);
  }
  // Formato del 201 confirmado en la prueba real del 17 nov 2026:
  // { id, qrString } — qrString es el payload CoDi (JSON de 496 chars)
  // que hay que convertir a imagen QR para que la app del banco lo lea.
  const qr = data.qrString || data.qr || data.qrImage || data.qrText || data.image
    || (data.data && (data.data.qrString || data.data.qr || data.data.qrImage)) || null;
  const ventas = cargarVentas();
  const v = ventas.find((x) => x.id === venta.id);
  if (v) {
    v.codiQrId = data.codiQrId || data.id || (data.data && data.data.codiQrId) || null;
    v.qrReal = qr;              // texto o data:image/... del QR real
    v.respuestaPey = data;      // cruda, para ver el formato en la 1ª llamada
    guardarVentas(ventas);
  }
  return { qr, codiQrId: v ? v.codiQrId : null };
}

// Verificación de la firma del webhook de Pey.
// El algoritmo exacto de `webhook-signature: v1,…` no estaba en las páginas
// de la documentación leídas: se usa HMAC-SHA256 del cuerpo crudo, el
// esquema más común para `v1=<hex>`, y se marca para cambiarlo si Pey usa otro.
function verificarFirmaPey(cuerpoCrudo, firma) {
  const secreto = process.env.PEY_WEBHOOK_SECRET;
  if (!secreto) return { verificado: false, motivo: 'sin-secreto-configurado' };
  if (!firma || !firma.startsWith('v1=')) return { verificado: false, motivo: 'firma-ausente' };
  const esperado = 'v1=' + crypto.createHmac('sha256', secreto).update(cuerpoCrudo).digest('hex');
  const a = Buffer.from(firma);
  const b = Buffer.from(esperado);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  return { verificado: ok, motivo: ok ? null : 'firma-no-coincide' };
}

function marcarPagada(venta, { codiQrId = null, transactionId = null } = {}) {
  const ventas = cargarVentas();
  const v = ventas.find((x) => x.id === venta.id);
  if (!v) return null;
  v.estado = 'pagado';
  v.pagadoEn = new Date().toISOString();
  if (codiQrId) v.codiQrId = codiQrId;
  if (transactionId) v.transactionId = transactionId;
  guardarVentas(ventas);
  return v;
}

// --- Servidor HTTP (solo estándar de Node) ---
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function leerBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
  });
}

// Como leerBody, pero devuelve el texto crudo además del objeto, para
// verificar la firma HMAC del webhook antes de confiar en el payload.
function leerBodyCrudo(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        resolve({ crudo: body, payload: body ? JSON.parse(body) : {} });
      } catch (e) {
        reject(e);
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const ruta = url.pathname;

  const json = (codigo, obj) => {
    res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(obj));
  };

  try {
    // API: ventas de hoy
    if (ruta === '/api/ventas' && req.method === 'GET') {
      const ventas = cargarVentas().filter((v) => v.fecha === hoyMX());
      return json(200, { ventas });
    }

    // API: crear una venta (monto → concepto → QR)
    if (ruta === '/api/ventas' && req.method === 'POST') {
      const { monto, concepto } = await leerBody(req);
      if (!monto || Number(monto) <= 0) {
        return json(400, { error: 'El monto debe ser mayor que 0.' });
      }
      let venta = nuevaVenta(monto, concepto);
      // Con llave: intento de cobro real en Pey; sin llave, demo como antes.
      // Si Pey falla, se sigue en demo y el error queda guardado en el servidor.
      let modo = 'demo';
      if (process.env.PEY_API_KEY) {
        try {
          await crearCobroReal(venta);
          modo = 'real';
          // crearCobroReal guarda qrReal/codiQrId en disco: recargar la venta
          // para devolver al cliente los datos actualizados.
          const actualizada = cargarVentas().find((x) => x.id === venta.id);
          if (actualizada) venta = actualizada;
        } catch (e) {
          console.error('Pey falló, se sigue en demo:', e.message);
          venta.errorPey = e.message; // se guarda para depurar, no se muestra al cliente
        }
      }
      return json(201, { venta, demo: modo === 'demo', modo });
    }

    // API: simular que llegó el pago (SOLO DEMO — se quita con Pey real)
    if (ruta.startsWith('/api/ventas/') && ruta.endsWith('/confirmar') && req.method === 'POST') {
      const id = ruta.split('/')[3];
      const ventas = cargarVentas();
      const venta = ventas.find((v) => v.id === id);
      if (!venta) return json(404, { error: 'Venta no encontrada.' });
      return json(200, { venta: marcarPagada(venta) });
    }

    // API: marcar una venta como no confirmada (el cliente no pagó / se canceló)
    if (ruta.startsWith('/api/ventas/') && ruta.endsWith('/no-confirmado') && req.method === 'POST') {
      const id = ruta.split('/')[3];
      const ventas = cargarVentas();
      const venta = ventas.find((v) => v.id === id);
      if (!venta) return json(404, { error: 'Venta no encontrada.' });
      venta.estado = 'no-confirmado';
      guardarVentas(ventas);
      return json(200, { venta });
    }

    // ========================================================================
    //  WEBHOOK PEY — POST /api/webhooks/pey  (AQUÍ LLEGA LA CONFIRMACIÓN REAL)
    // ========================================================================
    //  TODO (con credenciales): Pey hace POST aquí cuando el cliente paga.
    //  Payload: { amount, apiKeyId, codiQrId, concept, datePaid, numRef,
    //             transactionId, type: "codi.qr.payment_received" }
    //  Header: webhook-signature: v1,…
    //  Pasos: 1) verificar la firma (algoritmo/secreto por confirmar),
    //         2) buscar la venta por numRef, 3) marcarla pagada y guardar
    //         codiQrId + transactionId. NO marcar pagos sin verificar la firma.
    if (ruta === '/api/webhooks/pey' && req.method === 'POST') {
      const { crudo, payload } = await leerBodyCrudo(req);
      // Diagnóstico (18 nov): el webhook real de Pey llegó sin el header
      // webhook-signature, así que se rechazó con 401 ("firma-ausente").
      // Registrar los headers que Pey realmente manda para ajustar la
      // verificación al formato real en vez de suponerlo.
      console.log('Webhook Pey headers:', JSON.stringify(req.headers));
      console.log('Webhook Pey payload:', JSON.stringify({ type: payload.type, numRef: payload.numRef, codiQrId: payload.codiQrId, amount: payload.amount }));
      // En modo real (hay llave) un webhook sin firma válida no marca el pago.
      // En demo se acepta como antes, pero queda registrado el aviso.
      const { verificado, motivo } = verificarFirmaPey(crudo, req.headers['webhook-signature']);
      if (process.env.PEY_API_KEY && !verificado) {
        console.warn('Webhook Pey rechazado:', motivo);
        return json(401, { error: 'Firma del webhook no verificada.' });
      }
      if (!verificado) console.warn('Webhook sin verificar (modo demo, sin secreto):', motivo);
      if (payload.type !== 'codi.qr.payment_received') {
        return json(200, { ok: true, ignorado: true });
      }
      const ventas = cargarVentas();
      const venta = ventas.find((v) => v.numRef === payload.numRef);
      if (!venta) return json(404, { error: 'Venta no encontrada por numRef.' });
      const actualizada = marcarPagada(venta, {
        codiQrId: payload.codiQrId,
        transactionId: payload.transactionId,
      });
      return json(200, { ok: true, venta: actualizada });
    }

    // Archivos estáticos (public/)
    let archivo = ruta === '/' ? 'index.html' : ruta.slice(1);
    const rutaArchivo = path.normalize(path.join(PUBLIC_DIR, archivo));
    if (!rutaArchivo.startsWith(PUBLIC_DIR) || !fs.existsSync(rutaArchivo)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('No encontrado');
    }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(rutaArchivo)] || 'application/octet-stream' });
    fs.createReadStream(rutaArchivo).pipe(res);
  } catch (e) {
    json(500, { error: e.message });
  }
});

server.listen(PORT, () => {
  console.log(`CobraYa corriendo en http://localhost:${PORT}`);
  console.log(process.env.PEY_API_KEY
    ? 'Modo: real (Pey). Integración Pey: activa.'
    : 'Modo: demostración (QR demo). Integración Pey: pendiente de credenciales.');
});
