// Prueba de la conexión en un clic (#cpp_connect=...). Ejecutar: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/app.js', import.meta.url), 'utf8');
const start = source.indexOf('const CPP_CONNECT_ALLOWED_HOSTS');
const end = source.indexOf('const CONFIG = (function()');
assert.ok(start > 0 && end > start, 'no se encontró el bloque de conexión');
const block = source.slice(start, end);

function encode(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function run(hash, stored = null) {
  const store = new Map(stored ? [['cpp_crm_config', JSON.stringify(stored)]] : []);
  const replaced = [];
  const context = {
    location: { hash, pathname: '/crm-dashboard/', search: '' },
    history: { replaceState: (_s, _t, url) => replaced.push(url) },
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    URL, JSON, String,
  };
  vm.runInNewContext(block + '\nthis.result = _cppConnectResult;', context);
  return { result: context.result, config: store.has('cpp_crm_config') ? JSON.parse(store.get('cpp_crm_config')) : null, replaced };
}

const token = 'a'.repeat(64);
const good = { url: 'https://cursospiratasprooficial.com/wp-json/cpp-crm-dashboard/v1', token };

test('sin fragmento no cambia nada', () => {
  const out = run('', { url: 'x', token: 'y', currency: 'PEN' });
  assert.equal(out.result, null);
  assert.deepEqual(out.config, { url: 'x', token: 'y', currency: 'PEN' });
  assert.equal(out.replaced.length, 0);
});

test('fragmento válido guarda la conexión, conserva la moneda y limpia la URL', () => {
  const out = run('#cpp_connect=' + encode(good), { url: 'https://cursospirataspro.com/wp-json/cpp-crm-dashboard/v1', token: 'viejo', currency: 'PEN' });
  assert.equal(out.result, 'cursospiratasprooficial.com');
  assert.deepEqual(out.config, { ...good, currency: 'PEN' });
  assert.deepEqual(out.replaced, ['/crm-dashboard/']);
});

test('se rechazan tiendas ajenas, http, rutas distintas y tokens cortos', () => {
  const previous = { url: 'https://cursospirataspro.com/wp-json/cpp-crm-dashboard/v1', token: 'viejo', currency: 'USD' };
  const bad = [
    { ...good, url: 'https://atacante.example/wp-json/cpp-crm-dashboard/v1' },
    { ...good, url: 'https://cursospiratasprooficial.com.atacante.example/wp-json/cpp-crm-dashboard/v1' },
    { ...good, url: 'http://cursospiratasprooficial.com/wp-json/cpp-crm-dashboard/v1' },
    { ...good, url: 'https://cursospiratasprooficial.com/wp-json/otra/v1' },
    { ...good, url: 'https://cursospiratasprooficial.com/wp-json/cpp-crm-dashboard/v1?x=1' },
    { ...good, token: 'corto' },
  ];
  for (const item of bad) {
    const out = run('#cpp_connect=' + encode(item), previous);
    assert.equal(out.result, 'rejected');
    assert.deepEqual(out.config, previous);
    assert.equal(out.replaced.length, 1, 'el fragmento se limpia igual');
  }
  const garbage = run('#cpp_connect=no-es-json', previous);
  assert.equal(garbage.result, 'rejected');
  assert.deepEqual(garbage.config, previous);
});
