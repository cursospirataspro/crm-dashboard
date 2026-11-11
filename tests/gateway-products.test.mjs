// Cursos por pasarela: cada vista sólo suma lo suyo. Ejecutar: node --test tests/gateway-products.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/app.js', import.meta.url), 'utf8');
function slice(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `no se encontró el bloque ${startMarker}`);
  return source.slice(start, end);
}

const code = [
  'const statusNorm = s => String(s || "").replace(/^wc-/, "");',
  slice('const WOO_ANALYTICS_REVENUE_STATUSES', 'function validRevenueOrders'),
  slice('function orderGateway', 'function renderGatewayProducts'),
  slice('function ppDetailsFromOrders', 'function ppRenderProducts'),
  'this.api = { orderGateway, gatewayProductStats, ppDetailsFromOrders };',
].join('\n');
const context = {};
vm.runInNewContext(code, context);
const { orderGateway, gatewayProductStats, ppDetailsFromOrders } = context.api;

const orders = [
  { id: 1, gateway: 'stripe', status: 'completed', total: 50, gateway_fee: 2, products: [{ name: 'Curso A', total: 30, quantity: 1 }, { name: 'Curso B', total: 20, quantity: 1 }] },
  { id: 2, gateway: 'stripe', status: 'completed', total: 40, gateway_fee: null, products: [{ name: 'Curso A', total: 40, quantity: 1 }] },
  { id: 3, gateway: 'paypal', status: 'completed', total: 24, gateway_fee: 1.6, products: [{ name: 'Curso A', total: 24, quantity: 1 }] },
  { id: 4, gateway: 'paypal', status: 'completed', total: 30, gateway_fee: 1.9, products: [{ name: 'Curso C', total: 30, quantity: 2 }] },
  { id: 5, gateway: 'paypal', status: 'cancelled', total: 99, gateway_fee: null, products: [{ name: 'Curso A', total: 99, quantity: 1 }] },
];
// Array.from crea la lista en este contexto (las filas vienen del contexto vm).
const plain = rows => Array.from(rows, r => ({ name: r.name, gross: +r.gross.toFixed(2), fee: +r.fee.toFixed(2), net: +r.net.toFixed(2), qty: r.qty, estimated: r.estimated }));

test('Stripe: sólo cursos de pedidos Stripe; la comisión se reparte por importe', () => {
  const stripe = orders.filter(o => orderGateway(o) === 'stripe');
  const rows = plain(gatewayProductStats(stripe));
  const est = 40 * 0.029 + 0.30;
  assert.deepEqual(rows, [
    { name: 'Curso A', gross: 70, fee: +(1.2 + est).toFixed(2), net: +(70 - 1.2 - est).toFixed(2), qty: 2, estimated: true },
    { name: 'Curso B', gross: 20, fee: 0.8, net: 19.2, qty: 1, estimated: false },
  ]);
  assert.ok(!rows.some(r => r.name === 'Curso C'), 'un curso vendido sólo por PayPal no aparece en Stripe');
});

test('PayPal: sólo cursos de pedidos PayPal que cuentan; nada de Stripe ni cancelados', () => {
  const { orders: paypal } = ppDetailsFromOrders(orders);
  assert.deepEqual([...paypal.map(o => o.id)], [3, 4]);
  const rows = plain(gatewayProductStats(paypal));
  assert.deepEqual(rows, [
    { name: 'Curso C', gross: 30, fee: 1.9, net: 28.1, qty: 2, estimated: false },
    { name: 'Curso A', gross: 24, fee: 1.6, net: 22.4, qty: 1, estimated: false },
  ]);
});

test('la vista Stripe usa los filtros generales: no tiene periodo ni buscador propios', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const id of ['stripeSource', 'stripeDatePreset', 'stripeRefreshBtn', 'stripeSearch']) {
    assert.ok(!html.includes(`id="${id}"`), `${id} no debe existir en index.html`);
    assert.ok(!source.includes(`#${id}`), `${id} no debe usarse en app.js`);
  }
  const body = slice('function renderStripeView', '// KPIs');
  assert.match(body, /stripeViewOrders\(state\.filtered\)/);
  assert.ok(!body.includes('state.orders'), 'no debe leer pedidos fuera del filtro general');
});

test('la vista PayPal usa los filtros generales: no tiene fechas ni buscador propios', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const id of ['ppDatePreset', 'paypalFrom', 'paypalTo', 'paypalLoadBtn', 'ppSearch']) {
    assert.ok(!html.includes(`id="${id}"`), `${id} no debe existir en index.html`);
    assert.ok(!source.includes(`"${id}"`), `${id} no debe usarse en app.js`);
  }
  const body = slice('function ppRenderFromWoo', 'function renderPaypalView');
  assert.match(body, /ppDetailsFromOrders\(state\.filtered/);
  assert.ok(!source.includes('fetchWooOrdersRange'), 'no debe pedir un rango propio a WooCommerce');
});

test('la suma por curso de cada pasarela es igual al total de esa pasarela', () => {
  for (const gateway of ['stripe', 'paypal']) {
    const own = orders.filter(o => orderGateway(o) === gateway && o.status === 'completed');
    const rows = gatewayProductStats(own);
    const gross = rows.reduce((s, r) => s + r.gross, 0);
    assert.equal(+gross.toFixed(2), own.reduce((s, o) => s + o.total, 0));
  }
});
