// CobraYa — cliente (corre en el navegador del celular del vendedor).
// No lleva credenciales: la API key de Pey solo la usa el servidor (server.js).
// El QR de aquí es de DEMOSTRACIÓN. La integración real va en el servidor:
//   POST https://api.pey.mx/codi/qr  +  webhook de confirmación.

const LS_RAPIDOS = 'cobraya-montos-rapidos';
const RAPIDOS_DEFAULT = [20, 50, 100, 100];

let montoTexto = '';
let ventaActual = null;
let sondeoActual = null;

function pararSondeo() {
  if (sondeoActual) {
    clearInterval(sondeoActual);
    sondeoActual = null;
  }
}

const $ = (id) => document.getElementById(id);

// --- Montos rápidos: cada botón es editable por separado y se guarda ---
function cargarRapidos() {
  try {
    const guardados = JSON.parse(localStorage.getItem(LS_RAPIDOS));
    if (Array.isArray(guardados) && guardados.length === 4) return guardados;
  } catch { /* usar valores por defecto */ }
  return [...RAPIDOS_DEFAULT];
}

function guardarRapidos(valores) {
  localStorage.setItem(LS_RAPIDOS, JSON.stringify(valores));
}

function mostrarRapidos() {
  const valores = cargarRapidos();
  const cont = $('rapidos');
  cont.innerHTML = '';
  valores.forEach((valor, i) => {
    const celda = document.createElement('div');
    celda.className = 'rapido';
    const btn = document.createElement('button');
    btn.className = 'btn-rapido';
    btn.textContent = `$${valor}`;
    btn.addEventListener('click', () => {
      montoTexto = String(valor);
      mostrarMonto();
    });
    const editar = document.createElement('button');
    editar.className = 'btn-editar';
    editar.textContent = 'Editar';
    editar.addEventListener('click', () => editarRapido(i, celda));
    celda.appendChild(btn);
    celda.appendChild(editar);
    cont.appendChild(celda);
  });
}

function editarRapido(i, celda) {
  const valores = cargarRapidos();
  const input = document.createElement('input');
  input.type = 'number';
  input.min = '1';
  input.value = valores[i];
  input.className = 'input-editar';
  input.setAttribute('aria-label', `Editar monto rápido ${i + 1}`);
  const guardar = () => {
    const nuevo = Math.round(Number(input.value));
    if (nuevo > 0) {
      valores[i] = nuevo;
      guardarRapidos(valores);
    }
    mostrarRapidos();
  };
  input.addEventListener('blur', guardar);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur();
    if (e.key === 'Escape') mostrarRapidos();
  });
  celda.querySelector('.btn-rapido').replaceWith(input);
  input.focus();
  input.select();
}

// --- Teclado de monto ---
function mostrarMonto() {
  $('monto-display').textContent = '$' + (montoTexto === '' ? '0' : montoTexto);
}

$('teclado').addEventListener('click', (e) => {
  const tecla = e.target.dataset.tecla;
  if (!tecla) return;
  if (tecla === 'borrar') {
    montoTexto = montoTexto.slice(0, -1);
  } else if (tecla === '.') {
    if (!montoTexto.includes('.')) montoTexto += '.';
  } else if (montoTexto.replace('.', '').length < 7) {
    montoTexto += tecla;
  }
  mostrarMonto();
});

// --- Cambio de pantalla ---
function mostrarPantalla(id) {
  document.querySelectorAll('.pantalla').forEach((p) => p.classList.add('oculta'));
  $(id).classList.remove('oculta');
  window.scrollTo(0, 0);
}

// --- QR de demostración: patrón fijo por venta, NO es un QR real ---
// (Con Pey real, aquí se mostraría el QR que devuelve POST /codi/qr.)
function dibujarQrDemo(semilla) {
  const canvas = $('qr-canvas');
  const ctx = canvas.getContext('2d');
  const modulos = 21;
  const tam = canvas.width / modulos;
  let estado = 0;
  for (const c of String(semilla)) estado = (estado * 31 + c.charCodeAt(0)) >>> 0;
  const aleatorio = () => {
    estado = (estado * 1664525 + 1013904223) >>> 0;
    return estado / 4294967296;
  };
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000';
  const enEsquina = (x, y) =>
    (x < 7 && y < 7) || (x >= modulos - 7 && y < 7) || (x < 7 && y >= modulos - 7);
  for (let y = 0; y < modulos; y++) {
    for (let x = 0; x < modulos; x++) {
      if (enEsquina(x, y)) continue;
      if (aleatorio() > 0.5) ctx.fillRect(x * tam, y * tam, tam, tam);
    }
  }
  // Marcadores de esquina (como un QR real, pero el contenido es inventado).
  const esquina = (ox, oy) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(ox * tam, oy * tam, 7 * tam, 7 * tam);
    ctx.fillStyle = '#fff';
    ctx.fillRect((ox + 1) * tam, (oy + 1) * tam, 5 * tam, 5 * tam);
    ctx.fillStyle = '#000';
    ctx.fillRect((ox + 2) * tam, (oy + 2) * tam, 3 * tam, 3 * tam);
  };
  esquina(0, 0);
  esquina(modulos - 7, 0);
  esquina(0, modulos - 7);
}

