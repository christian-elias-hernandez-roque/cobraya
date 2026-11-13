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
    // numRef: referencia única de la venta. Se manda a Pey al crear el cobro
    // y Pey la devuelve en el webhook, así se sabe qué venta se pagó.
    numRef: 'CB-' + Date.now().toString(36).toUpperCase(),
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
async function crearCobroReal(_venta) {
  throw new Error(
    'Integración Pey pendiente: faltan las credenciales (API key). ' +
    'Ver README.md, sección "Estado actual".'
  );
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
      const venta = nuevaVenta(monto, concepto);
      // TODO PEY: aquí se llamaría a crearCobroReal(venta) y se guardaría
      // el QR real en la venta antes de responder al cliente.
      return json(201, { venta, demo: true });
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
      const payload = await leerBody(req);
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
  console.log('Modo: demostración (QR demo). Integración Pey: pendiente de credenciales.');
});
