// Comisiones reales de pasarela en el dashboard. Ejecutar: node --test tests/gateway-fee.test.mjs
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
  slice('function orderGateway', 'function netRev') ,
  slice('function ppDetailsFromOrders', 'async function ppLoadFromWooOrders'),
  'this.api = { orderGateway, gatewayFee, ppDetailsFromOrders };',
].join('\n');
const context = {};
vm.runInNewContext(code, context);
const { orderGateway, gatewayFee, ppDetailsFromOrders } = context.api;

test('la pasarela se toma del plugin y, si falta, del título del método', () => {
  assert.equal(orderGateway({ gateway: 'paypal', payment_method: 'Tarjeta de crédito' }), 'paypal');
  assert.equal(orderGateway({ payment_method: 'PayPal' }), 'paypal');
  assert.equal(orderGateway({ payment_method: 'Stripe (card)' }), 'stripe');
  assert.equal(orderGateway({ payment_method: 'Transferencia' }), '');
});

test('la comisión guardada se usa tal cual; sin dato se estima y se marca', () => {
  assert.deepEqual({ ...gatewayFee({ total: 50, gateway_fee: 1.75 }) }, { fee: 1.75, real: true });
  assert.deepEqual({ ...gatewayFee({ total: 50, gateway_fee: 0 }) }, { fee: 0, real: true });
  const estimated = gatewayFee({ total: 40, gateway_fee: null });
  assert.equal(estimated.real, false);
  assert.ok(Math.abs(estimated.fee - (40 * 0.029 + 0.30)) < 1e-9);
  assert.equal(gatewayFee({ total: 40 }).real, false);
});

test('PayPal desde WooCommerce: comisión real, nunca estimada, y sólo pedidos que cuentan', () => {
  const orders = [
    { id: 1, number: '#1', gateway: 'paypal', status: 'completed', total: 24, gateway_fee: 1.6, date: '2026-11-10T19:49:55+00:00', country_code: 'PE', customer_email: 'a@x.com' },
    { id: 2, number: '#2', gateway: 'paypal', status: 'completed', total: 40, gateway_fee: null, date: '2026-11-09T10:00:00+00:00' },
    { id: 3, number: '#3', gateway: 'stripe', status: 'completed', total: 50, gateway_fee: 1.75, date: '2026-11-09T10:00:00+00:00' },
    { id: 4, number: '#4', gateway: 'paypal', status: 'cancelled', total: 30, gateway_fee: null, date: '2026-11-09T10:00:00+00:00' },
    { id: 5, number: '#5', gateway: 'paypal', status: 'on-hold', total: 30, gateway_fee: null, counts_in_analytics: false, date: '2026-11-09T10:00:00+00:00' },
  ];
  const { details, withoutFee } = ppDetailsFromOrders(orders);
  assert.equal(details.length, 2);
  assert.equal(withoutFee, 1);
  assert.equal(details[0].transaction_info.transaction_amount.value, 24);
  assert.equal(details[0].transaction_info.fee_amount.value, 1.6);
  assert.equal(details[0].transaction_info.transaction_event_code, 'T0006');
  assert.equal(details[1].transaction_info.fee_amount.value, 0);
});