// --- QR real de Pey: imagen si es data:image/..., texto si es cadena CoDi ---
// El formato exacto se decide con la respuesta 201 real (ver respuestaPey).
function mostrarQrReal(qr) {
  const canvas = $('qr-canvas');
  const img = $('qr-real');
  const texto = $('qr-texto');
  if (typeof qr === 'string' && qr.startsWith('data:image')) {
    img.src = qr;
    img.classList.remove('oculta');
    canvas.classList.add('oculta');
    texto.textContent = '';
  } else if (typeof qr === 'string' && qr.length > 0) {
    canvas.classList.add('oculta');
    img.classList.add('oculta');
    texto.textContent = qr;
  } else {
    // Pey no devolvió QR visible: se deja el QR demo como respaldo visual
    // y el cobro sigue siendo real (codiQrId quedó guardado en el servidor).
    dibujarQrDemo(ventaActual ? ventaActual.numRef : 'cobraya');
  }
}

function mostrarQrDemo(semilla) {
  $('qr-canvas').classList.remove('oculta');
  $('qr-real').classList.add('oculta');
  $('qr-texto').textContent = '';
  dibujarQrDemo(semilla);
}

// --- Flujo de venta ---
$('btn-generar-qr').addEventListener('click', async () => {
  const monto = parseFloat(montoTexto);
  if (!monto || monto <= 0) {
    alert('Escribe un monto primero.');
    return;
  }
  const concepto = $('concepto').value.trim();
  const res = await fetch('/api/ventas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ monto, concepto }),
  });
  if (!res.ok) {
    alert('No se pudo crear la venta. Inténtalo de nuevo.');
    return;
  }
  const { venta, modo } = await res.json();
  ventaActual = venta;
  $('qr-monto').textContent = `$${venta.monto} MXN`;
  $('qr-concepto').textContent = venta.concepto ? `Concepto: ${venta.concepto}` : 'Sin concepto';
  // Si Pey devolvió un QR real, mostrarlo; si no, seguir con el QR demo.
  if (modo === 'real' && venta.qrReal) {
    mostrarQrReal(venta.qrReal);
    $('btn-simular-pago').style.display = 'none'; // con Pey real no se simula
    $('aviso-demo').style.display = 'none';
  } else {
    mostrarQrDemo(venta.numRef);
    $('btn-simular-pago').style.display = '';
    $('aviso-demo').style.display = '';
  }
  mostrarPantalla('pantalla-qr');
  // Sondeo: cada 3 s preguntar si esta venta ya se pagó (webhook).
  pararSondeo();
  sondeoActual = setInterval(async () => {
    try {
      const r = await fetch('/api/ventas');
      const { ventas } = await r.json();
      const actual = ventas.find((v) => v.id === ventaActual?.id);
      if (!actual) return;
      if (actual.estado === 'pagado') {
        pararSondeo();
        $('recibido-monto').textContent = `$${actual.monto} MXN`;
        $('recibido-concepto').textContent = actual.concepto ? `Concepto: ${actual.concepto}` : '';
        ventaActual = null;
        mostrarPantalla('pantalla-recibido');
      }
    } catch { /* reintentar en el siguiente sondeo */ }
  }, 3000);
});

// SOLO DEMO: con Pey real este botón no existe; la pantalla verde llega sola
// cuando el webhook de Pey confirma el pago.
$('btn-simular-pago').addEventListener('click', async () => {
  if (!ventaActual) return;
  const res = await fetch(`/api/ventas/${ventaActual.id}/confirmar`, { method: 'POST' });
  if (!res.ok) {
    alert('No se pudo confirmar la venta.');
    return;
  }
  const { venta } = await res.json();
  pararSondeo();
  $('recibido-monto').textContent = `$${venta.monto} MXN`;
  $('recibido-concepto').textContent = venta.concepto ? `Concepto: ${venta.concepto}` : '';
  ventaActual = null;
  mostrarPantalla('pantalla-recibido');
});

$('btn-cancelar-venta').addEventListener('click', async () => {
  pararSondeo();
  if (ventaActual) {
    await fetch(`/api/ventas/${ventaActual.id}/no-confirmado`, { method: 'POST' });
    ventaActual = null;
  }
  mostrarPantalla('pantalla-no-confirmado');
});

function nuevaVenta() {
  pararSondeo();
  montoTexto = '';
  $('concepto').value = '';
  mostrarMonto();
  mostrarPantalla('pantalla-cobrar');
}

$('btn-nueva-venta').addEventListener('click', nuevaVenta);
$('btn-reintentar').addEventListener('click', nuevaVenta);

// --- Ventas de hoy ---
async function cargarVentasHoy() {
  const res = await fetch('/api/ventas');
  const { ventas } = await res.json();
  const lista = $('lista-ventas');
  lista.innerHTML = '';
  const pagadas = ventas.filter((v) => v.estado === 'pagado');
  const total = pagadas.reduce((s, v) => s + v.monto, 0);
  $('total-hoy').textContent =
    `Total cobrado hoy: $${total} MXN · ${pagadas.length} venta(s) pagada(s)`;
  if (ventas.length === 0) {
    lista.innerHTML = '<li class="vacia">Todavía no hay ventas hoy.</li>';
  }
  ventas.slice().reverse().forEach((v) => {
    const li = document.createElement('li');
    const estado = v.estado === 'pagado' ? '✅ Pagado'
      : v.estado === 'no-confirmado' ? '❌ No confirmado' : '⏳ Pendiente';
    li.textContent = `$${v.monto} MXN — ${v.concepto || 'Sin concepto'} — ${estado}`;
    lista.appendChild(li);
  });
  mostrarPantalla('pantalla-ventas');
}

$('btn-ver-ventas').addEventListener('click', cargarVentasHoy);
$('btn-ventas-desde-recibido').addEventListener('click', cargarVentasHoy);
$('btn-ventas-desde-noconfirmado').addEventListener('click', cargarVentasHoy);
$('btn-volver-cobrar').addEventListener('click', () => mostrarPantalla('pantalla-cobrar'));

// Inicio: abre directo en el teclado de monto.
mostrarRapidos();
mostrarMonto();
