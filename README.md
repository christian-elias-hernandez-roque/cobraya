# CobraYa — Cobro CoDi en 3 toques para tianguis y negocios de barrio

Hackatón México 2026 · Postulación: 10 dic 2026 · Entrega: 12 dic 2026

Un vendedor pone el monto, genera un QR por esa venta, el cliente paga desde su
app bancaria y la pantalla se pone verde: "Pago recibido". La venta queda guardada
sola. Sin instalar nada, desde el navegador del celular, sin terminal.

## Cómo funciona
1. Escribe el monto (botones rápidos $20 / $50 / $100 / $100, editables).
2. Toca "Generar QR": un QR nuevo por venta, con monto y concepto.
3. El cliente escanea y paga; confirmación automática y lista de ventas del día.

## Estado actual
- Esqueleto web funcional (JavaScript + Node.js, HTML/CSS): teclado de monto,
  QR por venta, botón demo "Simular pago recibido" y lista de ventas del día.
- El QR actual es de demostración. La integración real con la API de Pey
  (cobro CoDi + confirmación por webhook) está pendiente de las credenciales,
  que se piden en el arranque del hackatón el sábado 14 nov 2026.
- Las credenciales nunca van en el código del celular: solo las usa el servidor.

## Pantallas
Cobrar · QR de la venta · Pago recibido · Pago no confirmado · Ventas de hoy ·
Acceso del vendedor.

## Fuera del MVP (a propósito)
Doble toque al botón de apagado (lo controla el sistema operativo, no se promete),
app nativa, inventario y facturación.
