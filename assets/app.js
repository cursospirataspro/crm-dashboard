// =============================================================
// CONFIG — Cambiar mode:"api" y completar datos para producción
// =============================================================
let _pushLastOrderIds = new Set();
let _pushEnabled = false;

const CONFIG = {
  mode:       "demo",   // "demo" | "api"
  apiBaseUrl: "https://tudominio.com/wp-json/cpp-crm-dashboard/v1",
  apiToken:   "TOKEN_LARGO_Y_SEGURO",
  currency:   "USD"
};

// Tasas de cambio base vs USD (actualización manual o via API gratuita)
const FX_RATES = { USD:1, EUR:0.92, PEN:3.77, COP:4020, MXN:17.2, ARS:870 };
let DISPLAY_CURRENCY = (function() {
  try { return localStorage.getItem('crm_currency') || 'USD'; } catch(e) { return 'USD'; }
})();

const _origFmtMoney = v => {
  const rate   = FX_RATES[DISPLAY_CURRENCY] || 1;
  const amount = Number(v || 0) * (rate / (FX_RATES[CONFIG.currency] || 1));
  return new Intl.NumberFormat("es-PE", { style:"currency", currency: DISPLAY_CURRENCY, maximumFractionDigits:2 })
    .format(amount);
};

// =============================================================
// PAÃ¯Â¿Â½Ã‚ÂSES (lat/lon para el globo 3D)
// =============================================================
const COUNTRIES = [
  { code:"PE", name:"Perú",                lat: -9.19, lon: -75.02, cities:["Lima","Iquitos","Arequipa","Trujillo","Cusco"] },
  { code:"CO", name:"Colombia",            lat:  4.57, lon: -74.29, cities:["Bogotá","Medellín","Cali","Barranquilla"] },
  { code:"MX", name:"México",              lat: 23.63, lon:-102.55, cities:["Ciudad de México","Guadalajara","Monterrey","Puebla"] },
  { code:"EC", name:"Ecuador",             lat: -1.83, lon: -78.18, cities:["Quito","Guayaquil","Cuenca"] },
  { code:"CL", name:"Chile",               lat:-35.67, lon: -71.54, cities:["Santiago","Valparaíso","Concepción"] },
  { code:"AR", name:"Argentina",           lat:-38.42, lon: -63.62, cities:["Buenos Aires","Córdoba","Rosario"] },
  { code:"ES", name:"España",              lat: 40.46, lon:  -3.75, cities:["Madrid","Barcelona","Valencia","Sevilla"] },
  { code:"US", name:"Estados Unidos",      lat: 37.09, lon: -95.71, cities:["Miami","New York","Los Ã¯Â¿Â½Ã‚Ângeles","Houston"] },
  { code:"BO", name:"Bolivia",             lat:-16.29, lon: -63.59, cities:["La Paz","Santa Cruz","Cochabamba"] },
  { code:"DO", name:"República Dominicana",lat: 18.74, lon: -70.16, cities:["Santo Domingo","Santiago"] },
  { code:"VE", name:"Venezuela",           lat:  6.42, lon: -66.59, cities:["Caracas","Valencia","Maracaibo"] },
  { code:"CR", name:"Costa Rica",          lat:  9.75, lon: -83.75, cities:["San José","Alajuela"] }
];

// =============================================================
// ESTADO GLOBAL
// =============================================================
const state = {
  orders:   [],
  filtered: [],
  loading:  false,
  selectedCountry: "all",
  globe: {
    rotationX: -10, rotationY: -35, zoom: 1,
    autoRotate: true, dragging: false, lastX: 0, lastY: 0,
    points: [], projectedPoints: []
  }
};

// =============================================================
// UTILIDADES
// =============================================================
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

const fmtMoney = v => _origFmtMoney(v);

const fmtDate = v =>
  new Intl.DateTimeFormat("es-PE", { year:"numeric", month:"short", day:"2-digit" })
    .format(new Date(v));

const statusNorm = s => String(s || "").replace(/^wc-/, "").toLowerCase();

function esc(v) {
  return String(v ?? "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}

function empty(t) {
  return `<div style="color:var(--muted);padding:20px;text-align:center;font-size:14px">${esc(t)}</div>`;
}

function toast(msg, type = "info") {
  const el = $("#toast");
  el.textContent = msg;
  el.className   = `toast show ${type}`;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove("show"), 3200);
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function setLoading(loading) {
  state.loading = loading;
  const btn = $("#refreshBtn");
  btn.disabled    = loading;
  btn.textContent = loading ? "Cargando…" : "Actualizar";
  $("#kpiGrid").classList.toggle("loading-pulse", loading);
}

// =============================================================
// DATOS DEMO — Clientes y cursos reales extraídos del historial
// =============================================================
function weightedCountry() {
  const pool = ["PE","PE","PE","PE","CO","CO","MX","MX","EC","CL","AR","ES","US","BO","DO","VE","CR"];
  return COUNTRIES.find(c => c.code === pool[Math.floor(Math.random() * pool.length)]) || COUNTRIES[0];
}

function demoOrders() {
  // Cursos reales del negocio
  const courses = [
    "Academia del Sensei 2024",
    "Proyecto Sensei 2.0",
    "Bootcamp AlexG",
    "Taller Intensivo de Mayo",
    "Taller de Septiembre",
    "Jesús Mora (Octubre 2024)",
    "Jesús (Noviembre 2024)",
    "Jesús (Diciembre 2024)",
    "Pro Trader 2.0",
    "Daniel Curto Footprint",
    "Felipe López",
    "Price Action",
    "Pako Thawani",
    "Victor Coll",
    "Titanes del Trading",
    "Adrianus",
    "Mauro Stendel",
    "Luigi V"
  ];

  // Clientes reales extraídos del historial de descargas
  const realCustomers = [
    { name: "Onel Caruci",                  email: "onelcaruci@gmail.com" },
    { name: "Alex Vera",                     email: "alexvera042@gmail.com" },
    { name: "skyx fraan",                    email: "skee8927@gmail.com" },
    { name: "ppabloool",                     email: "bickmongy22@gmail.com" },
    { name: "Anyelo Hernández",              email: "anyelohernandeztrader@gmail.com" },
    { name: "Alma Alvarez",                  email: "amaalvarez24.aa@gmail.com" },
    { name: "Iker C.",                       email: "ikerc.c05@gmail.com" },
    { name: "Josué Colomina",               email: "iosuecolominacortes@gmail.com" },
    { name: "Pool Pastor",                   email: "pool.pastor@gmail.com" },
    { name: "Federico Gladich",              email: "federicogladich@gmail.com" },
    { name: "Mauricio Zalamea",              email: "mzalamea@gmail.com" },
    { name: "Luis Gabriel VP",               email: "lzvalenciaperez@gmail.com" },
    { name: "Andrés Hernández",              email: "andreshernandez970425@gmail.com" },
    { name: "Ramiro Rodríguez",              email: "ramirorodriguez1703@gmail.com" },
    { name: "Edinson",                       email: "edinson50k@gmail.com" },
    { name: "Gabriel Oddone",                email: "gabrieloddonelopez@gmail.com" },
    { name: "City Condado",                  email: "citycondado7@gmail.com" },
    { name: "llani818",                      email: "llani818@gmail.com" },
    { name: "jean_carlos_mandon",            email: "jean.carlos.mandon@gmail.com" },
    { name: "Martín Rodríguez",              email: "martin.rodriguez.trader@gmail.com" },
    { name: "miguelangelpaam",               email: "miguelangelpaam@gmail.com" },
    { name: "sebast_rade",                   email: "sebast.rade@gmail.com" },
    { name: "Edgar Jiménez",                 email: "edgarjimenez09@gmail.com" }
  ];

  const statuses = ["completed","processing","pending","refunded","cancelled"];
  const payments = ["Stripe","PayPal","Yape","Transferencia","Mercado Pago"];
  const rand     = a => a[Math.floor(Math.random() * a.length)];
  const list     = [];
  const now      = new Date();

  // Generar pedidos basados en clientes reales (cada cliente puede tener varios pedidos)
  for (let i = 0; i < 420; i++) {
    const customer = realCustomers[i % realCustomers.length];
    const country  = weightedCountry();
    const date     = new Date(now);
    date.setDate(now.getDate() - Math.floor(Math.random() * 365));
    const qty      = Math.random() > 0.82 ? 2 : 1;
    const selected = Array.from({ length: qty }, () => rand(courses));
    const total    = selected.reduce(s => s + (35 + Math.floor(Math.random() * 230)), 0);
    const status   = Math.random() > 0.82 ? rand(statuses) : rand(["completed","processing","completed"]);
    list.push({
      id: 21000 + i, number: "#" + (21000 + i),
      date:           date.toISOString(),
      customer:       customer.name,
      customer_email: customer.email,
      status, total,
      payment_method: rand(payments),
      country_code:   country.code,
      country:        country.name,
      city:           rand(country.cities),
      latitude:       country.lat,
      longitude:      country.lon,
      products:       selected.map(n => ({ name: n, quantity: 1, total: total / selected.length }))
    });
  }
  return list.sort((a, b) => new Date(b.date) - new Date(a.date));
}

// =============================================================
// API (modo real)
// =============================================================
async function fetchApi(r) {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 30000);
  try {
    const base = CONFIG.apiBaseUrl.replace(/\/$/, "") + "/overview";
    let allOrders = [];
    let page = 1;
    let totalPages = 1;

    do {
      const url = new URL(base);
      url.searchParams.set("from",  r.fromISO);
      url.searchParams.set("to",    r.toISO);
      url.searchParams.set("page",  String(page));
      url.searchParams.set("limit", "500");

      const res = await fetch(url, {
        headers: { "X-CPP-CRM-Dashboard-Token": CONFIG.apiToken },
        signal:  controller.signal
      });
      if (!res.ok) throw new Error(`Error API ${res.status}: ${res.statusText}`);
      const data = await res.json();

      allOrders = allOrders.concat(Array.isArray(data.orders) ? data.orders : []);
      totalPages = data.total_pages || 1;

      // Mostrar progreso si hay múltiples páginas
      if (totalPages > 1) {
        const pct = Math.round((page / totalPages) * 100);
        const lbl = document.getElementById("modeLabel");
        if (lbl) lbl.textContent = `Cargando datos... ${pct}% (${allOrders.length} / ${data.total_orders || "?"} pedidos)`;
      }

      page++;
    } while (page <= totalPages);

    return allOrders;
  } finally {
    clearTimeout(tid);
  }
}

// =============================================================
// RANGO DE FECHAS (sin desfase de zona horaria)
// =============================================================
function range() {
  const preset = $("#rangePreset").value;
  const now    = new Date();
  let from, to;

  const startOf = (d, unit) => {
    const r = new Date(d);
    if (unit === "month")   { r.setDate(1); }
    if (unit === "quarter") { r.setMonth(Math.floor(r.getMonth()/3)*3, 1); }
    if (unit === "year")    { r.setMonth(0, 1); }
    r.setHours(0, 0, 0, 0);
    return r;
  };

  if (preset === "custom") {
    from = $("#fromDate").value ? new Date($("#fromDate").value + "T00:00:00") : new Date(now - 30*86400000);
    to   = $("#toDate").value   ? new Date($("#toDate").value   + "T23:59:59") : new Date(now);
  } else if (preset === "0") {
    from = new Date(now); from.setHours(0,0,0,0);
    to   = new Date(now); to.setHours(23,59,59,999);
  } else if (preset === "1") {
    from = new Date(now - 86400000); from.setHours(0,0,0,0);
    to   = new Date(now - 86400000); to.setHours(23,59,59,999);
  } else if (preset === "thismonth") {
    from = startOf(now, "month");
    to   = new Date(now); to.setHours(23,59,59,999);
  } else if (preset === "lastmonth") {
    const lm = new Date(now); lm.setDate(0);
    from = startOf(lm, "month");
    to   = new Date(lm); to.setHours(23,59,59,999);
  } else if (preset === "thisquarter") {
    from = startOf(now, "quarter");
    to   = new Date(now); to.setHours(23,59,59,999);
  } else if (preset === "lastquarter") {
    const lq = new Date(now); lq.setMonth(Math.floor(lq.getMonth()/3)*3 - 1, 1);
    from = startOf(lq, "quarter");
    const eq = new Date(from); eq.setMonth(eq.getMonth()+3, 0); eq.setHours(23,59,59,999);
    to = eq;
  } else if (preset === "thisyear") {
    from = startOf(now, "year");
    to   = new Date(now); to.setHours(23,59,59,999);
  } else if (preset === "lastyear") {
    from = new Date(now.getFullYear()-1, 0, 1, 0, 0, 0);
    to   = new Date(now.getFullYear()-1, 11, 31, 23, 59, 59);
  } else if (preset === "all") {
    from = new Date(now.getFullYear() - 5, 0, 1, 0, 0, 0); // máximo 5 años atrás
    to   = new Date(now); to.setHours(23,59,59,999);
  } else {
    from = new Date(now - Number(preset) * 86400000); from.setHours(0,0,0,0);
    to   = new Date(now); to.setHours(23,59,59,999);
  }
  return { from, to, fromISO: localDateStr(from), toISO: localDateStr(to) };
}

// =============================================================
// CARGA DE DATOS
// =============================================================
async function load() {
  setLoading(true);
  const r = range();
  try {
    if (CONFIG.mode === "api") {
      state.orders = await fetchApi(r);
      $("#modeLabel").textContent = "WooCommerce API";
      toast("Datos reales cargados desde WooCommerce", "success");
      // Sincronizar pedidos completados → GA4 (solo los que no se han enviado antes)
      syncOrdersToGA4(state.orders).catch(() => {});
    } else {
      state.orders = demoOrders();
      $("#modeLabel").textContent = "Modo demo";
      toast("CRM cargado con datos demo");
    }
  } catch (e) {
    console.error("Error al cargar datos:", e);
    state.orders = demoOrders();
    $("#modeLabel").textContent = "Modo demo (respaldo)";
    toast("Sin conexión a la API — se cargaron datos demo.", "error");
  } finally {
    setLoading(false);
  }
  $("#lastSync").textContent = "Actualizado: " + new Date().toLocaleString("es-PE");
  populateCountries();
  applyFilters();
}

// =============================================================
// FILTROS
// =============================================================
function populateCountries() {
  const sel     = $("#countryFilter");
  const current = sel.value || "all";
  const countries = [
    ...new Map(
      state.orders.map(o => [o.country_code || o.country,
        { code: o.country_code || o.country, name: o.country || o.country_code }])
    ).values()
  ].filter(x => x.code).sort((a, b) => String(a.name).localeCompare(String(b.name)));

  sel.innerHTML = `<option value="all">Todos</option>` +
    countries.map(c => `<option value="${esc(c.code)}">${esc(c.name)}</option>`).join("");
  sel.value = countries.some(c => c.code === current) ? current : "all";
}

function applyFilters() {
  const r       = range();
  const st      = $("#statusFilter").value;
  const country = $("#countryFilter").value;
  const term    = $("#searchInput").value.trim().toLowerCase();

  state.selectedCountry = country;
  state.filtered = state.orders.filter(o => {
    const d   = new Date(o.date);
    const hay = [o.number, o.customer, o.customer_email, o.status, o.payment_method,
                 o.country, o.country_code, o.city, ...(o.products||[]).map(p=>p.name)]
                .join(" ").toLowerCase();
    return d >= r.from && d <= r.to
      && (st === "all"      || statusNorm(o.status) === st)
      && (country === "all" || o.country_code === country || o.country === country)
      && (!term             || hay.includes(term));
  });
  checkPushNotifications(state.filtered);
  renderAll();
}
// =============================================================
// Igual que WooCommerce Analytics: solo completed + processing cuentan como venta válida
function validRevenueOrders(o) {
  return o.filter(x => ["completed","processing"].includes(statusNorm(x.status)));
}

// Ingresos netos = subtotal - descuentos (sin impuestos ni envío), igual que WooCommerce Net Sales
function netRev(o) { return o.net_total ?? o.total ?? 0; }

function groupBy(arr, fn) {
  return arr.reduce((a, x) => { const k = fn(x) || "Sin dato"; (a[k] ??= []).push(x); return a; }, {});
}

function sum(arr, fn) {
  return arr.reduce((s, x) => s + Number(fn(x) || 0), 0);
}

function customerMap(orders) {
  const map = {};
  orders.forEach(o => {
    const key = o.customer_email || o.customer || o.id;
    map[key] ??= { name: o.customer || "Cliente", email: o.customer_email || "",
                   revenue: 0, orders: 0, countries: new Set(), courses: new Set(), last: o.date };
    map[key].orders++;
    if (["completed","processing"].includes(statusNorm(o.status))) map[key].revenue += netRev(o);
    map[key].countries.add(o.country || o.country_code || "");
    (o.products||[]).forEach(p => map[key].courses.add(p.name));
    if (new Date(o.date) > new Date(map[key].last)) map[key].last = o.date;
  });
  return map;
}

function metrics(orders) {
  const valid    = validRevenueOrders(orders);
  const revenue  = sum(valid, netRev);
  const cm       = customerMap(orders);
  const repeat   = Object.values(cm).filter(c => c.orders > 1).length;
  const refunded = orders.filter(o => statusNorm(o.status) === "refunded").length;
  return {
    revenue, orders: orders.length,
    avg:        valid.length ? revenue / valid.length : 0,
    customers:  Object.keys(cm).length,
    repeat,
    refundRate: orders.length ? refunded / orders.length * 100 : 0
  };
}

// =============================================================
// RENDER PRINCIPAL
// =============================================================
function renderAll() {
  renderKPIs();
  renderRevenueChart();
  renderRecentFeed();
  renderFunnel();
  renderAlerts();
  renderCountryDetail();
  renderSegments();
  renderWeekdayChart();
  renderPaymentBars();
  renderCourseRanking();
  renderCustomers();
  renderOportunidades();
  renderCourseMatrix();
  renderOrders();
  renderCourses();
  renderGeoRankings();
  updateGlobePoints();
  renderHeatmap();
  renderCohorts();
  renderForecast();
  renderRfmScatter();
  renderAbandonAnalysis();
  renderCoursesFunnel();
  renderPriceDistribution();
  renderKanban();
  updateFollowupBadges();
  renderLTV();
  renderOptimalSendTime();
  detectDuplicates();
  renderEmailMarketing();
  renderWidgetCustomizer();
}

function renderKPIs() {
  const m = metrics(state.filtered);

  // ── Período anterior para comparativa ──
  const r   = range();
  const dur = r.to.getTime() - r.from.getTime();
  const prevFrom = new Date(r.from.getTime() - dur);
  const prevTo   = new Date(r.from.getTime() - 1);
  const prevOrds = state.orders.filter(o => { const d = new Date(o.date); return d >= prevFrom && d <= prevTo; });
  const mp = metrics(prevOrds);

  const chg = (cur, prev) => {
    if (!prev) return '';
    const pct = (cur - prev) / prev * 100;
    const cls = pct >= 0 ? 'kpi-up' : 'kpi-down';
    return ` <span class="${cls}">${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(1)}%</span>`;
  };

  const cards = [
    ["Ingresos",        fmtMoney(m.revenue),                 "Ventas válidas",           chg(m.revenue, mp.revenue)],
    ["Pedidos",         m.orders.toLocaleString("es-PE"),    "Total en el periodo",      chg(m.orders, mp.orders)],
    ["Ticket promedio", fmtMoney(m.avg),                     "Por pedido válido",        chg(m.avg, mp.avg)],
    ["Clientes únicos", m.customers.toLocaleString("es-PE"), `${m.repeat} recurrentes`, chg(m.customers, mp.customers)],
    ["Tasa reembolso",  m.refundRate.toFixed(1) + "%",       "Control de riesgo",        '']
  ];
  $("#kpiGrid").innerHTML = cards.map(([label, value, sub, change]) =>
    `<article class="kpi">
       <label>${label}</label>
       <strong>${value}</strong>
       <p>${sub}${change || ''}</p>
     </article>`
  ).join("");
}

function renderRevenueChart() {
  const g      = groupBy(state.filtered, o => String(o.date).slice(0, 10));
  const series = Object.keys(g).sort().map(date => ({
    label: date.slice(5),
    value: sum(validRevenueOrders(g[date]), netRev)
  }));

  // Trend badge
  const half   = Math.floor(series.length / 2);
  const first  = sum(series.slice(0, half), x => x.value);
  const second = sum(series.slice(half),    x => x.value);
  const trend  = first ? (second - first) / first * 100 : 0;
  const badge  = $("#trendBadge");
  badge.textContent = `${trend >= 0 ? "▲" : "▼"} ${Math.abs(trend).toFixed(1)}%`;
  badge.className   = `badge ${trend >= 0 ? "badge-up" : "badge-down"}`;

  const container = $("#revenueBars");
  if (!series.length) { container.innerHTML = `<div class="rv-empty">Sin datos en el periodo seleccionado</div>`; return; }

  // Show last 10 days with horizontal bars (no flexbox tricks needed)
  const max  = Math.max(...series.map(s => s.value), 1);
  const show = series.slice(-10);
  container.innerHTML = show.map(s => {
    const pct = Math.max(3, (s.value / max) * 100);
    return `<div class="rv-row">
      <span class="rv-date">${esc(s.label)}</span>
      <div class="rv-track"><div class="rv-fill" style="width:${pct.toFixed(1)}%"></div></div>
      <span class="rv-amount">${fmtMoney(s.value)}</span>
    </div>`;
  }).join('');
}

function renderRecentFeed() {
  const recent = [...state.filtered]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 15);

  $("#recentCount").textContent = `${state.filtered.length} pedidos`;

  const statusIcon = s => ({ completed:'✅', processing:'Ã¯Â¿Â½Ã‚Â�', pending:'🔔', cancelled:'Ã¯Â¿Â½Ã‚Â�', refunded:'↩', 'on-hold':'Ã¯Â¿Â½Ã‚Â�' }[s] || '📦');
  const timeAgo = d => {
    const mins = Math.floor((Date.now() - new Date(d)) / 60000);
    if (mins < 60)  return `hace ${mins}m`;
    if (mins < 1440) return `hace ${Math.floor(mins/60)}h`;
    return `hace ${Math.floor(mins/1440)}d`;
  };

  $("#recentFeed").innerHTML = recent.map(o => {
    const course = (o.products || [])[0]?.name || 'Curso';
    const initials = (o.customer || 'CL').split(' ').map(w=>w[0]||'').join('').slice(0,2).toUpperCase();
    const st = statusNorm(o.status);
    return `<div class="rf-row">
      <div class="rf-avatar">${esc(initials)}</div>
      <div class="rf-info">
        <div class="rf-name">${esc(o.customer || 'Cliente')}</div>
        <div class="rf-course">${esc(course.length > 42 ? course.slice(0,42)+'…' : course)}</div>
      </div>
      <div class="rf-right">
        <span class="rf-time">${timeAgo(o.date)}</span>
        <span class="rf-status">${statusIcon(st)}</span>
        <strong class="rf-total">${fmtMoney(o.total)}</strong>
      </div>
    </div>`;
  }).join('') || `<div class="rv-empty">Sin ventas en el periodo</div>`;
}

function renderFunnel() {
  const orders = state.filtered, total = Math.max(orders.length, 1);
  const rows = [
    ["Visitantes estimados",  Math.round(total * 7.8), "Tráfico aproximado según pedidos"],
    ["Carritos / intención",  Math.round(total * 2.4), "Prospectos con intención de compra"],
    ["Pedidos creados",       total,                   "Órdenes registradas"],
    ["Pagos válidos",         validRevenueOrders(orders).length, "Completados / procesando"],
    ["Clientes recurrentes",  metrics(orders).repeat,  "Compradores con más de 1 pedido"]
  ];
  const max = rows[0][1] || 1;
  $("#funnelChart").innerHTML = rows.map(([label, count, sub]) =>
    `<div class="funnel-row" style="--w:${Math.max(8, count / max * 100)}%">
       <strong>${label} · ${count.toLocaleString("es-PE")}</strong>
       <span>${sub}</span>
     </div>`
  ).join("");
}

function renderAlerts() {
  const m         = metrics(state.filtered);
  const now       = Date.now();
  const pending   = state.filtered.filter(o => statusNorm(o.status) === "pending").length;
  const cancelled = state.filtered.filter(o => statusNorm(o.status) === "cancelled").length;
  const cm        = Object.values(customerMap(state.filtered));
  const inactiveCt = cm.filter(c => (now - new Date(c.last)) / 864e5 > ALERT_CONFIG.daysInactive).length;
  const alerts    = [];

  if (pending > ALERT_CONFIG.maxPending)
    alerts.push(["⚠ Pedidos pendientes",
      `${pending} pedido${pending > 1 ? "s" : ""} requieren revisión. Umbral configurado: ${ALERT_CONFIG.maxPending}.`]);
  else if (pending)
    alerts.push(["ℹ Pagos pendientes",
      `${pending} pedido${pending > 1 ? "s" : ""} pendientes de pago.`]);
  if (m.refundRate > ALERT_CONFIG.maxRefund)
    alerts.push(["⚠ Reembolsos elevados",
      `Tasa de reembolso en ${m.refundRate.toFixed(1)}%. Umbral: ${ALERT_CONFIG.maxRefund}%.`]);
  if (cancelled)
    alerts.push(["⚠ Pedidos cancelados",
      `${cancelled} venta${cancelled > 1 ? "s" : ""} no llegaron a concretarse.`]);
  if (m.repeat < Math.max(1, m.customers * ALERT_CONFIG.minRepeatPct / 100))
    alerts.push(["ℹ Baja recompra",
      `Pocos clientes recurrentes. Meta: ${ALERT_CONFIG.minRepeatPct}% del total.`]);
  if (inactiveCt > 0)
    alerts.push(["😴 Clientes inactivos",
      `${inactiveCt} cliente${inactiveCt !== 1 ? "s" : ""} sin comprar en más de ${ALERT_CONFIG.daysInactive} días.`]);
  if (!alerts.length)
    alerts.push(["✓ Operación saludable",
      "No hay alertas críticas en el periodo seleccionado."]);

  $("#alertsList").innerHTML = alerts.map(([title, body]) =>
    `<div class="alert"><strong>${title}</strong><p>${body}</p></div>`
  ).join("");
}

function topProducts(orders) {
  const map = {};
  orders.forEach(o =>
    (o.products || []).forEach(p => {
      const name = p.name || "Curso sin nombre";
      map[name] ??= { name, sales: 0, revenue: 0, customers: new Set() };
      map[name].sales   += Number(p.quantity || 1);
      map[name].revenue += Number(p.total    || 0);
      map[name].customers.add(o.customer_email || o.customer || o.id);
    })
  );
  return Object.values(map).sort((a, b) => b.revenue - a.revenue);
}

function renderCountryDetail() {
  const code    = state.selectedCountry;
  const orders  = state.filtered;
  const cName   = code === "all"
    ? "Todos los países"
    : orders.find(o => o.country_code === code)?.country
      || COUNTRIES.find(c => c.code === code)?.name
      || code;

  $("#selectedCountryTitle").textContent = cName;
  $("#selectedCountryBadge").textContent = code === "all" ? "Global" : code;

  const m      = metrics(orders);
  const top    = topProducts(orders).slice(0, 5);
  const cities = Object.entries(groupBy(orders, o => o.city))
    .map(([name, arr]) => ({ name, revenue: sum(validRevenueOrders(arr), netRev), orders: arr.length }))
    .sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  $("#countryDetail").innerHTML = `
    <div class="detail-card">
      <h3>Resumen</h3>
      <div class="detail-row"><span>Ingresos</span>      <strong>${fmtMoney(m.revenue)}</strong></div>
      <div class="detail-row"><span>Pedidos</span>       <strong>${m.orders}</strong></div>
      <div class="detail-row"><span>Clientes</span>      <strong>${m.customers}</strong></div>
      <div class="detail-row"><span>Ticket promedio</span><strong>${fmtMoney(m.avg)}</strong></div>
      <div class="detail-row"><span>Recompra</span>      <strong>${m.repeat} clientes</strong></div>
    </div>
    <div class="detail-card">
      <h3>Top cursos</h3>
      ${top.map(x => `<div class="detail-row"><span>${esc(x.name)}</span><strong>${fmtMoney(x.revenue)}</strong></div>`).join("")
        || `<p style="color:var(--muted)">Sin cursos en el periodo.</p>`}
    </div>
    <div class="detail-card">
      <h3>Top ciudades</h3>
      ${cities.map(x => `<div class="detail-row"><span>${esc(x.name)} · ${x.orders} pedidos</span><strong>${fmtMoney(x.revenue)}</strong></div>`).join("")
        || `<p style="color:var(--muted)">Sin ciudades.</p>`}
    </div>`;
}

function renderWeekdayChart() {
  const days   = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const totals = [0,0,0,0,0,0,0];
  const counts = [0,0,0,0,0,0,0];
  validRevenueOrders(state.filtered).forEach(o => {
    const d = new Date(o.date);
    if (!isNaN(d)) { totals[d.getDay()] += Number(o.total||0); counts[d.getDay()]++; }
  });
  const series = days.map((label, i) => ({ label, value: totals[i], count: counts[i] }));
  const max = Math.max(...series.map(s => s.value), 1);
  $("#weekdayBars").innerHTML = series.map(s => {
    const pct = Math.max(3, (s.value / max) * 100);
    return `<div class="pb-row">
      <span class="pb-label">${esc(s.label)}</span>
      <div class="pb-track"><div class="pb-fill" style="width:${pct.toFixed(1)}%"></div></div>
      <span class="pb-val">${s.count} ped.</span>
    </div>`;
  }).join('');

  // Order summary cards
  const orders = state.filtered;
  const paid   = orders.filter(o => o.status === 'completed').length;
  const pend   = orders.filter(o => o.status === 'pending').length;
  const canc   = orders.filter(o => o.status === 'cancelled').length;
  const avgVal = orders.length ? sum(validRevenueOrders(orders), netRev) / validRevenueOrders(orders).length : 0;
  $("#orderSummary").innerHTML = [
    ['✅ Completados', paid],
    ['Ã¯Â¿Â½Ã‚Â� Pendientes',  pend],
    ['Ã¯Â¿Â½Ã‚Â� Cancelados',  canc],
    ['📊 Ticket medio', fmtMoney(avgVal)]
  ].map(([label, val]) =>
    `<div class="os-card"><strong>${val}</strong><span>${label}</span></div>`
  ).join('');

  // Frequency bars
  const cm = Object.values(customerMap(orders));
  const freq = [
    ['1 compra',    cm.filter(c => c.orders === 1).length],
    ['2 compras',   cm.filter(c => c.orders === 2).length],
    ['3+ compras',  cm.filter(c => c.orders >= 3).length],
  ];
  const fmax = Math.max(...freq.map(f => f[1]), 1);
  $("#frequencyBars").innerHTML = freq.map(([label, val]) => {
    const pct = Math.max(3, (val / fmax) * 100);
    return `<div class="pb-row">
      <span class="pb-label">${label}</span>
      <div class="pb-track"><div class="pb-fill" style="width:${pct.toFixed(1)}%"></div></div>
      <span class="pb-val">${val}</span>
    </div>`;
  }).join('');
}

function renderPaymentBars() {
  const map = {};
  validRevenueOrders(state.filtered).forEach(o => {
    const pm = o.payment_method || 'Otro';
    map[pm] = (map[pm] || 0) + Number(o.total || 0);
  });
  const sorted = Object.entries(map).sort((a,b) => b[1]-a[1]).slice(0, 6);
  const max = sorted[0]?.[1] || 1;
  $("#paymentBars").innerHTML = sorted.map(([label, val]) =>
    `<div class="pb-row">
       <span class="pb-label">${esc(label)}</span>
       <div class="pb-track"><div class="pb-fill" style="width:${Math.max(4, val/max*100).toFixed(1)}%"></div></div>
       <span class="pb-val">${fmtMoney(val)}</span>
     </div>`
  ).join("") || `<p style="color:var(--muted);font-size:13px">Sin datos</p>`;
}

function drawBarChart(canvas, series) {
  if (!canvas) return;
  const dpr    = window.devicePixelRatio || 1;
  const CHART_H = 180;
  canvas.style.display = 'block';
  canvas.style.height  = CHART_H + 'px';
  const cw = canvas.getBoundingClientRect().width || canvas.offsetWidth || canvas.parentElement?.offsetWidth || 400;
  if (!cw) { requestAnimationFrame(() => drawBarChart(canvas, series)); return; }
  canvas.width  = cw * dpr;
  canvas.height = CHART_H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const w = cw, h = CHART_H, padL = 8, padR = 8, padT = 10, padB = 28;
  ctx.clearRect(0, 0, w, h);
  const max = Math.max(...series.map(s => s.value), 1);
  const bw  = (w - padL - padR) / series.length;
  series.forEach((s, i) => {
    const bh  = s.value ? Math.max(4, (s.value / max) * (h - padT - padB)) : 0;
    const x   = padL + i * bw + bw * 0.12;
    const bwi = bw * 0.76;
    const y   = h - padB - bh;
    const grd = ctx.createLinearGradient(0, y, 0, h - padB);
    grd.addColorStop(0, 'rgba(239,35,60,.90)');
    grd.addColorStop(1, 'rgba(239,35,60,.25)');
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, bwi, bh, 4) : ctx.rect(x, y, bwi, bh);
    ctx.fillStyle = grd; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.font      = `11px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(s.label, x + bwi / 2, h - 8);
    if (s.count) {
      ctx.fillStyle = 'rgba(255,255,255,.80)';
      ctx.font      = `bold 10px Inter, sans-serif`;
      ctx.fillText(s.count, x + bwi / 2, y - 4);
    }
  });
}

// =============================================================
// OPORTUNIDADES DE VENTA — Asistente de ventas CRM
// =============================================================
const OPO_STATE = { tab: 'pending' };

// Umbrales de alertas configurables (se restauran de localStorage)
const ALERT_CONFIG = (function() {
  try {
    const s = JSON.parse(localStorage.getItem('crm_alert_config') || 'null');
    return s || { maxPending: 5, maxRefund: 5, daysInactive: 90, minRepeatPct: 8 };
  } catch(e) { return { maxPending: 5, maxRefund: 5, daysInactive: 90, minRepeatPct: 8 }; }
})();

function opoLeads() {
  const allOrders  = state.orders;    // full history (no date filter)
  const cm         = customerMap(allOrders);
  const now        = Date.now();
  const avgTicket  = metrics(state.filtered).avg || 40;

  // ── Pendientes: pedidos iniciados pero sin pago confirmado ──
  const pendingOrders = allOrders.filter(o => statusNorm(o.status) === 'pending');
  const pendingLeads  = pendingOrders.map(o => {
    const daysSince = Math.floor((now - new Date(o.date)) / 864e5);
    const courses   = (o.products || []).map(p => p.name).join(', ');
    const score     = Math.max(10, 95 - daysSince * 3); // fresher = higher score
    return {
      type:    'pending',
      name:    o.customer    || 'Cliente desconocido',
      email:   o.customer_email || '',
      country: o.country     || o.country_code || '',
      city:    o.city        || '',
      value:   Number(o.total || 0),
      courses,
      daysSince,
      orderId: o.number || o.id,
      score:   Math.min(score, 98),
      action:  `Tiene el pedido ${o.number || o.id} sin pagar desde hace ${daysSince} día${daysSince!==1?'s':''}. Enviar recordatorio de pago con link directo.`,
      tag:     '🔥 Pago pendiente'
    };
  }).sort((a, b) => b.score - a.score);

  // ── Cancelados: quisieron comprar pero algo falló ──
  const cancelledOrders = allOrders.filter(o => statusNorm(o.status) === 'cancelled');
  const cancelledLeads  = cancelledOrders.map(o => {
    const daysSince = Math.floor((now - new Date(o.date)) / 864e5);
    const courses   = (o.products || []).map(p => p.name).join(', ');
    const score     = Math.max(5, 80 - daysSince * 1.5);
    return {
      type:    'cancelled',
      name:    o.customer    || 'Cliente desconocido',
      email:   o.customer_email || '',
      country: o.country     || o.country_code || '',
      city:    o.city        || '',
      value:   Number(o.total || 0),
      courses,
      daysSince,
      orderId: o.number || o.id,
      score:   Math.min(score, 85),
      action:  `Canceló el pedido ${o.number || o.id} (${courses || 'curso'}) hace ${daysSince} día${daysSince!==1?'s':''}. Ofrecer cupón de descuento o resolver objeción por email.`,
      tag:     '🛒 Carrito perdido'
    };
  }).sort((a, b) => b.score - a.score);

  // ── Inactivos: compraron pero no vuelven ──
  const inactiveLeads = Object.values(cm)
    .filter(c => {
      const days = (now - new Date(c.last)) / 864e5;
      return days >= 45 && days < 400;
    })
    .map(c => {
      const daysSince   = Math.floor((now - new Date(c.last)) / 864e5);
      const coursesArr  = [...c.courses];
      const score       = Math.max(10, 75 - daysSince * 0.4 + c.orders * 5 + Math.min(c.revenue / 10, 20));
      return {
        type:      'inactive',
        name:      c.name,
        email:     c.email,
        country:   [...c.countries].join(', '),
        city:      '',
        value:     avgTicket,
        courses:   coursesArr.join(', '),
        daysSince,
        orderId:   '',
        score:     Math.min(score, 90),
        action:    `Sin actividad hace ${daysSince} días. Compró: ${coursesArr.slice(0,2).join(', ')}. Ideal para campaña de reactivación con nuevo curso relacionado.`,
        tag:       '😴 Inactivo'
      };
    })
    .sort((a, b) => b.score - a.score);

  // ── Upsell: compraron 1 curso, pueden comprar más ──
  const upsellLeads = Object.values(cm)
    .filter(c => {
      const days = (now - new Date(c.last)) / 864e5;
      return c.courses.size >= 1 && c.orders >= 1 && days < 120;
    })
    .map(c => {
      const daysSince  = Math.floor((now - new Date(c.last)) / 864e5);
      const owned      = [...c.courses];
      // Find most popular course they don't have
      const allCourses = {};
      state.orders.forEach(o => (o.products||[]).forEach(p => {
        allCourses[p.name] = (allCourses[p.name] || 0) + 1;
      }));
      const recommendations = Object.entries(allCourses)
        .filter(([name]) => !owned.includes(name))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([name]) => name);
      const score = Math.min(95, 60 + c.revenue / 5 + c.orders * 3 + Math.max(0, 30 - daysSince));
      return {
        type:    'upsell',
        name:    c.name,
        email:   c.email,
        country: [...c.countries].join(', '),
        city:    '',
        value:   avgTicket,
        courses: owned.join(', '),
        daysSince,
        orderId: '',
        score:   Math.min(score, 97),
        action:  `Ya compró ${owned.length} curso${owned.length!==1?'s':''}. Recomendar: ${recommendations.join(' / ') || 'próximo lanzamiento'}.`,
        tag:     '🚀 Potencial upsell',
        recommendations
      };
    })
    .sort((a, b) => b.score - a.score);

  return { pendingLeads, cancelledLeads, inactiveLeads, upsellLeads };
}

function renderOportunidades() {
  const { pendingLeads, cancelledLeads, inactiveLeads, upsellLeads } = opoLeads();
  const avgTicket = metrics(state.filtered).avg || 40;

  // KPIs
  const totalPotential = pendingLeads.reduce((s,l) => s+l.value, 0)
    + cancelledLeads.reduce((s,l) => s+l.value, 0)
    + (inactiveLeads.length + upsellLeads.length) * avgTicket;

  $('#opoKpis').innerHTML = [
    ['🔥', pendingLeads.length, 'Pagos pendientes', fmtMoney(pendingLeads.reduce((s,l)=>s+l.value,0))],
    ['🛒', cancelledLeads.length, 'Carritos perdidos', fmtMoney(cancelledLeads.reduce((s,l)=>s+l.value,0))],
    ['😴', inactiveLeads.length, 'Inactivos a reactivar', fmtMoney(inactiveLeads.length * avgTicket)],
    ['🚀', upsellLeads.length, 'Potencial upsell', fmtMoney(upsellLeads.length * avgTicket)],
    ['💰', pendingLeads.length + cancelledLeads.length + inactiveLeads.length, 'Total leads', fmtMoney(totalPotential)]
  ].map(([icon, n, label, val]) =>
    `<div class="opo-kpi">
       <div class="opo-kpi-icon">${icon}</div>
       <div class="opo-kpi-body">
         <strong>${n}</strong>
         <span>${label}</span>
         <em>${val}</em>
       </div>
     </div>`
  ).join('');

  // Attach tab events (once)
  if (!$('#view-oportunidades').dataset.tabsInit) {
    $('#view-oportunidades').dataset.tabsInit = '1';
    $('#view-oportunidades').querySelectorAll('.opo-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        $('#view-oportunidades').querySelectorAll('.opo-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        OPO_STATE.tab = btn.dataset.opotab;
        opoRenderList();
      });
    });
    $('#opoExportBtn').addEventListener('click', opoExportCSV);
  }

  opoRenderList();
}

function opoRenderList() {
  const { pendingLeads, cancelledLeads, inactiveLeads, upsellLeads } = opoLeads();
  const map = { pending: pendingLeads, cancelled: cancelledLeads, inactive: inactiveLeads, upsell: upsellLeads };
  const leads = map[OPO_STATE.tab] || [];

  if (!leads.length) {
    $('#opoList').innerHTML = `<div class="opo-empty">✅ No hay leads en esta categoría para el periodo seleccionado.</div>`;
    return;
  }

  $('#opoList').innerHTML = leads.map((l, i) => {
    const hasEmail = !!l.email;
    const scoreColor = l.score >= 75 ? '#22c55e' : l.score >= 50 ? '#f59e0b' : '#ef4444';
    const scoreBg    = l.score >= 75 ? 'rgba(34,197,94,.12)' : l.score >= 50 ? 'rgba(245,158,11,.12)' : 'rgba(239,68,68,.12)';
    const initials   = l.name.split(' ').map(w => w[0] || '').join('').slice(0,2).toUpperCase() || '??';
    return `<div class="opo-card">
      <div class="opo-card-top">
        <div class="opo-avatar">${esc(initials)}</div>
        <div class="opo-info">
          <div class="opo-name">${esc(l.name)} <span class="opo-tag">${l.tag}</span></div>
          <div class="opo-meta">
            ${hasEmail
              ? `<a class="opo-email" href="mailto:${esc(l.email)}">${esc(l.email)}</a>`
              : `<span class="opo-no-email">⚠ Sin email registrado</span>`}
            ${l.country ? `· ${esc(l.country)}` : ''}
            ${l.city ? `, ${esc(l.city)}` : ''}
          </div>
          ${l.courses ? `<div class="opo-courses">📚 ${esc(l.courses.length > 80 ? l.courses.slice(0,80)+'…' : l.courses)}</div>` : ''}
        </div>
        <div class="opo-score-wrap" style="background:${scoreBg}">
          <div class="opo-score" style="color:${scoreColor}">${Math.round(l.score)}</div>
          <div class="opo-score-label">score</div>
          <div class="opo-value">${fmtMoney(l.value)}</div>
        </div>
      </div>
      <div class="opo-action">
        <span class="opo-action-icon">🤖</span>
        <span>${esc(l.action)}</span>
      </div>
    </div>`;
  }).join('');
}

function opoExportCSV() {
  const { pendingLeads, cancelledLeads, inactiveLeads, upsellLeads } = opoLeads();
  const all = [...pendingLeads, ...cancelledLeads, ...inactiveLeads, ...upsellLeads];
  const bom = '\uFEFF';
  const headers = ['tipo','nombre','email','pais','ciudad','cursos','valor_estimado','score','accion'];
  const rows = all.map(l => [
    l.tag.replace(/[^a-zA-Z\s]/g,'').trim(),
    l.name, l.email, l.country, l.city,
    l.courses, l.value.toFixed(2), Math.round(l.score), l.action
  ].map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(','));
  const csv = bom + [headers.join(','), ...rows].join('\n');
  const a   = document.createElement('a');
  a.href     = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `leads-email-marketing-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  toast('Lista de leads exportada para email marketing', 'success');
}

function renderSegments() {
  const cm   = Object.values(customerMap(state.filtered));
  const now  = Date.now();
  const data = [
    ["Clientes VIP",  cm.filter(c => c.revenue >= 300).length,                        "Compraron alto valor"],
    ["Recurrentes",   cm.filter(c => c.orders > 1).length,                            "Más de un pedido"],
    ["Nuevos",        cm.filter(c => new Date(c.last) > new Date(now - 30 * 864e5)).length, "Últimos 30 días"],
    ["Inactivos",     cm.filter(c => new Date(c.last) < new Date(now - 90 * 864e5)).length, "Más de 90 días sin compra"]
  ];
  $("#segmentsGrid").innerHTML = data.map(([label, val, sub]) =>
    `<div class="segment"><strong>${val}</strong><span>${label} · ${sub}</span></div>`
  ).join("");
}

// ── RFM scoring ──
function rfmScore(c, allCustomers) {
  const daysSince = (Date.now() - new Date(c.last)) / 864e5;
  const rScore = daysSince <= 7 ? 33 : daysSince <= 30 ? 25 : daysSince <= 90 ? 15 : 5;
  const fScore = c.orders >= 5 ? 33 : c.orders >= 3 ? 25 : c.orders >= 2 ? 18 : 8;
  const maxRev = Math.max(...allCustomers.map(x => x.revenue), 1);
  const mScore = Math.round((c.revenue / maxRev) * 34);
  const total  = rScore + fScore + mScore;
  if (total >= 80) return { score: total, label: 'Ã¯Â¿Â½Ã‚Â VIP',        cls: 'rfm-vip' };
  if (total >= 60) return { score: total, label: '🔥 Activo',     cls: 'rfm-active' };
  if (total >= 40) return { score: total, label: '⚡ Potencial',  cls: 'rfm-potential' };
  if (total >= 20) return { score: total, label: '😴 En riesgo',  cls: 'rfm-risk' };
  return              { score: total, label: 'Ã¯Â¿Â½Ã‚Â� Inactivo',    cls: 'rfm-inactive' };
}

// ── Predicción próxima compra ──
function nextPurchasePrediction(emailOrName) {
  const customerOrders = state.orders
    .filter(o => o.customer_email === emailOrName || o.customer === emailOrName || o.customer_email === emailOrName)
    .map(o => new Date(o.date)).sort((a, b) => a - b);
  if (customerOrders.length < 2) return null;
  let total = 0;
  for (let i = 1; i < customerOrders.length; i++) total += customerOrders[i] - customerOrders[i-1];
  const avgGap  = total / (customerOrders.length - 1);
  const nextDate = new Date(customerOrders.at(-1).getTime() + avgGap);
  const daysLeft = Math.round((nextDate - Date.now()) / 864e5);
  return { nextDate, daysLeft, avgGapDays: Math.round(avgGap / 864e5) };
}

function renderCustomers() {
  const allCustomers = Object.values(customerMap(state.orders));
  const sortBy  = $("#crmSort")?.value   || "revenue";
  const limit   = Number($("#crmLimit")?.value || 30);
  const search  = ($("#crmSearch")?.value || "").trim().toLowerCase();

  let list = Object.values(customerMap(state.filtered));

  // Ordenar
  if (sortBy === "revenue")  list.sort((a, b) => b.revenue - a.revenue);
  else if (sortBy === "orders")  list.sort((a, b) => b.orders  - a.orders);
  else if (sortBy === "recent")  list.sort((a, b) => new Date(b.last) - new Date(a.last));
  else if (sortBy === "oldest")  list.sort((a, b) => new Date(a.last) - new Date(b.last));
  else if (sortBy === "name")    list.sort((a, b) => a.name.localeCompare(b.name));

  // Filtrar por búsqueda
  if (search) list = list.filter(c =>
    c.name.toLowerCase().includes(search) || c.email.toLowerCase().includes(search)
  );

  // Limitar
  const total = list.length;
  list = list.slice(0, limit);

  const maxRev = list[0]?.revenue || 1;

  $("#customerList").innerHTML = list.map((c, i) => {
    const rfm  = rfmScore(c, allCustomers);
    const pct  = Math.round((c.revenue / maxRev) * 100);
    const pred = nextPurchasePrediction(c.email || c.name);
    const predHtml = pred
      ? `<p style="${pred.daysLeft <= 0 ? 'color:var(--accent)' : 'color:var(--muted)'}">
           ${pred.daysLeft > 0 ? `&#x1F5D3; Pr&#xF3;x. compra ~${pred.daysLeft}d` : `&#x26A1; Compra esperada hace ${Math.abs(pred.daysLeft)}d`}
         </p>`
      : '';
    return `<div class="customer" data-email="${esc(c.email || c.name)}" style="cursor:pointer">
       <div class="avatar" style="min-width:36px;font-size:13px;background:hsl(${(i*47)%360},50%,35%)">${esc(c.name.slice(0,2).toUpperCase())}</div>
       <div style="flex:1;min-width:0">
         <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
           <h3 style="margin:0">${esc(c.name)}</h3>
           <span class="rfm-badge ${rfm.cls}">${rfm.label}</span>
         </div>
         <p style="margin:2px 0;font-size:12px;color:var(--muted)">${esc(c.email)} &middot; ${c.orders} pedido${c.orders!==1?"s":""} &middot; ${c.courses.size} curso${c.courses.size!==1?"s":""}</p>
         <div style="height:4px;background:var(--border);border-radius:2px;margin-top:4px;overflow:hidden">
           <div style="width:${pct}%;height:100%;background:var(--accent);border-radius:2px"></div>
         </div>
         ${predHtml}
       </div>
       <div style="text-align:right;flex-shrink:0">
         <strong style="display:block;font-size:15px">${fmtMoney(c.revenue)}</strong>
         <span style="font-size:11px;color:var(--muted)">#${i+1}</span>
       </div>
     </div>`;
  }).join("") || empty("Sin clientes en el periodo.");

  // Leyenda de totales
  const totalRev = list.reduce((s, c) => s + c.revenue, 0);
  const legend = document.createElement("p");
  legend.style.cssText = "font-size:12px;color:var(--muted);text-align:right;margin:8px 4px 0";
  legend.textContent = `Mostrando ${list.length} de ${total} clientes · Total: ${fmtMoney(totalRev)}`;
  const el = $("#customerList");
  el.appendChild(legend);

  // Click → abrir modal timeline
  el.querySelectorAll(".customer").forEach(el => {
    el.addEventListener("click", () => openCustomerModal(el.dataset.email));
  });
}

function renderCourseRanking() {
  const el = document.getElementById("courseRankingList");
  const badge = document.getElementById("courseRankBadge");
  if (!el) return;

  // Contar unidades vendidas e ingresos por curso
  const courseStats = {};
  validRevenueOrders(state.filtered).forEach(o => {
    (o.products || []).forEach(p => {
      const name = (p.name || "Curso sin nombre").trim();
      if (!courseStats[name]) courseStats[name] = { units: 0, revenue: 0 };
      const qty = Number(p.quantity || 1);
      const rev = Number(p.subtotal || p.total || 0);
      courseStats[name].units   += qty;
      courseStats[name].revenue += rev;
    });
  });

  const sorted = Object.entries(courseStats).sort((a, b) => b[1].units - a[1].units);
  if (badge) badge.textContent = sorted.length + " cursos";

  if (!sorted.length) { el.innerHTML = empty("Sin datos en el periodo."); return; }

  const maxUnits = sorted[0][1].units || 1;
  el.innerHTML = sorted.map(([name, s], i) => {
    const pct = Math.round((s.units / maxUnits) * 100);
    const medal = i === 0 ? "\uD83E\uDD47" : i === 1 ? "\uD83E\uDD48" : i === 2 ? "\uD83E\uDD49" : `${i+1}.`;
    return `<div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;gap:8px">
        <span style="font-size:13px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(name)}">
          <span style="margin-right:4px">${medal}</span>${esc(name)}
        </span>
        <span style="font-size:12px;white-space:nowrap;color:var(--muted)">${s.units} vendido${s.units!==1?"s":""} &middot; ${fmtMoney(s.revenue)}</span>
      </div>
      <div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden">
        <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,var(--accent),var(--accent2,var(--accent)));border-radius:3px;transition:width .4s"></div>
      </div>
    </div>`;
  }).join("");
}

function renderCourseMatrix() {
  const allOrders  = state.filtered;
  const customers  = Object.values(customerMap(allOrders))
    .sort((a, b) => b.revenue - a.revenue);

  // Recopilar todos los cursos distintos ordenados por ventas totales
  const courseCount = {};
  allOrders.forEach(o =>
    (o.products || []).forEach(p => {
      const n = p.name || "Curso sin nombre";
      courseCount[n] = (courseCount[n] || 0) + Number(p.quantity || 1);
    })
  );
  const allCourses = Object.keys(courseCount).sort((a, b) => courseCount[b] - courseCount[a]);

  const tbl = $("#courseMatrix");
  if (!customers.length || !allCourses.length) {
    tbl.innerHTML = `<tbody><tr><td>${empty("Sin datos en el periodo.")}</td></tr></tbody>`;
    $("#matrixBadge").textContent = "—";
    return;
  }

  $("#matrixBadge").textContent = `${customers.length} clientes · ${allCourses.length} cursos`;

  // Cabecera: nombre + email + cursos (texto vertical) + ingresos
  const thead = `<thead><tr>
    <th class="cm-th cm-fixed">Cliente</th>
    <th class="cm-th cm-fixed">Email</th>
    ${allCourses.map(c =>
      `<th class="cm-th cm-rotate" title="${esc(c)}"><span>${esc(c)}</span></th>`
    ).join("")}
    <th class="cm-th">Ingresos</th>
    <th class="cm-th"># Pedidos</th>
  </tr></thead>`;

  // Filas de clientes
  const tbody = `<tbody>${customers.map(c => {
    const cells = allCourses.map(course =>
      c.courses.has(course)
        ? `<td class="cm-cell cm-yes" title="${esc(c.name)} compró ${esc(course)}">✓</td>`
        : `<td class="cm-cell"></td>`
    ).join("");
    return `<tr>
      <td class="cm-name"><strong>${esc(c.name)}</strong></td>
      <td class="cm-email"><small>${esc(c.email)}</small></td>
      ${cells}
      <td class="cm-val"><strong>${fmtMoney(c.revenue)}</strong></td>
      <td class="cm-val">${c.orders}</td>
    </tr>`;
  }).join("")}</tbody>`;

  tbl.innerHTML = thead + tbody;
}

function renderOrders() {
  const total = state.filtered.length;
  const shown = Math.min(total, 150);
  $("#ordersCountBadge").textContent = total > shown
    ? `Mostrando ${shown} de ${total} pedidos`
    : `${total} pedido${total !== 1 ? "s" : ""}`;

  $("#ordersTable").innerHTML = state.filtered.slice(0, 150).map(o =>
    `<tr>
       <td><strong>${esc(o.number || o.id)}</strong></td>
       <td>${fmtDate(o.date)}</td>
       <td>${esc(o.customer || "Cliente")}<br><small style="color:var(--muted)">${esc(o.customer_email || "")}</small></td>
       <td>${esc((o.products||[]).map(p => p.name).join(", "))}</td>
       <td>${esc(o.country || o.country_code || "")} / ${esc(o.city || "")}</td>
       <td><span class="status ${statusNorm(o.status)}">${esc(statusNorm(o.status))}</span></td>
       <td><strong>${fmtMoney(o.total)}</strong></td>
     </tr>`
  ).join("") || `<tr><td colspan="7">${empty("Sin pedidos en el periodo.")}</td></tr>`;
}

function renderCourses() {
  const list = topProducts(state.filtered);
  const max  = Math.max(...list.map(x => x.revenue), 1);
  $("#coursesGrid").innerHTML = list.map(c =>
    `<article class="course">
       <h3>${esc(c.name)}</h3>
       <div class="metric"><span>Ingresos</span>        <strong>${fmtMoney(c.revenue)}</strong></div>
       <div class="metric"><span>Ventas</span>           <strong>${c.sales}</strong></div>
       <div class="metric"><span>Clientes únicos</span> <strong>${c.customers.size}</strong></div>
       <div class="progress"><span style="width:${Math.max(6, c.revenue / max * 100)}%"></span></div>
     </article>`
  ).join("") || empty("Sin cursos en el periodo.");

  // Popular selects de comparativa
  populateCourseSelects();
}

function renderGeoRankings() {
  const mkRank = (x, i) =>
    `<div class="rank">
       <div class="rank-no">${i + 1}</div>
       <div><h3>${esc(x.name)}</h3><p>${x.orders} pedido${x.orders!==1?"s":""}</p></div>
       <strong>${fmtMoney(x.revenue)}</strong>
     </div>`;

  const countries = Object.entries(groupBy(state.filtered, o => o.country || o.country_code))
    .map(([name, arr]) => ({ name, orders: arr.length, revenue: sum(validRevenueOrders(arr), netRev) }))
    .sort((a, b) => b.revenue - a.revenue);

  const cities = Object.entries(groupBy(state.filtered, o => o.city))
    .map(([name, arr]) => ({ name, orders: arr.length, revenue: sum(validRevenueOrders(arr), netRev) }))
    .sort((a, b) => b.revenue - a.revenue).slice(0, 20);

  $("#countryRanking").innerHTML = countries.map(mkRank).join("") || empty("Sin países.");
  $("#cityRanking").innerHTML    = cities.map(mkRank).join("")    || empty("Sin ciudades.");
}

// =============================================================
// =============================================================
// GLOBO 3D — Mapa real con polígonos Natural Earth 110m
// =============================================================

// Polígonos reales Natural Earth 110m (cargados desde world-polys-inline.js)
let WORLD_POLYS = window.WORLD_POLYS_DATA || null;

function updateGlobePoints() {
  state.globe.points = Object.entries(groupBy(state.filtered, o => o.country_code || o.country))
    .map(([code, arr]) => {
      const ref = COUNTRIES.find(c => c.code === code)
               || { code, name: arr[0]?.country || code, lat: arr[0]?.latitude || 0, lon: arr[0]?.longitude || 0 };
      return { code, name: arr[0]?.country || ref.name, lat: ref.lat, lon: ref.lon,
               orders: arr.length, revenue: sum(validRevenueOrders(arr), netRev) };
    });
}

function initGlobe() {
  const canvas  = $('#globeCanvas');
  const wrap    = canvas.parentElement;
  const tooltip = $('#globeTooltip');

  const getPos = e => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  canvas.addEventListener('pointerdown', e => {
    state.globe.dragging = true;
    state.globe.lastX = e.clientX; state.globe.lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', e => {
    if (state.globe.dragging) {
      const dx = e.clientX - state.globe.lastX, dy = e.clientY - state.globe.lastY;
      state.globe.rotationY += dx * 0.45;
      state.globe.rotationX  = Math.max(-75, Math.min(75, state.globe.rotationX + dy * 0.35));
      state.globe.lastX = e.clientX; state.globe.lastY = e.clientY;
    } else {
      const p = getPos(e), hit = hitPoint(p.x, p.y);
      if (hit) {
        tooltip.classList.remove('hidden');
        tooltip.style.left = Math.min(p.x + 14, wrap.clientWidth - 210) + 'px';
        tooltip.style.top  = Math.max(12, p.y - 20) + 'px';
        tooltip.innerHTML  =
          '<strong>' + esc(hit.name) + '</strong>' +
          hit.orders + ' pedido' + (hit.orders !== 1 ? 's' : '') + '<br>' +
          fmtMoney(hit.revenue) + ' en ingresos';
      } else {
        tooltip.classList.add('hidden');
      }
    }
  });

  canvas.addEventListener('pointerup',    () => { state.globe.dragging = false; });
  canvas.addEventListener('pointerleave', () => { state.globe.dragging = false; tooltip.classList.add('hidden'); });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    _zoom.target = Math.max(0.72, Math.min(1.55, _zoom.target + (e.deltaY > 0 ? -0.07 : 0.07)));
  }, { passive: false });
  canvas.addEventListener('click', e => {
    const p = getPos(e), hit = hitPoint(p.x, p.y);
    if (hit) { $('#countryFilter').value = hit.code; applyFilters(); toast('País seleccionado: ' + hit.name); }
  });

  requestAnimationFrame(drawGlobeLoop);
}

function hitPoint(x, y) {
  let best = null;
  for (const p of state.globe.projectedPoints || []) {
    const d = Math.hypot(x - p.x, y - p.y);
    if (d < p.r + 8 && (!best || d < best.d)) best = { ...p, d };
  }
  return best;
}

// Modo visual del globo: 'default' | 'choropleth' | 'pulse' | 'arcs' | 'all'
let GLOBE_MODE = (function() {
  try { return localStorage.getItem('crm_globe_mode') || 'default'; } catch(e) { return 'default'; }
})();

// Zoom con momentum
const _zoom = { target: 1, current: 1 };

function drawGlobeLoop() {
  if (state.globe.autoRotate && !state.globe.dragging) state.globe.rotationY += 0.09;
  // Suavizar zoom con momentum
  _zoom.current += (_zoom.target - _zoom.current) * 0.12;
  state.globe.zoom = _zoom.current;
  try { drawGlobe(); } catch(e) { /* silently ignore per-frame errors */ }
  requestAnimationFrame(drawGlobeLoop);
}

function rotate3D(x, y, z) {
  const rx = state.globe.rotationX * Math.PI / 180;
  const ry = state.globe.rotationY * Math.PI / 180;
  const y1 =  y * Math.cos(rx) - z * Math.sin(rx);
  const z1 =  y * Math.sin(rx) + z * Math.cos(rx);
  const x2 =  x * Math.cos(ry) + z1 * Math.sin(ry);
  const z2 = -x * Math.sin(ry) + z1 * Math.cos(ry);
  return { x: x2, y: y1, z: z2 };
}

function project(lat, lon, cx, cy, R) {
  const phi = lat * Math.PI / 180, lam = lon * Math.PI / 180;
  const x =  Math.cos(phi) * Math.sin(lam);
  const y = -Math.sin(phi);
  const z =  Math.cos(phi) * Math.cos(lam);
  const r = rotate3D(x, y, z);
  return { x: cx + r.x * R, y: cy + r.y * R, z: r.z, visible: r.z > -0.05 };
}

// Traza un anillo [lon,lat][] manejando cortes de visibilidad (cara trasera del globo)
function traceRing(ctx, ring, cx, cy, R) {
  let started = false, lastVis = false;
  for (let i = 0; i < ring.length; i++) {
    const pt = ring[i];              // pt = [lon, lat]
    const p  = project(pt[1], pt[0], cx, cy, R);
    if (p.visible) {
      if (!started || !lastVis) { ctx.moveTo(p.x, p.y); started = true; }
      else ctx.lineTo(p.x, p.y);
      lastVis = true;
    } else {
      lastVis = false;
    }
  }
}

function drawGlobe() {
  const canvas = $('#globeCanvas');
  const ctx    = canvas.getContext('2d');
  const rect   = canvas.getBoundingClientRect();
  const dpr    = window.devicePixelRatio || 1;
  if (!rect.width || !rect.height) return;

  canvas.width  = rect.width  * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w  = rect.width, h = rect.height, cx = w / 2, cy = h / 2;
  const R  = Math.min(w, h) * 0.38 * state.globe.zoom;
  if (!R) return;

  const mode       = GLOBE_MODE;
  const doChoropleth = mode === 'choropleth' || mode === 'all';
  const doPulse      = mode === 'pulse'      || mode === 'all';
  const doArcs       = mode === 'arcs'       || mode === 'all';
  const t            = Date.now() / 1000;   // tiempo en segundos para animaciones

  ctx.clearRect(0, 0, w, h);

  // ── 1. FONDO: océano con gradiente esférico ──
  const oceanGrad = ctx.createRadialGradient(cx - R * 0.28, cy - R * 0.28, R * 0.04, cx, cy, R);
  oceanGrad.addColorStop(0,    'rgba(80,170,255,.68)');
  oceanGrad.addColorStop(0.45, 'rgba(14,90,155,.88)');
  oceanGrad.addColorStop(1,    'rgba(2,16,38,.99)');
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = oceanGrad; ctx.fill();

  // ── 2. CLIP ──
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();

  // ── 3. GRATICULE ──
  ctx.strokeStyle = 'rgba(255,255,255,.09)'; ctx.lineWidth = 0.7;
  for (let lat = -80; lat <= 80; lat += 20) {
    ctx.beginPath(); let s = false;
    for (let lon = -180; lon <= 180; lon += 3) {
      const p = project(lat, lon, cx, cy, R);
      if (p.visible) { if (!s) { ctx.moveTo(p.x, p.y); s = true; } else ctx.lineTo(p.x, p.y); } else s = false;
    }
    ctx.stroke();
  }
  for (let lon = -180; lon < 180; lon += 30) {
    ctx.beginPath(); let s = false;
    for (let lat2 = -85; lat2 <= 85; lat2 += 3) {
      const p = project(lat2, lon, cx, cy, R);
      if (p.visible) { if (!s) { ctx.moveTo(p.x, p.y); s = true; } else ctx.lineTo(p.x, p.y); } else s = false;
    }
    ctx.stroke();
  }

  // ── 4. TIERRAS ──
  if (WORLD_POLYS && WORLD_POLYS.length) {
    // Precalcular revenue por código de país para coropleta
    const revenueByCode = {};
    if (doChoropleth) {
      state.globe.points.forEach(p => { revenueByCode[p.code] = p.revenue || 0; });
    }
    const maxRev = doChoropleth ? Math.max(...state.globe.points.map(p => p.revenue), 1) : 1;

    WORLD_POLYS.forEach(poly => {
      const code = poly._code || '';
      ctx.beginPath();
      poly.forEach(ring => traceRing(ctx, ring, cx, cy, R));

      if (doChoropleth && revenueByCode[code]) {
        // Escala logarítmica → color HSL verde→amarillo→rojo
        const t2 = Math.log1p(revenueByCode[code]) / Math.log1p(maxRev);
        const hue = 140 - t2 * 140;   // 140 verde → 0 rojo
        const sat = 55 + t2 * 35;
        const lit = 28 + t2 * 28;
        ctx.fillStyle   = `hsla(${hue},${sat}%,${lit}%,.92)`;
        ctx.strokeStyle = `hsla(${hue},${sat}%,${lit + 25}%,.45)`;
      } else {
        ctx.fillStyle   = 'rgba(55,175,85,.82)';
        ctx.strokeStyle = 'rgba(255,255,255,.20)';
      }
      ctx.lineWidth = 0.8;
      ctx.fill('evenodd');
      ctx.stroke();
    });
  }

  // ── 5. ARCOS ANIMADOS (líneas entre el top país y los demás) ──
  if (doArcs && state.globe.points.length >= 2) {
    const sorted  = [...state.globe.points].sort((a, b) => b.revenue - a.revenue);
    const origin  = sorted[0];
    const targets = sorted.slice(1, Math.min(8, sorted.length));
    const pO      = project(origin.lat, origin.lon, cx, cy, R);

    if (pO.visible) {
      targets.forEach((tgt, i) => {
        const pT = project(tgt.lat, tgt.lon, cx, cy, R);
        if (!pT.visible) return;

        // Progreso animado por onda (0→1→0) con desfase por índice
        const phase   = (t * 0.5 + i * 0.18) % 1;
        const progress = Math.sin(phase * Math.PI);    // pico en el medio del ciclo
        const alpha   = 0.15 + progress * 0.6;

        // Punto de control para la curva Bézier (elevado hacia el espectador)
        const mcx  = (pO.x + pT.x) / 2;
        const mcy  = (pO.y + pT.y) / 2 - Math.hypot(pT.x - pO.x, pT.y - pO.y) * 0.35;

        // Trazar solo el segmento hasta el progreso animado
        const px = (1-progress)**2 * pO.x + 2*(1-progress)*progress*mcx + progress**2 * pT.x;
        const py = (1-progress)**2 * pO.y + 2*(1-progress)*progress*mcy + progress**2 * pT.y;

        ctx.beginPath();
        ctx.moveTo(pO.x, pO.y);
        ctx.quadraticCurveTo(mcx, mcy, px, py);
        ctx.strokeStyle = `rgba(250,200,80,${alpha})`;
        ctx.lineWidth   = 1.2 + progress * 1.5;
        ctx.setLineDash([]);
        ctx.stroke();

        // Punto de cabeza del arco
        ctx.beginPath();
        ctx.arc(px, py, 3 + progress * 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,230,80,${alpha + 0.2})`;
        ctx.shadowColor = 'rgba(255,220,60,.8)'; ctx.shadowBlur = 8;
        ctx.fill(); ctx.shadowBlur = 0;
      });
    }
  }

  // ── 6. PUNTOS DE VENTAS ──
  state.globe.projectedPoints = [];
  const maxRevenue = Math.max(...state.globe.points.map(p => p.revenue), 1);

  state.globe.points.forEach((p, idx) => {
    const pr = project(p.lat, p.lon, cx, cy, R);
    if (!pr.visible) return;
    const r = 6 + Math.sqrt(p.revenue / maxRevenue) * 20;
    state.globe.projectedPoints.push({ ...p, x: pr.x, y: pr.y, r });

    if (doPulse) {
      // Anillos de onda concéntricos (efecto radar)
      const numRings = 3;
      for (let k = 0; k < numRings; k++) {
        const wavePhase  = ((t * 1.2 + k / numRings + idx * 0.11) % 1);
        const waveR      = r + wavePhase * (r * 3.5);
        const waveAlpha  = (1 - wavePhase) * 0.45;
        ctx.beginPath();
        ctx.arc(pr.x, pr.y, waveR, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,80,100,${waveAlpha})`;
        ctx.lineWidth   = 1.2;
        ctx.stroke();
      }
    } else {
      // Halo suave estático
      ctx.beginPath(); ctx.arc(pr.x, pr.y, r + 10, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,60,80,.12)'; ctx.fill();
    }

    // Círculo con degradado radial
    ctx.beginPath(); ctx.arc(pr.x, pr.y, r, 0, Math.PI * 2);
    const rg = ctx.createRadialGradient(pr.x - r * 0.3, pr.y - r * 0.3, 1, pr.x, pr.y, r);
    rg.addColorStop(0, 'rgba(255,130,150,1)');
    rg.addColorStop(1, 'rgba(210,20,45,.92)');
    ctx.fillStyle   = rg;
    ctx.shadowColor = 'rgba(255,50,80,.9)'; ctx.shadowBlur = 22;
    ctx.fill(); ctx.shadowBlur = 0;

    // Borde del punto
    ctx.beginPath(); ctx.arc(pr.x, pr.y, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,210,215,.85)'; ctx.lineWidth = 1.2; ctx.stroke();

    // Código ISO
    const fontSize = Math.max(9, Math.min(13, r * 0.7));
    ctx.fillStyle    = '#fff';
    ctx.font         = `900 ${fontSize}px Inter, sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor  = 'rgba(0,0,0,.8)'; ctx.shadowBlur = 6;
    ctx.fillText(p.code, pr.x, pr.y);
    ctx.shadowBlur   = 0; ctx.textBaseline = 'alphabetic';
  });

  ctx.restore(); // fin clip

  // ── 7. BORDE EXTERIOR ──
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1.5; ctx.stroke();

  // ── 8. ATMÓSFERA / HALO (siempre, pero más intenso en modo all/default) ──
  const atmoIntensity = (mode === 'all') ? 0.38 : 0.25;
  const atmoColor     = doChoropleth ? '99,80,220' : '56,189,248';
  const glow = ctx.createRadialGradient(cx, cy, R * 0.96, cx, cy, R * 1.22);
  glow.addColorStop(0, `rgba(${atmoColor},${atmoIntensity})`);
  glow.addColorStop(0.5, `rgba(${atmoColor},${atmoIntensity * 0.4})`);
  glow.addColorStop(1, `rgba(${atmoColor},0)`);
  ctx.beginPath(); ctx.arc(cx, cy, R * 1.22, 0, Math.PI * 2);
  ctx.fillStyle = glow; ctx.fill();

  // Halo polar (aurora simulada en modo all)
  if (mode === 'all') {
    const aurora = ctx.createRadialGradient(cx, cy - R * 0.8, 0, cx, cy - R * 0.8, R * 0.6);
    aurora.addColorStop(0, `rgba(80,255,150,${0.06 + Math.sin(t * 0.7) * 0.04})`);
    aurora.addColorStop(1, 'rgba(80,255,150,0)');
    ctx.beginPath(); ctx.arc(cx, cy, R * 1.1, 0, Math.PI * 2);
    ctx.fillStyle = aurora; ctx.fill();
  }

  // ── 9. REFLEJO ESPECULAR ──
  const shine = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.34, 0, cx - R * 0.3, cy - R * 0.34, R * 0.58);
  shine.addColorStop(0,   'rgba(255,255,255,.14)');
  shine.addColorStop(0.5, 'rgba(255,255,255,.03)');
  shine.addColorStop(1,   'rgba(255,255,255,0)');
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = shine; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
  ctx.restore();

  // ── 10. LEYENDA MODO ──
  const modeLabels = { default:'Estándar', choropleth:'Coropleta de ingresos', pulse:'Radar pulsante', arcs:'Arcos de rutas', all:'Modo completo ✨' };
  ctx.fillStyle = 'rgba(255,255,255,.52)';
  ctx.font      = '12px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Ã¯Â¿Â½Ã‚Â Países con ventas activas', 16, h - 28);
  ctx.fillStyle = 'rgba(255,255,255,.30)';
  ctx.fillText(`Modo: ${modeLabels[mode] || mode}`, 16, h - 10);

  // ── 11. MINI LEYENDA COROPLETA ──
  if (doChoropleth) {
    const lx = w - 110, ly = h - 60, lw = 80, lh = 10;
    const lgrd = ctx.createLinearGradient(lx, 0, lx + lw, 0);
    lgrd.addColorStop(0, 'hsl(140,55%,28%)');
    lgrd.addColorStop(0.5, 'hsl(70,75%,42%)');
    lgrd.addColorStop(1, 'hsl(0,90%,50%)');
    ctx.fillStyle = lgrd;
    ctx.beginPath(); ctx.roundRect(lx, ly, lw, lh, 3); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = '9px Inter,sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('Bajo', lx, ly + lh + 11);
    ctx.textAlign = 'right';
    ctx.fillText('Alto', lx + lw, ly + lh + 11);
  }
}

// GRÃ¯Â¿Â½Ã‚ÂFICO DE LÃ¯Â¿Â½Ã‚ÂNEA — ingresos por día
// =============================================================
function drawLine(canvas, series) {
  const ctx    = canvas.getContext("2d");
  const dpr    = window.devicePixelRatio || 1;
  const CHART_H = 260;

  canvas.style.height  = CHART_H + "px";
  canvas.style.display = "block";

  // Read width AFTER ensuring display:block so layout is computed
  const rect = canvas.getBoundingClientRect();
  const cw   = rect.width || canvas.offsetWidth || canvas.parentElement?.offsetWidth || 0;

  // If still no width, retry with delay (max 5 attempts)
  canvas._rAttempt = (canvas._rAttempt || 0) + 1;
  if (!cw && canvas._rAttempt < 6) { setTimeout(() => drawLine(canvas, series), 100 * canvas._rAttempt); return; }
  canvas._rAttempt = 0;
  const finalW = cw || 600;

  canvas.width  = finalW * dpr;
  canvas.height = CHART_H * dpr;
  ctx.scale(dpr, dpr);

  const w = finalW, h = CHART_H, p = 38;
  ctx.clearRect(0, 0, w, h);

  // Cuadrícula horizontal
  ctx.strokeStyle = "rgba(255,255,255,.07)"; ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const y = p + i * ((h - p * 2) / 3);
    ctx.beginPath(); ctx.moveTo(p, y); ctx.lineTo(w - p, y); ctx.stroke();
  }

  if (!series.length) {
    ctx.fillStyle = "rgba(255,255,255,.4)"; ctx.font = "14px Inter, sans-serif"; ctx.textAlign = "center";
    ctx.fillText("Sin datos en el periodo seleccionado", w / 2, h / 2); return;
  }

  const max = Math.max(...series.map(x => x.value), 1);
  const pts = series.map((s, i) => ({
    x: p + (i / Math.max(series.length - 1, 1)) * (w - p * 2),
    y: h - p - (s.value / max) * (h - p * 2)
  }));

  // Ã¯Â¿Â½Ã‚Ârea rellena
  const grd = ctx.createLinearGradient(0, p, 0, h - p);
  grd.addColorStop(0, "rgba(239,35,60,.30)"); grd.addColorStop(1, "rgba(239,35,60,0)");
  ctx.beginPath();
  pts.forEach((pt, i) => i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y));
  ctx.lineTo(pts.at(-1).x, h - p); ctx.lineTo(pts[0].x, h - p);
  ctx.closePath(); ctx.fillStyle = grd; ctx.fill();

  // Línea
  ctx.beginPath();
  pts.forEach((pt, i) => i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y));
  ctx.strokeStyle = "#ef233c"; ctx.lineWidth = 2.5; ctx.lineJoin = "round"; ctx.stroke();

  // Etiquetas del eje X
  ctx.fillStyle = "rgba(255,255,255,.48)"; ctx.font = "11px Inter, sans-serif"; ctx.textAlign = "center";
  const step = Math.ceil(series.length / 8);
  series.forEach((s, i) => { if (i % step === 0) ctx.fillText(s.label, pts[i].x, h - 10); });
}

// =============================================================
// EXPORTAR CSV (con BOM para Excel)
// =============================================================
function exportCSV() {
  const rows = [
    ["pedido","fecha","cliente","email","pais","ciudad","estado","pago","cursos","total"],
    ...state.filtered.map(o => [
      o.number || o.id, o.date, o.customer || "", o.customer_email || "",
      o.country || "", o.city || "", statusNorm(o.status),
      o.payment_method || "", (o.products||[]).map(p => p.name).join(" | "), o.total || 0
    ])
  ];
  const csv  = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = `crm-global-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  toast(`CSV exportado · ${state.filtered.length} pedidos`, "success");
}

// =============================================================
// FORECASTING DE INGRESOS (regresión lineal simple)
// =============================================================
function renderForecast() {
  const el = $("#forecastBars");
  if (!el) return;

  const g = groupBy(state.orders.filter(o => {
    const d = new Date(o.date); const now = new Date();
    const from = new Date(now); from.setDate(now.getDate() - 90);
    return d >= from && d <= now;
  }), o => String(o.date).slice(0, 10));

  const series = Object.keys(g).sort().map(date => ({
    date: new Date(date),
    value: sum(validRevenueOrders(g[date]), netRev)
  }));

  if (series.length < 5) {
    el.innerHTML = `<p style="color:var(--muted)">Se necesitan al menos 5 días de datos históricos.</p>`;
    if ($("#forecastBadge")) $("#forecastBadge").textContent = '—';
    return;
  }

  // Regresión lineal: y = a + bx
  const n  = series.length;
  const xs = series.map((_, i) => i);
  const ys = series.map(s => s.value);
  const mx = xs.reduce((s,x) => s+x, 0) / n;
  const my = ys.reduce((s,y) => s+y, 0) / n;
  const b  = xs.reduce((s,x,i) => s + (x-mx)*(ys[i]-my), 0) / xs.reduce((s,x) => s+(x-mx)**2, 0);
  const a  = my - b * mx;

  const lastDate  = series.at(-1).date;
  const forecast  = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(lastDate); d.setDate(d.getDate() + i + 1);
    const x = n + i;
    return { label: `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`, value: Math.max(0, a + b * x) };
  });

  const projTotal = forecast.reduce((s, f) => s + f.value, 0);
  if ($("#forecastBadge")) $("#forecastBadge").textContent = `Proyección: ${fmtMoney(projTotal)}`;

  const max = Math.max(...forecast.map(f => f.value), ...ys.slice(-10), 1);
  const show = forecast.filter((_, i) => i % 3 === 0 || i === 29);

  el.innerHTML = show.map(f => {
    const pct = Math.max(3, (f.value / max) * 100);
    return `<div class="rv-row">
      <span class="rv-date">${esc(f.label)}</span>
      <div class="rv-track"><div class="rv-fill" style="width:${pct.toFixed(1)}%;background:linear-gradient(90deg,#6366f1,#38bdf8)"></div></div>
      <span class="rv-amount">${fmtMoney(f.value)}</span>
    </div>`;
  }).join('');
}

// =============================================================
// RFM SCATTER (SVG)
// =============================================================
function renderRfmScatter() {
  const el = $("#rfmScatter");
  if (!el) return;

  const allC = Object.values(customerMap(state.orders));
  const list = Object.values(customerMap(state.filtered));
  if (!list.length) { el.innerHTML = `<p style="color:var(--muted);padding:20px">Sin datos.</p>`; return; }

  const now   = Date.now();
  const maxRev = Math.max(...list.map(c => c.revenue), 1);
  const maxOrd = Math.max(...list.map(c => c.orders), 1);
  const maxDays = 365;

  const W = 540, H = 280, padL = 40, padB = 30, padT = 10, padR = 10;

  const colors = { 'Ã¯Â¿Â½Ã‚Â VIP':'#fbbf24', '🔥 Activo':'#ef233c', '⚡ Potencial':'#38bdf8', '😴 En riesgo':'#f59e0b', 'Ã¯Â¿Â½Ã‚Â� Inactivo':'#9ca3af' };

  const dots = list.slice(0, 120).map(c => {
    const rfm   = rfmScore(c, allC);
    const days  = Math.min((now - new Date(c.last)) / 864e5, maxDays);
    const x     = padL + ((maxOrd - c.orders) / maxOrd) * (W - padL - padR);  // left=more orders
    const y     = padT + (days / maxDays) * (H - padT - padB);                 // top=recent
    const r     = 4 + Math.sqrt(c.revenue / maxRev) * 14;
    const color = colors[rfm.label] || '#9ca3af';
    return `<circle class="scatter-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}"
      fill="${color}" fill-opacity=".72" stroke="${color}" stroke-width="1"
      title="${esc(c.name)} · ${rfm.label} · ${fmtMoney(c.revenue)}">
      <title>${esc(c.name)} — ${rfm.label} — ${fmtMoney(c.revenue)}</title>
    </circle>`;
  }).join('');

  // Axis labels
  const axisX = `<text x="${padL}" y="${H}" font-size="9" fill="#9ca3af">Más freq.</text>
    <text x="${W-padR-50}" y="${H}" font-size="9" fill="#9ca3af">Menos freq.</text>`;
  const axisY = `<text x="2" y="${padT+8}" font-size="9" fill="#9ca3af">Recientes</text>
    <text x="2" y="${H-padB}" font-size="9" fill="#9ca3af">Inactivos</text>`;

  // Legend
  const legend = Object.entries(colors).map(([label, color], i) =>
    `<g transform="translate(${padL + i * 100},${H - 4})">
       <circle cx="5" cy="-4" r="5" fill="${color}" fill-opacity=".8"/>
       <text x="13" y="0" font-size="9" fill="#9ca3af">${label.replace(/[^\w\s]/g,'').trim()}</text>
     </g>`
  ).join('');

  el.innerHTML = `<svg class="rfm-scatter-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    ${dots}${axisX}${axisY}
  </svg>`;
}

// =============================================================
// ANÃ¯Â¿Â½Ã‚ÂLISIS DE ABANDONO
// =============================================================
function renderAbandonAnalysis() {
  const el = $("#abandonList");
  if (!el) return;

  const map = {};
  state.filtered.forEach(o => {
    (o.products || []).forEach(p => {
      const n = p.name || 'Sin nombre';
      map[n] ??= { total: 0, cancelled: 0, refunded: 0, revenue: 0 };
      map[n].total++;
      if (statusNorm(o.status) === 'cancelled') map[n].cancelled++;
      if (statusNorm(o.status) === 'refunded')  map[n].refunded++;
      if (['completed','processing'].includes(statusNorm(o.status))) map[n].revenue += netRev(o);
    });
  });

  const list = Object.entries(map)
    .map(([name, d]) => ({ name, ...d, abandonRate: d.total ? (d.cancelled + d.refunded) / d.total * 100 : 0 }))
    .filter(x => x.total >= 2)
    .sort((a, b) => b.abandonRate - a.abandonRate)
    .slice(0, 10);

  if (!list.length) { el.innerHTML = `<p style="color:var(--muted);padding:10px">Sin datos suficientes.</p>`; return; }

  if ($("#abandonBadge")) $("#abandonBadge").textContent = `${list.length} cursos analizados`;

  const maxRate = Math.max(...list.map(l => l.abandonRate), 1);
  el.innerHTML = list.map(l => {
    const pct = Math.max(3, (l.abandonRate / maxRate) * 100);
    const color = l.abandonRate > 30 ? '#ef233c' : l.abandonRate > 15 ? '#f59e0b' : '#22c55e';
    return `<div class="pb-row">
      <span class="pb-label" title="${esc(l.name)}">${esc(l.name.length > 22 ? l.name.slice(0,22)+'…' : l.name)}</span>
      <div class="pb-track"><div class="pb-fill" style="width:${pct.toFixed(1)}%;background:${color}"></div></div>
      <span class="pb-val" style="color:${color}">${l.abandonRate.toFixed(0)}%</span>
    </div>`;
  }).join('');
}

// =============================================================
// EMBUDO POR CURSO
// =============================================================
function renderCoursesFunnel() {
  const el = $("#coursesFunnel");
  if (!el) return;

  const map = {};
  state.filtered.forEach(o => {
    (o.products || []).forEach(p => {
      const n = p.name || 'Sin nombre';
      map[n] ??= { total: 0, completed: 0, revenue: 0 };
      map[n].total++;
      if (['completed','processing'].includes(statusNorm(o.status))) {
        map[n].completed++;
        map[n].revenue += netRev(o);
      }
    });
  });

  const list = Object.entries(map)
    .map(([name, d]) => ({ name, ...d, rate: d.total ? d.completed / d.total * 100 : 0 }))
    .filter(x => x.total >= 1)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 12);

  el.innerHTML = `
    <div class="cf-row" style="margin-bottom:6px">
      <strong style="font-size:11px;color:var(--muted)">Curso</strong>
      <strong style="font-size:11px;color:var(--muted)">Conv. rate</strong>
      <strong style="font-size:11px;color:var(--muted);text-align:right">Completados</strong>
      <strong style="font-size:11px;color:var(--muted);text-align:right">Cancelados</strong>
    </div>` + list.map(l => {
    const cancelled = l.total - l.completed;
    return `<div class="cf-row">
      <span class="cf-name" title="${esc(l.name)}">${esc(l.name.length > 26 ? l.name.slice(0,26)+'…' : l.name)}</span>
      <div class="cf-track"><div class="cf-fill" style="width:${Math.max(3,l.rate).toFixed(1)}%"></div></div>
      <span class="cf-rate">${l.rate.toFixed(0)}%</span>
      <span class="cf-cancel">${cancelled > 0 ? `-${cancelled}` : '—'}</span>
    </div>`;
  }).join('') || `<p style="color:var(--muted)">Sin datos.</p>`;
}

// =============================================================
// ANÃ¯Â¿Â½Ã‚ÂLISIS DE PRECIOS
// =============================================================
function renderPriceDistribution() {
  const el = $("#priceDistribution");
  if (!el) return;

  const buckets = [
    ['$0–$25',    0,  25],
    ['$26–$50',  26,  50],
    ['$51–$100', 51, 100],
    ['$101–$200',101, 200],
    ['$201–$500',201, 500],
    ['$500+',    501, Infinity]
  ];

  const counts = buckets.map(([label, min, max]) => ({
    label,
    count: validRevenueOrders(state.filtered).filter(o => {
      const t = Number(o.total || 0); return t >= min && t <= max;
    }).length
  }));

  const total = counts.reduce((s, c) => s + c.count, 0) || 1;
  const max   = Math.max(...counts.map(c => c.count), 1);

  if ($("#priceAnalysisBadge")) $("#priceAnalysisBadge").textContent = `${total} pedidos válidos`;

  el.innerHTML = counts.map(c => {
    const pct = Math.max(3, (c.count / max) * 100);
    return `<div class="pd-row">
      <span class="pd-label">${esc(c.label)}</span>
      <div class="pd-track"><div class="pd-fill" style="width:${pct.toFixed(1)}%"></div></div>
      <span class="pd-count">${c.count} (${(c.count/total*100).toFixed(0)}%)</span>
    </div>`;
  }).join('');
}

// =============================================================
// KANBAN DE LEADS
// =============================================================
const KANBAN_STATE = (function() {
  try { return JSON.parse(localStorage.getItem('crm_kanban') || '{}'); }
  catch(e) { return {}; }
})();

function saveKanban() {
  try { localStorage.setItem('crm_kanban', JSON.stringify(KANBAN_STATE)); } catch(e) {}
}

function renderKanban() {
  const { pendingLeads, cancelledLeads, inactiveLeads, upsellLeads } = opoLeads();
  const allLeads = [...pendingLeads, ...cancelledLeads, ...inactiveLeads, ...upsellLeads];

  // Agregar leads nuevos al kanban si no existen
  allLeads.forEach(l => {
    const id = l.email || l.name;
    if (!KANBAN_STATE[id]) KANBAN_STATE[id] = { status: 'new', lead: l };
    else KANBAN_STATE[id].lead = l;  // actualizar datos
  });

  const cols = { new: [], contacted: [], won: [], lost: [] };
  Object.entries(KANBAN_STATE).forEach(([id, s]) => {
    if (cols[s.status]) cols[s.status].push({ id, ...s });
  });

  ['new','contacted','won','lost'].forEach(col => {
    const list  = document.querySelector(`#kn-${col}`);
    const count = document.querySelector(`#kn-${col}-count`);
    if (!list) return;
    if (count) count.textContent = cols[col].length;

    list.innerHTML = cols[col].map(({ id, lead }) => {
      if (!lead) return '';
      const initials = (lead.name || '??').split(' ').map(w => w[0] || '').join('').slice(0,2).toUpperCase();
      const otherCols = ['new','contacted','won','lost'].filter(c => c !== col);
      const mvBtns = otherCols.map(c => {
        const labels = { new:'Nuevo', contacted:'Contactado', won:'✅ Ganado', lost:'Ã¯Â¿Â½Ã‚Â� Perdido' };
        return `<button class="kanban-move-btn" onclick="kanbanMove('${esc(id)}','${c}')">${labels[c]}</button>`;
      }).join('');

      return `<div class="kanban-card" draggable="true" data-id="${esc(id)}"
          ondragstart="kanbanDragStart(event)" ondragend="kanbanDragEnd(event)">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <div class="avatar" style="width:28px;height:28px;font-size:11px">${esc(initials)}</div>
          <div>
            <div class="kanban-card-name">${esc(lead.name)}</div>
            <div class="kanban-card-meta">${esc(lead.email || '')}</div>
          </div>
        </div>
        <div class="kanban-card-tag">${lead.tag || ''}</div>
        <div class="kanban-card-value">${fmtMoney(lead.value)}</div>
        <div class="kanban-card-actions">${mvBtns}</div>
      </div>`;
    }).join('') || `<div style="color:var(--muted);font-size:12px;padding:10px;text-align:center">Sin leads</div>`;
  });

  // Drag-over targets
  document.querySelectorAll('.kanban-list').forEach(list => {
    list.ondragover  = e => { e.preventDefault(); list.closest('.kanban-col').classList.add('drag-over'); };
    list.ondragleave = ()  => list.closest('.kanban-col').classList.remove('drag-over');
    list.ondrop      = e  => {
      e.preventDefault();
      list.closest('.kanban-col').classList.remove('drag-over');
      const id  = e.dataTransfer.getData('text/plain');
      const col = list.closest('.kanban-col').dataset.status;
      kanbanMove(id, col);
    };
  });
}

function kanbanDragStart(e) {
  e.dataTransfer.setData('text/plain', e.currentTarget.dataset.id);
  e.currentTarget.classList.add('dragging');
}
function kanbanDragEnd(e) { e.currentTarget.classList.remove('dragging'); }

function kanbanMove(id, newStatus) {
  if (KANBAN_STATE[id]) {
    KANBAN_STATE[id].status = newStatus;
    saveKanban();
    renderKanban();
    const labels = { new:'Nuevo', contacted:'Contactado', won:'Ganado ✅', lost:'Perdido Ã¯Â¿Â½Ã‚Â�' };
    toast(`Lead movido a: ${labels[newStatus]}`, 'success');
  }
}

function kanbanExportCSV() {
  const rows = [['nombre','email','tag','valor','estado']];
  Object.entries(KANBAN_STATE).forEach(([id, { status, lead }]) => {
    if (!lead) return;
    rows.push([lead.name, lead.email, lead.tag?.replace(/[^\w\s]/g,'').trim() || '', lead.value.toFixed(2), status]);
  });
  const csv = '\uFEFF' + rows.map(r => r.map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const a   = document.createElement('a');
  a.href    = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `kanban-leads-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  toast('Kanban exportado', 'success');
}

// =============================================================
// COMPARATIVA DE CURSOS
// =============================================================
function populateCourseSelects() {
  const courses = topProducts(state.filtered).slice(0, 30);
  const opts    = courses.map(c => `<option value="${esc(c.name)}">${esc(c.name.length > 50 ? c.name.slice(0,50)+'…' : c.name)}</option>`).join('');
  const a = $("#compareA"), b = $("#compareB");
  if (a) a.innerHTML = '<option value="">-- Selecciona --</option>' + opts;
  if (b) b.innerHTML = '<option value="">-- Selecciona --</option>' + opts;
}

function runCourseCompare() {
  const nameA = $("#compareA")?.value;
  const nameB = $("#compareB")?.value;
  const el    = $("#compareResult");
  if (!el) return;
  if (!nameA || !nameB || nameA === nameB) {
    el.innerHTML = `<p style="color:var(--muted)">Selecciona dos cursos diferentes para comparar.</p>`; return;
  }

  const getCourse = name => {
    const orders = state.filtered.filter(o => (o.products||[]).some(p => p.name === name));
    const valid  = validRevenueOrders(orders);
    const cancelled = orders.filter(o => statusNorm(o.status) === 'cancelled').length;
    const uniqueC = new Set(orders.map(o => o.customer_email || o.customer));
    return {
      name,
      revenue:   sum(valid, netRev),
      sales:     orders.length,
      completed: valid.length,
      cancelled,
      customers: uniqueC.size,
      convRate:  orders.length ? (valid.length / orders.length * 100) : 0,
      avgTicket: valid.length ? sum(valid, netRev) / valid.length : 0,
    };
  };

  const a = getCourse(nameA), b = getCourse(nameB);
  const maxRev = Math.max(a.revenue, b.revenue, 1);

  const card = (c, color) => `
    <div class="compare-card">
      <h3>${esc(c.name.length > 40 ? c.name.slice(0,40)+'…' : c.name)}</h3>
      <div class="compare-row"><span>Ingresos</span><strong>${fmtMoney(c.revenue)}</strong></div>
      <div class="compare-row"><span>Pedidos</span><strong>${c.sales}</strong></div>
      <div class="compare-row"><span>Completados</span><strong>${c.completed}</strong></div>
      <div class="compare-row"><span>Cancelados</span><strong style="color:var(--accent)">${c.cancelled}</strong></div>
      <div class="compare-row"><span>Clientes únicos</span><strong>${c.customers}</strong></div>
      <div class="compare-row"><span>Tasa conversión</span><strong>${c.convRate.toFixed(1)}%</strong></div>
      <div class="compare-row"><span>Ticket medio</span><strong>${fmtMoney(c.avgTicket)}</strong></div>
      <div class="compare-bar-wrap">
        <div class="compare-bar-label">Revenue relativo</div>
        <div class="compare-bar-track">
          <div class="compare-bar-fill" style="width:${(c.revenue/maxRev*100).toFixed(1)}%;background:${color}"></div>
        </div>
      </div>
    </div>`;

  el.innerHTML = card(a, '#ef233c') + card(b, '#38bdf8');
}

// =============================================================
// ETIQUETAS DE CLIENTES (localStorage)
// =============================================================
function getCustomerTags(key) {
  try { return JSON.parse(localStorage.getItem('crm_tags_' + encodeURIComponent(key)) || '[]'); }
  catch(e) { return []; }
}
function saveCustomerTags(key, tags) {
  try { localStorage.setItem('crm_tags_' + encodeURIComponent(key), JSON.stringify(tags)); } catch(e) {}
}
function renderModalTags(noteKey) {
  const tags = getCustomerTags(noteKey);
  const list = $("#modalTagsList");
  if (!list) return;
  list.innerHTML = tags.map(t =>
    `<span class="modal-tag">${esc(t)} <span class="modal-tag-rm" data-tag="${esc(t)}">×</span></span>`
  ).join('');
  list.querySelectorAll('.modal-tag-rm').forEach(btn => {
    btn.addEventListener('click', () => {
      const newTags = tags.filter(t => t !== btn.dataset.tag);
      saveCustomerTags(noteKey, newTags);
      renderModalTags(noteKey);
    });
  });
}

// =============================================================
// SEGUIMIENTOS PROGRAMADOS
// =============================================================
function getFollowups() {
  try { return JSON.parse(localStorage.getItem('crm_followups') || '{}'); }
  catch(e) { return {}; }
}
function saveFollowup(key, date) {
  const f = getFollowups();
  if (date) f[key] = date; else delete f[key];
  try { localStorage.setItem('crm_followups', JSON.stringify(f)); } catch(e) {}
}
function updateFollowupBadges() {
  const f      = getFollowups();
  const today  = new Date().toISOString().slice(0,10);
  const overdue = Object.values(f).filter(d => d <= today).length;
  $$('.nav-btn').forEach(btn => {
    btn.querySelectorAll('.followup-badge').forEach(b => b.remove());
    if (btn.dataset.view === 'crm' && overdue > 0) {
      btn.insertAdjacentHTML('beforeend', `<span class="followup-badge">${overdue}</span>`);
    }
  });
}

// =============================================================
// MODAL — extender openCustomerModal con etiquetas y seguimientos
// =============================================================
function openCustomerModal(emailOrName) {
  const cm = customerMap(state.orders);
  const c  = cm[emailOrName] || Object.values(cm).find(x => x.email === emailOrName || x.name === emailOrName);
  if (!c) return;

  const allCustomers = Object.values(cm);
  const rfm  = rfmScore(c, allCustomers);
  const pred = nextPurchasePrediction(c.email || c.name);

  $("#modalTitle").textContent = c.name;
  $("#modalMeta").textContent  = `${c.email || ''} · ${c.orders} pedidos · ${fmtMoney(c.revenue)} total`;

  $("#modalRfm").innerHTML = `
    <span class="rfm-badge ${rfm.cls}" style="font-size:13px;padding:5px 14px">${rfm.label} · Score: ${rfm.score}/100</span>
    ${pred ? `<span class="rfm-badge rfm-pred" style="font-size:12px;padding:4px 12px">${
      pred.daysLeft > 0
        ? `🗓 Próx. compra estimada en ~${pred.daysLeft} días`
        : `⚡ Compra esperada hace ${Math.abs(pred.daysLeft)} días`
    }</span>` : ''}`;

  const customerOrders = state.orders
    .filter(o => o.customer_email === (c.email || c.name) || o.customer === c.name)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const stIcon = s => ({ completed:'✅', processing:'Ã¯Â¿Â½Ã‚Â�', pending:'🔔', cancelled:'Ã¯Â¿Â½Ã‚Â�', refunded:'↩' }[s] || '📦');

  $("#modalTimeline").innerHTML = customerOrders.map(o => {
    const st      = statusNorm(o.status);
    const courses = (o.products || []).map(p => p.name).join(', ') || 'Curso';
    return `<div class="tl-item">
      <div class="tl-dot ${st}"></div>
      <div class="tl-body">
        <div class="tl-header">
          <strong>${esc(o.number || o.id)}</strong>
          <span class="tl-status">${stIcon(st)} ${st}</span>
          <strong class="tl-amount">${fmtMoney(o.total)}</strong>
          <span class="tl-date">${fmtDate(o.date)}</span>
        </div>
        <div class="tl-courses">${esc(courses.length > 100 ? courses.slice(0,100)+'…' : courses)}</div>
      </div>
    </div>`;
  }).join('') || `<p style="color:var(--muted)">Sin pedidos registrados.</p>`;

  // Cargar nota guardada
  const noteKey = 'crm_note_' + encodeURIComponent(c.email || c.name);
  try {
    $("#modalNotes").value = localStorage.getItem(noteKey) || '';
    $("#modalNotes").dataset.noteKey = noteKey;
  } catch(e) { $("#modalNotes").value = ''; }

  // Cargar etiquetas
  renderModalTags(noteKey);
  const tagInput = $("#modalTagInput");
  if (tagInput) { tagInput.value = ''; tagInput.dataset.noteKey = noteKey; }

  // Cargar seguimiento
  const followupInput = $("#modalFollowupDate");
  if (followupInput) {
    const f = getFollowups();
    followupInput.value = f[noteKey] || '';
    followupInput.dataset.noteKey = noteKey;
    const savedMsg = $("#modalFollowupSaved");
    if (savedMsg) savedMsg.style.display = 'none';
  }

  // Cargar tareas del cliente
  const taskInput = $("#modalTaskInput");
  const taskDue   = $("#modalTaskDue");
  if (taskInput) { taskInput.dataset.noteKey = noteKey; taskInput.value = ""; }
  if (taskDue)   { taskDue.dataset.noteKey   = noteKey; taskDue.value   = ""; }
  renderCustomerTasks(noteKey);

  $("#modalNoteSaved").style.display = 'none';
  $("#customerModal").classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeCustomerModal() {
  $("#customerModal").classList.add('hidden');
  document.body.style.overflow = '';
}

// =============================================================
// MAPA DE CALOR: VENTAS POR HORA Y DÃ¯Â¿Â½Ã‚ÂA
// =============================================================
function renderHeatmap() {
  const el = $("#salesHeatmap");
  if (!el) return;

  const days  = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const grid  = Array.from({ length: 7 }, () => new Array(24).fill(0));
  validRevenueOrders(state.filtered).forEach(o => {
    const d = new Date(o.date);
    if (!isNaN(d)) grid[d.getDay()][d.getHours()]++;
  });
  const max = Math.max(...grid.flat(), 1);

  let html = '<div class="heatmap-grid"><div class="hm-corner"></div>';
  for (let h = 0; h < 24; h++) html += `<div class="hm-hour">${h}h</div>`;
  days.forEach((day, di) => {
    html += `<div class="hm-day">${day}</div>`;
    for (let h = 0; h < 24; h++) {
      const v   = grid[di][h];
      const a   = v ? (0.08 + (v / max) * 0.92).toFixed(2) : '0.04';
      const bg  = v ? `rgba(239,35,60,${a})` : 'rgba(255,255,255,.03)';
      html += `<div class="hm-cell" style="background:${bg}" title="${day} ${h}:00 — ${v} pedido${v!==1?'s':''}"></div>`;
    }
  });
  html += '</div><div class="hm-legend"><span>Menos</span><div class="hm-scale"></div><span>Más ventas</span></div>';
  el.innerHTML = html;
}

// =============================================================
// ANÃ¯Â¿Â½Ã‚ÂLISIS DE COHORTES
// =============================================================
function renderCohorts() {
  const tbl = $("#cohortTable");
  if (!tbl) return;

  const cm = customerMap(state.orders);
  const cohorts = {};

  Object.values(cm).forEach(c => {
    const cOrders = state.orders
      .filter(o => o.customer_email === (c.email || c.name) || o.customer === c.name)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    if (!cOrders.length) return;
    const firstD   = new Date(cOrders[0].date);
    const key      = `${firstD.getFullYear()}-${String(firstD.getMonth()+1).padStart(2,'0')}`;
    cohorts[key] ??= { total: 0, months: {} };
    cohorts[key].total++;
    cOrders.forEach(o => {
      const d = new Date(o.date);
      const mDiff = (d.getFullYear() - firstD.getFullYear()) * 12 + d.getMonth() - firstD.getMonth();
      if (mDiff > 0 && mDiff <= 6) cohorts[key].months[mDiff] = (cohorts[key].months[mDiff] || 0) + 1;
    });
  });

  const keys = Object.keys(cohorts).sort().slice(-8);
  if (!keys.length) {
    tbl.innerHTML = `<tbody><tr><td>${empty("Sin datos suficientes para cohortes.")}</td></tr></tbody>`;
    if ($("#cohortBadge")) $("#cohortBadge").textContent = '—';
    return;
  }

  if ($("#cohortBadge")) $("#cohortBadge").textContent = `${keys.length} cohortes`;

  let thead = `<thead><tr><th>Cohorte</th><th>Clientes</th>`;
  for (let m = 1; m <= 6; m++) thead += `<th>+${m}m</th>`;
  thead += `</tr></thead>`;

  const tbody = `<tbody>${keys.map(key => {
    const c = cohorts[key];
    let row = `<tr><td class="cm-name"><strong>${key}</strong></td><td><strong>${c.total}</strong></td>`;
    for (let m = 1; m <= 6; m++) {
      const ret = c.months[m] || 0;
      const pct = c.total ? (ret / c.total * 100) : 0;
      const bg  = pct > 0 ? `rgba(34,197,94,${Math.min(0.85, pct / 100 * 4).toFixed(2)})` : 'transparent';
      const col = pct > 25 ? '#fff' : 'var(--muted)';
      row += `<td class="cm-cell" style="background:${bg};color:${col}">${pct > 0 ? pct.toFixed(0)+'%' : '—'}</td>`;
    }
    return row + '</tr>';
  }).join('')}</tbody>`;

  tbl.innerHTML = thead + tbody;
}

// =============================================================
// POLLING — actualización automática en tiempo real
// =============================================================
let _pollingTimer    = null;
let _pollingCountdown = null;
let _pollingSeconds  = 0;

function initPolling(minutes) {
  // Limpiar timers previos
  if (_pollingTimer)    { clearInterval(_pollingTimer);    _pollingTimer    = null; }
  if (_pollingCountdown){ clearInterval(_pollingCountdown); _pollingCountdown = null; }

  const btn    = $("#pollingToggle");
  const status = $("#pollingStatus");
  const cfgInp = $("#cfgPollingInterval");

  if (!minutes || minutes <= 0 || CONFIG.mode !== 'api') {
    if (btn)    btn.textContent    = '🔴 Live OFF';
    if (status) status.textContent = CONFIG.mode !== 'api' ? 'Conecta a WooCommerce primero.' : 'Auto-actualización desactivada.';
    localStorage.removeItem('crm_polling_min');
    return;
  }

  // Guardar preferencia
  localStorage.setItem('crm_polling_min', String(minutes));
  if (cfgInp) cfgInp.value = minutes;

  _pollingSeconds = minutes * 60;

  function updateCountdown() {
    _pollingSeconds--;
    if (_pollingSeconds < 0) _pollingSeconds = minutes * 60;
    const m = Math.floor(_pollingSeconds / 60);
    const s = String(_pollingSeconds % 60).padStart(2, '0');
    if (btn)    btn.textContent    = `🟢 Live — ${m}:${s}`;
    if (status) status.textContent = `Próxima actualización en ${m}:${s}`;
  }

  updateCountdown();
  _pollingCountdown = setInterval(updateCountdown, 1000);

  _pollingTimer = setInterval(() => {
    load().then(() => {
      _pollingSeconds = minutes * 60;
      toast('✅ Datos actualizados desde WooCommerce', 'success');
    });
  }, minutes * 60000);
}

function autoStartPolling() {
  if (CONFIG.mode !== 'api') return;
  // Recuperar preferencia guardada, o usar 2 min por defecto
  const saved = parseInt(localStorage.getItem('crm_polling_min') || '2');
  const min   = saved > 0 ? saved : 2;
  initPolling(min);
}

// =============================================================
// MODO CLARO / OSCURO
// =============================================================
function toggleTheme() {
  const app   = document.querySelector('.app');
  const btn   = $("#themeToggle");
  const light = app.classList.toggle('light-mode');
  btn.textContent = light ? '🌙 Modo oscuro' : '☀ Modo claro';
  try { localStorage.setItem('crm_theme', light ? 'light' : 'dark'); } catch(e) {}
}

// =============================================================
// EXPORTAR CLIENTES CSV
// =============================================================
function exportCustomersCSV() {
  const allC = Object.values(customerMap(state.orders));
  const list = Object.values(customerMap(state.filtered)).sort((a, b) => b.revenue - a.revenue);
  const rows = [
    ['nombre','email','pedidos','cursos','ingresos','rfm_label','rfm_score','ultima_compra'],
    ...list.map(c => {
      const rfm = rfmScore(c, allC);
      return [c.name, c.email, c.orders, c.courses.size, c.revenue.toFixed(2), rfm.label.replace(/[^\w\s]/g,'').trim(), rfm.score, c.last?.slice(0,10)||''];
    })
  ];
  const csv  = '\uFEFF' + rows.map(r => r.map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `clientes-rfm-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  toast(`Clientes exportados: ${list.length}`, 'success');
}

// =============================================================
// ENLAZAR EVENTOS
// =============================================================
function bind() {
  $$(".nav-btn").forEach(btn =>
    btn.addEventListener("click", () => switchView(btn.dataset.view))
  );

  $("#rangePreset").addEventListener("change", () => {
    const custom = $("#rangePreset").value === "custom";
    $$(".custom-date").forEach(x => x.classList.toggle("hidden", !custom));
    if (CONFIG.mode === "api") load(); else applyFilters();
  });

  const debouncedFilter = debounce(applyFilters, 260);
  ["fromDate","toDate","statusFilter","countryFilter"].forEach(id =>
    $("#" + id).addEventListener("change", applyFilters)
  );
  $("#searchInput").addEventListener("input", debouncedFilter);

  $("#refreshBtn").addEventListener("click", load);
  $("#exportBtn").addEventListener("click", exportCSV);

  $("#autoRotateBtn").addEventListener("click", () => {
    state.globe.autoRotate = !state.globe.autoRotate;
    $("#autoRotateBtn").classList.toggle("active", state.globe.autoRotate);
  });
  $("#resetGlobeBtn").addEventListener("click", () => {
    state.globe.rotationX = -10; state.globe.rotationY = -35;
    _zoom.target = 1; _zoom.current = 1; state.globe.zoom = 1;
  });

  window.addEventListener("resize", debounce(() => renderRevenueChart(), 150));

  // ── Modos visuales del globo ──
  $$('.globe-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      GLOBE_MODE = btn.dataset.mode;
      try { localStorage.setItem('crm_globe_mode', GLOBE_MODE); } catch(e) {}
      $$('.globe-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
  // Marcar activo al cargar
  $$('.globe-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === GLOBE_MODE));

  // ── Modo claro/oscuro ──
  $("#themeToggle")?.addEventListener("click", toggleTheme);

  // ── Modal de cliente ──
  $("#modalClose")?.addEventListener("click", closeCustomerModal);
  $("#customerModal")?.addEventListener("click", e => {
    if (e.target === e.currentTarget) closeCustomerModal();
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeCustomerModal(); });
  $("#modalSaveNote")?.addEventListener("click", () => {
    try {
      const key = $("#modalNotes").dataset.noteKey;
      if (key) {
        localStorage.setItem(key, $("#modalNotes").value);
        const saved = $("#modalNoteSaved");
        if (saved) { saved.style.display = 'inline'; setTimeout(() => saved.style.display = 'none', 2000); }
        toast('Nota guardada', 'success');
      }
    } catch(e) { toast('No se pudo guardar la nota', 'error'); }
  });

  // ── Búsqueda + ordenación en CRM ──
  $("#crmSearch")?.addEventListener("input",  debounce(() => renderCustomers(), 200));
  $("#crmSort")?.addEventListener("change",   () => renderCustomers());
  $("#crmLimit")?.addEventListener("change",  () => renderCustomers());

  // ── Exportar clientes CSV ──
  $("#exportCustomersBtn")?.addEventListener("click", exportCustomersCSV);

  // ── Alertas configurables ──
  $("#cfgAlertSave")?.addEventListener("click", () => {
    ALERT_CONFIG.maxPending   = parseInt($("#cfgAlertPending")?.value  || '5');
    ALERT_CONFIG.maxRefund    = parseInt($("#cfgAlertRefund")?.value   || '5');
    ALERT_CONFIG.daysInactive = parseInt($("#cfgAlertInactive")?.value || '90');
    ALERT_CONFIG.minRepeatPct = parseInt($("#cfgAlertRepeat")?.value   || '8');
    try { localStorage.setItem('crm_alert_config', JSON.stringify(ALERT_CONFIG)); } catch(e) {}
    const saved = $("#cfgAlertSaved");
    if (saved) { saved.style.display = 'inline'; setTimeout(() => saved.style.display = 'none', 2000); }
    renderAlerts();
    toast('Umbrales de alertas guardados', 'success');
  });

  // ── Polling config ──
  $("#cfgPollingSave")?.addEventListener("click", () => {
    const min = parseInt($("#cfgPollingInterval")?.value || '0');
    initPolling(min);
    toast(min > 0 ? `🟢 Live activado: actualización cada ${min} min` : '🔴 Auto-actualización desactivada', min > 0 ? 'success' : 'info');
  });

  // ── Polling toggle barra lateral ──
  $("#pollingToggle")?.addEventListener("click", () => {
    if (_pollingTimer) {
      initPolling(0);
    } else {
      const saved = parseInt(localStorage.getItem('crm_polling_min') || '2');
      autoStartPolling();
    }
  });

  // ── Configuración / conexión ──
  $("#cfgShowToken")?.addEventListener("click", () => {
    const inp = $("#cfgToken");
    inp.type = inp.type === "password" ? "text" : "password";
    $("#cfgShowToken").textContent = inp.type === "password" ? "Ã¯Â¿Â½Ã‚Â Ver" : "🙈 Ocultar";
  });

  $("#cfgTestBtn")?.addEventListener("click", async () => {
    const url   = $("#cfgUrl").value.trim().replace(/\/$/, "");
    const token = $("#cfgToken").value.trim();
    const st    = $("#cfgStatus");
    if (!url || !token) { st.className = "cfg-status error"; st.textContent = "⚠ Completa la URL y el token."; return; }
    st.className = "cfg-status"; st.textContent = "Probando conexión…";
    try {
      const res = await fetch(url + "/overview?limit=1", {
        headers: { "X-CPP-CRM-Dashboard-Token": token }
      });
      const data = await res.json();
      if (res.ok && (data.orders !== undefined || data.total !== undefined)) {
        st.className = "cfg-status ok";
        st.textContent = "✅ Conexión exitosa — " + (data.total || (data.orders||[]).length) + " pedidos encontrados.";
      } else if (res.status === 403) {
        st.className = "cfg-status error"; st.textContent = "🔑 Token incorrecto (403 Forbidden).";
      } else if (res.status === 404) {
        st.className = "cfg-status error"; st.textContent = "Ã¯Â¿Â½Ã‚Â Plugin no encontrado (404). Verifica que el plugin esté activo.";
      } else {
        st.className = "cfg-status error"; st.textContent = "⚠ Respuesta inesperada: " + res.status;
      }
    } catch (e) {
      st.className = "cfg-status error";
      st.textContent = "Ã¯Â¿Â½Ã‚Â� No se pudo conectar. Verifica la URL o CORS del servidor.";
    }
  });

  $("#cfgSaveBtn")?.addEventListener("click", () => {
    const url      = $("#cfgUrl").value.trim().replace(/\/$/, "");
    const token    = $("#cfgToken").value.trim();
    const currency = $("#cfgCurrency").value;
    const st       = $("#cfgStatus");
    if (!url || !token) { st.className = "cfg-status error"; st.textContent = "⚠ Completa la URL y el token."; return; }
    CONFIG.mode       = "api";
    CONFIG.apiBaseUrl = url;
    CONFIG.apiToken   = token;
    CONFIG.currency   = currency;
    try {
      localStorage.setItem("cpp_crm_config", JSON.stringify({ url, token, currency }));
    } catch(e){}
    st.className  = "cfg-status ok";
    st.textContent = "✅ Configuración guardada. Actualizando datos reales…";
    toast("Conectado a WooCommerce — cargando datos reales", "success");
    load();
  });

  // Restaurar config guardada
  const DEFAULT_CFG = {
    url:      "https://cursospirataspro.com/wp-json/cpp-crm-dashboard/v1",
    token:    "cursospirataspro2024secret",
    currency: "USD"
  };
  try {
    const stored = JSON.parse(localStorage.getItem("cpp_crm_config") || "null");
    const saved  = (stored?.url && stored?.token) ? stored : DEFAULT_CFG;
    if (!stored?.url) localStorage.setItem("cpp_crm_config", JSON.stringify(DEFAULT_CFG));
    $("#cfgUrl").value      = saved.url;
    $("#cfgToken").value    = saved.token;
    $("#cfgCurrency").value = saved.currency || "USD";
    CONFIG.mode       = "api";
    CONFIG.apiBaseUrl = saved.url;
    CONFIG.apiToken   = saved.token;
    CONFIG.currency   = saved.currency || "USD";
  } catch(e){}

  // ── Multi-moneda ──
  const currencyEl = $("#globalCurrency");
  if (currencyEl) {
    currencyEl.value = DISPLAY_CURRENCY;
    currencyEl.addEventListener("change", () => {
      DISPLAY_CURRENCY = currencyEl.value;
      try { localStorage.setItem('crm_currency', DISPLAY_CURRENCY); } catch(e) {}
      renderAll();
    });
  }

  // ── Kanban export ──
  $("#kanbanExportBtn")?.addEventListener("click", kanbanExportCSV);

  // ── Course compare ──
  $("#compareBtn")?.addEventListener("click", runCourseCompare);

  // ── Modal: agregar etiqueta ──
  $("#modalTagAdd")?.addEventListener("click", () => {
    const inp = $("#modalTagInput");
    if (!inp) return;
    const tag = inp.value.trim();
    if (!tag) return;
    const key  = inp.dataset.noteKey;
    const tags = getCustomerTags(key);
    if (!tags.includes(tag)) { tags.push(tag); saveCustomerTags(key, tags); renderModalTags(key); }
    inp.value = '';
    toast('Etiqueta agregada', 'success');
  });

  // ── Modal: guardar seguimiento ──
  $("#modalSaveFollowup")?.addEventListener("click", () => {
    const inp = $("#modalFollowupDate");
    if (!inp) return;
    const key = inp.dataset.noteKey;
    saveFollowup(key, inp.value);
    updateFollowupBadges();
    const msg = $("#modalFollowupSaved");
    if (msg) { msg.style.display = 'inline'; setTimeout(() => msg.style.display = 'none', 2000); }
    toast('Seguimiento guardado', 'success');
  });

  // ── Modal: agregar tarea ──
  $("#modalTaskAdd")?.addEventListener("click", () => {
    const inp = $("#modalTaskInput");
    const due = $("#modalTaskDue");
    if (!inp) return;
    const key = inp.dataset.noteKey;
    addCustomerTask(key, inp.value, due?.value || "");
    inp.value = "";
    if (due) due.value = "";
    toast("Tarea añadida", "success");
  });
  $("#modalTaskInput")?.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      $("#modalTaskAdd")?.click();
    }
  });

  // ── PDF Export ──
  $("#pdfExportBtn")?.addEventListener("click", exportPDF);

  // ── Presentación ──
  initPresentationMode();

  // ── Búsqueda global ──
  initGlobalSearch();

  // ── Push notifications ──
  $("#pushNotifBtn")?.addEventListener("click", requestPushNotifications);

  // ── Period compare ──
  $("#periodCompareBtn")?.addEventListener("click", renderPeriodComparison);

  // ── Widget customizer save ──
  $("#widgetSaveBtn")?.addEventListener("click", saveWidgetConfig);

  // ── GA4 save ──
  $("#ga4SaveBtn")?.addEventListener("click", saveGA4Config);

  // ── Email marketing ──
  $("#emailSegment")?.addEventListener("change", renderEmailMarketing);
  $("#emailPreviewBtn")?.addEventListener("click", previewEmail);
  $("#emailExportBtn")?.addEventListener("click", exportEmailList);
  $("#emailSendBtn")?.addEventListener("click", sendEmailMailto);
}

// =============================================================
// SIDEBAR TOGGLE
// =============================================================
function initSidebarToggle() {
  const btn      = $("#sidebarToggle");
  const mobileBtn = $("#mobileMenuBtn");
  const backdrop = $("#sidebarBackdrop");
  const app      = document.querySelector(".app");
  if (!app) return;

  // ── Escritorio: toggle clásico ──
  function update() {
    const hidden = app.classList.contains("sidebar-hidden");
    if (btn) { btn.textContent = hidden ? "▶" : "◀"; btn.title = hidden ? "Mostrar barra lateral" : "Ocultar barra lateral"; }
  }
  btn?.addEventListener("click", () => { app.classList.toggle("sidebar-hidden"); update(); });
  update();

  // ── Móvil: hamburguesa overlay ──
  function openMobileSidebar()  { app.classList.add("sidebar-mobile-open");    if (mobileBtn) mobileBtn.textContent = "✕"; }
  function closeMobileSidebar() { app.classList.remove("sidebar-mobile-open"); if (mobileBtn) mobileBtn.textContent = "☰"; }

  mobileBtn?.addEventListener("click", () => {
    app.classList.contains("sidebar-mobile-open") ? closeMobileSidebar() : openMobileSidebar();
  });
  backdrop?.addEventListener("click", closeMobileSidebar);

  // Cerrar sidebar al clicar un item del nav en móvil
  $$(".nav-btn")?.forEach(b => b.addEventListener("click", () => {
    if (window.innerWidth <= 768) closeMobileSidebar();
  }));

  // Detectar resize para resetear estado
  window.addEventListener("resize", () => {
    if (window.innerWidth > 768) closeMobileSidebar();
  });
}

// =============================================================
// INIT
// =============================================================
(function init() {
  const now   = new Date();
  const prior = new Date(now);
  prior.setDate(now.getDate() - 30);
  $("#fromDate").value = localDateStr(prior);
  $("#toDate").value   = localDateStr(now);

  // Restaurar tema
  try {
    if (localStorage.getItem('crm_theme') === 'light') {
      document.querySelector('.app').classList.add('light-mode');
      const btn = $("#themeToggle");
      if (btn) btn.textContent = '🌙 Modo oscuro';
    }
  } catch(e) {}

  // Restaurar umbrales de alertas
  try {
    const cfgA = JSON.parse(localStorage.getItem('crm_alert_config') || 'null');
    if (cfgA) {
      if ($("#cfgAlertPending"))  $("#cfgAlertPending").value  = cfgA.maxPending   || 5;
      if ($("#cfgAlertRefund"))   $("#cfgAlertRefund").value   = cfgA.maxRefund    || 5;
      if ($("#cfgAlertInactive")) $("#cfgAlertInactive").value = cfgA.daysInactive || 90;
      if ($("#cfgAlertRepeat"))   $("#cfgAlertRepeat").value   = cfgA.minRepeatPct || 8;
    }
  } catch(e) {}

  bind();
  initGlobe();
  initSidebarToggle();
  updateFollowupBadges();
  updatePushBtn();
  loadGA4Config();
  applyWidgetConfig(loadWidgetConfig());
  load().then(() => {
    // Auto-arrancar polling en tiempo real tras primera carga
    autoStartPolling();
  });
})();
// =============================================================
// BÚSQUEDA GLOBAL (Ctrl+K)
// =============================================================
let _gsActive = false;
let _gsIdx    = -1;

function initGlobalSearch() {
  // Abrir con Ctrl+K o botón
  document.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key === "k") {
      e.preventDefault();
      openGlobalSearch();
    }
    if (e.key === "Escape" && _gsActive) closeGlobalSearch();
    if (_gsActive) navigateGS(e);
  });
  $("#globalSearchBtn")?.addEventListener("click", openGlobalSearch);
  $("#globalSearchInput")?.addEventListener("input", e => renderGlobalSearch(e.target.value));
  $(".global-search-backdrop")?.addEventListener("click", closeGlobalSearch);
}

function openGlobalSearch() {
  const modal = $("#globalSearchModal");
  if (!modal) return;
  modal.classList.remove("hidden");
  _gsActive = true;
  _gsIdx    = -1;
  const inp = $("#globalSearchInput");
  if (inp) { inp.value = ""; inp.focus(); }
  renderGlobalSearch("");
}

function closeGlobalSearch() {
  $("#globalSearchModal")?.classList.add("hidden");
  _gsActive = false;
}

function navigateGS(e) {
  const items = $$(".gs-item");
  if (!items.length) return;
  if (e.key === "ArrowDown")  { e.preventDefault(); _gsIdx = Math.min(_gsIdx + 1, items.length - 1); }
  if (e.key === "ArrowUp")    { e.preventDefault(); _gsIdx = Math.max(_gsIdx - 1, 0); }
  if (e.key === "Enter" && _gsIdx >= 0) { e.preventDefault(); items[_gsIdx]?.click(); }
  items.forEach((it, i) => it.classList.toggle("active", i === _gsIdx));
}

function renderGlobalSearch(q) {
  const box = $("#globalSearchResults");
  if (!box) return;
  const query = q.trim().toLowerCase();
  if (!query) {
    box.innerHTML = `<div class="gs-empty">Escribe para buscar clientes, pedidos o cursos…</div>`;
    return;
  }

  // Buscar clientes
  const customers = [];
  const seen = {};
  for (const o of state.filtered) {
    const key = o.customer_email || o.customer_name;
    if (seen[key]) continue;
    if ((o.customer_name||"").toLowerCase().includes(query) ||
        (o.customer_email||"").toLowerCase().includes(query)) {
      customers.push(o); seen[key] = true;
    }
    if (customers.length >= 5) break;
  }

  // Buscar pedidos
  const orders = state.filtered.filter(o =>
    String(o.id || "").includes(query) ||
    (o.course_name||"").toLowerCase().includes(query)
  ).slice(0, 5);

  // Buscar cursos
  const courseMap = {};
  for (const o of state.filtered) {
    if (!o.course_name) continue;
    const n = o.course_name.toLowerCase();
    if (n.includes(query) && !courseMap[o.course_name]) courseMap[o.course_name] = o;
  }
  const courses = Object.values(courseMap).slice(0, 4);

  let html = "";
  if (customers.length) {
    html += `<div class="gs-section">👥 Clientes</div>`;
    customers.forEach(o => {
      html += `<div class="gs-item" data-type="customer" data-key="${esc(o.customer_email||o.customer_name)}">
        <span class="gs-item-icon">👤</span>
        <div class="gs-item-main">
          <div class="gs-item-title">${esc(o.customer_name||"Sin nombre")}</div>
          <div class="gs-item-sub">${esc(o.customer_email||"")} · ${esc(o.customer_country||"")}</div>
        </div>
        <span class="gs-item-badge">${fmtMoney(o.total)}</span>
      </div>`;
    });
  }
  if (orders.length) {
    html += `<div class="gs-section">📦 Pedidos</div>`;
    orders.forEach(o => {
      html += `<div class="gs-item" data-type="order" data-id="${esc(String(o.id))}">
        <span class="gs-item-icon">📦</span>
        <div class="gs-item-main">
          <div class="gs-item-title">#${esc(String(o.id))} — ${esc(o.course_name||"Curso")}</div>
          <div class="gs-item-sub">${esc(o.customer_name||"")} · ${fmtDate(o.date)}</div>
        </div>
        <span class="gs-item-badge">${fmtMoney(o.total)}</span>
      </div>`;
    });
  }
  if (courses.length) {
    html += `<div class="gs-section">🎓 Cursos</div>`;
    courses.forEach(o => {
      html += `<div class="gs-item" data-type="course" data-name="${esc(o.course_name)}">
        <span class="gs-item-icon">🎓</span>
        <div class="gs-item-main">
          <div class="gs-item-title">${esc(o.course_name)}</div>
          <div class="gs-item-sub">${fmtMoney(o.total)} por pedido</div>
        </div>
      </div>`;
    });
  }
  if (!html) html = `<div class="gs-empty">Sin resultados para "<strong>${esc(q)}</strong>"</div>`;

  box.innerHTML = html;

  // Click handlers
  $$(".gs-item").forEach(item => {
    item.addEventListener("click", () => {
      const type = item.dataset.type;
      closeGlobalSearch();
      if (type === "customer") {
        const o = state.filtered.find(x => (x.customer_email||x.customer_name) === item.dataset.key);
        if (o) openCustomerModal(o.customer_email || o.customer_name, state.filtered);
        switchView("crm");
      } else if (type === "order") {
        switchView("sales");
        setTimeout(() => {
          const row = document.querySelector(`#ordersTable tr[data-id="${item.dataset.id}"]`);
          row?.scrollIntoView({ behavior:"smooth", block:"center" });
          row?.classList.add("highlight-row");
          setTimeout(() => row?.classList.remove("highlight-row"), 2000);
        }, 300);
      } else if (type === "course") {
        switchView("courses");
      }
    });
  });
}

// Helper switchView
let _paypalInited = false;
function switchView(id) {
  $$(".view").forEach(v => v.classList.remove("active"));
  $(`#view-${id}`)?.classList.add("active");
  $$(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.view === id));
  if (id === "paypal") {
    if (!_paypalInited) {
      _paypalInited = true;
      initPaypalView();
    } else {
      // Ya fue init: solo recargar datos si no hay datos cargados
      const gross = document.getElementById("ppGross");
      if (!gross || gross.textContent === "—") loadPaypalData();
    }
  }
}

// =============================================================
// PUSH NOTIFICATIONS (Notification API)
// =============================================================
async function requestPushNotifications() {
  if (!("Notification" in window)) {
    toast("Tu navegador no soporta notificaciones push", "error"); return;
  }
  if (Notification.permission === "denied") {
    toast("Las notificaciones están bloqueadas en este navegador", "error"); return;
  }
  const perm = await Notification.requestPermission();
  _pushEnabled = perm === "granted";
  updatePushBtn();
  if (_pushEnabled) {
    toast("✓ Alertas push activadas", "success");
    // Inicializar con pedidos actuales para no notificar todos al arranque
    _pushLastOrderIds = new Set(state.filtered.map(o => o.id));
  } else {
    toast("Permiso de notificaciones denegado", "error");
  }
}

function updatePushBtn() {
  const btn = $("#pushNotifBtn");
  if (!btn) return;
  if (Notification.permission === "granted") {
    btn.textContent = "🔔 Alertas ON";
    btn.className   = "chip enabled";
    _pushEnabled    = true;
  } else if (Notification.permission === "denied") {
    btn.textContent = "🔕 Alertas bloqueadas";
    btn.className   = "chip denied";
  } else {
    btn.textContent = "🔔 Alertas push";
    btn.className   = "chip";
  }
}

function checkPushNotifications(orders) {
  if (!_pushEnabled || Notification.permission !== "granted") return;
  const newOrders = orders.filter(o => !_pushLastOrderIds.has(o.id));
  newOrders.forEach(o => {
    const n = new Notification("🛒 Nuevo pedido — CRM Dashboard", {
      body: `#${o.id} · ${o.customer_name||"Cliente"} · ${fmtMoney(o.total)}`,
      icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><text y='26' font-size='28'>🛒</text></svg>",
      tag:  `order-${o.id}`
    });
    n.onclick = () => { window.focus(); switchView("sales"); n.close(); };
  });

  // Alertas de cancelaciones
  const cancelled = orders.filter(o =>
    !_pushLastOrderIds.has(o.id) && ["cancelled","refunded"].includes(statusNorm(o.status))
  );
  if (cancelled.length) {
    new Notification("⚠ Pedidos cancelados — CRM", {
      body: `${cancelled.length} pedido(s) cancelados o reembolsados`,
      tag:  "cancelled-alert"
    });
  }
  newOrders.forEach(o => _pushLastOrderIds.add(o.id));
}

// =============================================================
// TAREAS POR CLIENTE
// =============================================================
function getCustomerTasks(key) {
  try { return JSON.parse(localStorage.getItem(`crm_tasks_${key}`) || "[]"); } catch(e) { return []; }
}
function saveCustomerTasks(key, tasks) {
  try { localStorage.setItem(`crm_tasks_${key}`, JSON.stringify(tasks)); } catch(e) {}
}

function renderCustomerTasks(key) {
  const list = $("#modalTasksList");
  if (!list) return;
  const tasks = getCustomerTasks(key);
  if (!tasks.length) {
    list.innerHTML = `<div class="task-empty">Sin tareas asignadas.</div>`;
    return;
  }
  const today = new Date().toISOString().slice(0,10);
  list.innerHTML = tasks.map((t, i) => {
    const overdue = t.due && t.due < today && !t.done;
    return `<div class="task-item${t.done ? " done" : ""}">
      <input type="checkbox" class="task-check" ${t.done?"checked":""} onchange="toggleTask('${esc(key)}',${i})">
      <span class="task-text">${esc(t.text)}</span>
      ${t.due ? `<span class="task-due${overdue?" overdue":""}">${t.due}</span>` : ""}
      <button class="task-del" onclick="deleteTask('${esc(key)}',${i})" title="Eliminar">×</button>
    </div>`;
  }).join("");
}

function addCustomerTask(key, text, due) {
  if (!text.trim()) return;
  const tasks = getCustomerTasks(key);
  tasks.push({ text: text.trim(), due: due||"", done: false, created: new Date().toISOString() });
  saveCustomerTasks(key, tasks);
  renderCustomerTasks(key);
}

function toggleTask(key, idx) {
  const tasks = getCustomerTasks(key);
  if (tasks[idx]) tasks[idx].done = !tasks[idx].done;
  saveCustomerTasks(key, tasks);
  renderCustomerTasks(key);
}

function deleteTask(key, idx) {
  const tasks = getCustomerTasks(key);
  tasks.splice(idx, 1);
  saveCustomerTasks(key, tasks);
  renderCustomerTasks(key);
}

// =============================================================
// LTV — Lifetime Value proyectado a 12 meses
// =============================================================
function renderLTV() {
  const bars = $("#ltvBars");
  const badge = $("#ltvBadge");
  if (!bars) return;

  // Agrupar por cliente: total gastado y número de meses activo
  const map = {};
  state.filtered.forEach(o => {
    const k = o.customer_email || o.customer_name || "desconocido";
    if (!map[k]) map[k] = { name: o.customer_name || k, total: 0, months: new Set() };
    map[k].total += Number(o.total || 0);
    const m = (new Date(o.date)).toISOString().slice(0,7);
    map[k].months.add(m);
  });

  // LTV = avg monthly spend * 12
  const ltvList = Object.values(map).map(c => {
    const monthsActive = Math.max(c.months.size, 1);
    const avgMonthly   = c.total / monthsActive;
    const ltv12        = avgMonthly * 12;
    return { name: c.name, total: c.total, ltv12 };
  }).sort((a,b) => b.ltv12 - a.ltv12).slice(0, 15);

  if (!ltvList.length) { bars.innerHTML = empty("Sin datos"); return; }

  const maxLtv = ltvList[0].ltv12;
  const avgLtv = ltvList.reduce((s,c) => s + c.ltv12, 0) / ltvList.length;

  if (badge) badge.textContent = `Promedio LTV: ${fmtMoney(avgLtv)}`;

  bars.innerHTML = ltvList.map(c => {
    const pct = maxLtv ? (c.ltv12 / maxLtv * 100) : 0;
    return `<div class="ltv-bar-row">
      <span style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(c.name)}">${esc(c.name)}</span>
      <div class="ltv-bar-track"><div class="ltv-bar-fill" style="width:${pct.toFixed(1)}%"></div></div>
      <span class="ltv-bar-val">${fmtMoney(c.ltv12)}</span>
    </div>`;
  }).join("");
}

// =============================================================
// COMPARADOR DE PERIODOS
// =============================================================
function getPeriodOrders(key) {
  const now = new Date();
  const all = state.orders; // usamos todos los pedidos sin filtrar
  function filter(from, to) {
    return all.filter(o => {
      const d = new Date(o.date);
      return d >= from && d <= to;
    });
  }
  const ym = now.getFullYear(), mm = now.getMonth();
  switch(key) {
    case "current_month": {
      const f = new Date(ym, mm, 1);
      const t = new Date(ym, mm+1, 0, 23, 59, 59);
      return filter(f, t);
    }
    case "last_month": {
      const f = new Date(ym, mm-1, 1);
      const t = new Date(ym, mm, 0, 23, 59, 59);
      return filter(f, t);
    }
    case "last_30": {
      const f = new Date(now - 30*864e5);
      return filter(f, now);
    }
    case "last_90": {
      const f = new Date(now - 90*864e5);
      return filter(f, now);
    }
    case "last_year": {
      const f = new Date(ym-1, mm, 1);
      const t = new Date(ym, mm, 0, 23, 59, 59);
      return filter(f, t);
    }
    case "same_month_prev_year": {
      const f = new Date(ym-1, mm, 1);
      const t = new Date(ym-1, mm+1, 0, 23, 59, 59);
      return filter(f, t);
    }
    default: return all;
  }
}

function calcPeriodStats(orders) {
  const valid    = validRevenueOrders(orders);
  const revenue  = valid.reduce((s,o) => s + netRev(o), 0);
  const count    = orders.length;
  const complete = orders.filter(o => statusNorm(o.status)==="completed").length;
  const unique   = new Set(orders.map(o => o.customer_email||o.customer_name)).size;
  const aov      = count ? revenue/count : 0;
  return { revenue, count, complete, unique, aov };
}

function renderPeriodComparison() {
  const result = $("#periodCompareResult");
  if (!result) return;
  const keyA = $("#periodA")?.value || "current_month";
  const keyB = $("#periodB")?.value || "last_month";
  const a = calcPeriodStats(getPeriodOrders(keyA));
  const b = calcPeriodStats(getPeriodOrders(keyB));

  const metrics = [
    { label:"Ingresos",     va: fmtMoney(a.revenue), vb: fmtMoney(b.revenue), da: a.revenue, db: b.revenue, mono:false },
    { label:"Pedidos",      va: a.count,              vb: b.count,             da: a.count,   db: b.count,   mono:false },
    { label:"Completados",  va: a.complete,           vb: b.complete,          da: a.complete,db: b.complete,mono:false },
    { label:"Clientes únicos",va: a.unique,           vb: b.unique,            da: a.unique,  db: b.unique,  mono:false },
    { label:"Ticket medio", va: fmtMoney(a.aov),      vb: fmtMoney(b.aov),    da: a.aov,     db: b.aov,     mono:false },
  ];

  result.innerHTML = metrics.map(m => {
    const diff = m.db ? ((m.da - m.db) / m.db * 100) : 0;
    const cls  = diff >= 0 ? "up" : "down";
    const sign = diff >= 0 ? "▲" : "▼";
    return `<div class="pc-card">
      <div class="pc-card-label">${esc(m.label)}</div>
      <div class="pc-card-vals">
        <span class="pc-card-a">${m.va}</span>
        <span class="pc-card-b">vs ${m.vb}</span>
      </div>
      <div class="pc-card-delta ${cls}">${sign} ${Math.abs(diff).toFixed(1)}%</div>
    </div>`;
  }).join("");
}

// =============================================================
// HORA ÓPTIMA DE ENVÃ¯Â¿Â½Ã‚ÂO
// =============================================================
function renderOptimalSendTime() {
  const chart  = $("#optimalTimeChart");
  const badge  = $("#optimalTimeBadge");
  const recomm = $("#optimalTimeRecommend");
  if (!chart) return;

  // Contar ventas por hora del día
  const hourCounts = new Array(24).fill(0);
  state.filtered.forEach(o => {
    try {
      const h = new Date(o.date).getHours();
      hourCounts[h]++;
    } catch(e) {}
  });

  const maxH = Math.max(...hourCounts, 1);
  const bestHour = hourCounts.indexOf(Math.max(...hourCounts));
  const labels = ["12am","1am","2am","3am","4am","5am","6am","7am","8am","9am","10am","11am",
    "12pm","1pm","2pm","3pm","4pm","5pm","6pm","7pm","8pm","9pm","10pm","11pm"];

  // Mostrar solo horas con datos, o horas diurnas principales
  const shown = [8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,0,1,2];
  chart.innerHTML = shown.map(h => {
    const pct = (hourCounts[h] / maxH * 100).toFixed(1);
    return `<div class="ot-bar-row">
      <span class="ot-hour">${labels[h]}</span>
      <div class="ot-track"><div class="ot-fill" style="width:${pct}%"></div></div>
      <span class="ot-val">${hourCounts[h]}</span>
    </div>`;
  }).join("");

  // Bloque de 3 horas con más compras
  let best3 = [...hourCounts.entries()].sort((a,b) => b[1]-a[1]).slice(0,3).map(([h]) => labels[h]);
  if (badge)  badge.textContent  = `Mejor hora: ${labels[bestHour]}`;
  if (recomm) recomm.innerHTML = `<div class="ot-recommend">
    📊 <strong>Recomendación:</strong> tus clientes compran más a las <strong>${best3.join(", ")}</strong>.
    Envía campañas de email <strong>30–60 minutos antes</strong> de esos horarios para maximizar la apertura.
  </div>`;
}
function detectDuplicates() {
  const badge = $("#duplicatesBadge");
  const list  = $("#duplicatesList");
  if (!list) return;

  // Agrupar por email normalizado
  const byEmail = {};
  state.filtered.forEach(o => {
    const email = (o.customer_email||"").trim().toLowerCase();
    if (!email) return;
    if (!byEmail[email]) byEmail[email] = [];
    const name = o.customer_name || email;
    if (!byEmail[email].find(x => x.name === name)) {
      byEmail[email].push({ name, email, orders: 0, total: 0 });
    }
    byEmail[email][byEmail[email].length - 1].orders++;
    byEmail[email][byEmail[email].length - 1].total += Number(o.total||0);
  });

  // Buscar también por nombre similar (Levenshtein básico no es práctico en vanilla,
  // usamos coincidencia de prefijo del nombre)
  const byPrefix = {};
  state.filtered.forEach(o => {
    const name = (o.customer_name||"").trim().toLowerCase().split(" ").slice(0,2).join(" ");
    if (!name || name.length < 4) return;
    if (!byPrefix[name]) byPrefix[name] = new Set();
    byPrefix[name].add(o.customer_email || o.customer_name);
  });

  // Duplicados por email
  const groups = Object.entries(byEmail)
    .filter(([, items]) => items.length > 1)
    .map(([email, items]) => ({ type: "email", key: email, items }));

  // Duplicados por nombre (diferente email)
  Object.entries(byPrefix).forEach(([name, emails]) => {
    if (emails.size > 1) {
      const emailArr = [...emails];
      // Solo si no ya captado por email
      const items = emailArr.map(e => ({ name: e, email: e, orders: 0, total: 0 }));
      groups.push({ type: "nombre", key: name, items });
    }
  });

  if (badge) badge.textContent = `${groups.length} grupos`;
  if (!groups.length) {
    list.innerHTML = `<div class="dup-no">✅ No se detectaron clientes duplicados.</div>`;
    return;
  }

  list.innerHTML = groups.slice(0,20).map(g => {
    const typeLabel = g.type === "email" ? `📧 Mismo email: ${esc(g.key)}` : `👤 Mismo nombre: ${esc(g.key)}`;
    return `<div class="dup-group">
      <div class="dup-group-title">${typeLabel}</div>
      ${g.items.map(it => `<div class="dup-item">
        <span>${esc(it.name)}</span>
        <span class="dup-item-email">${esc(it.email)}</span>
      </div>`).join("")}
    </div>`;
  }).join("");
}

// =============================================================
// EXPORTAR PDF (html2canvas + jsPDF)
// =============================================================
async function exportPDF() {
  const btn = $("#pdfExportBtn");
  if (btn) { btn.textContent = "Ã¯Â¿Â½Ã‚Â� Generando PDF..."; btn.disabled = true; }

  try {
    // Capturar la sección activa
    const activeView = $(".view.active") || $(".main");
    const canvas = await html2canvas(activeView, {
      backgroundColor: getComputedStyle(document.body).backgroundColor || "#080a0f",
      scale: 1.5,
      useCORS: true,
      allowTaint: true,
      logging: false
    });

    const imgData = canvas.toDataURL("image/png");
    const { jsPDF } = window.jspdf;
    const pdf   = new jsPDF({ orientation: "landscape", unit: "px", format: [canvas.width / 1.5, canvas.height / 1.5] });
    const pw    = pdf.internal.pageSize.getWidth();
    const ph    = pdf.internal.pageSize.getHeight();
    pdf.addImage(imgData, "PNG", 0, 0, pw, ph);
    pdf.save(`crm-dashboard-${new Date().toISOString().slice(0,10)}.pdf`);
    toast("PDF exportado correctamente", "success");
  } catch(err) {
    toast("Error al generar PDF. Asegúrate de que html2canvas cargó.", "error");
    console.error(err);
  } finally {
    if (btn) { btn.textContent = "📄 PDF"; btn.disabled = false; }
  }
}

// =============================================================
// MODO PRESENTACIÓN
// =============================================================
const PRES_VIEWS = [
  { id: "command",      label: "Ã¯Â¿Â½Ã‚Â Centro de mando" },
  { id: "crm",          label: "👥 CRM clientes" },
  { id: "oportunidades",label: "🎯 Oportunidades" },
  { id: "kanban",       label: "📌 Kanban leads" },
  { id: "analytics",    label: "📈 Análisis avanzado" },
  { id: "sales",        label: "💳 Ventas" },
  { id: "courses",      label: "🎓 Cursos" },
  { id: "geo",          label: "Ã¯Â¿Â½Ã‚Â Geografía" },
];
let _presIdx     = 0;
let _presTimer   = null;
let _presSeconds = 10;

function initPresentationMode() {
  $("#presentationBtn")?.addEventListener("click", startPresentation);
  $("#presExit")?.addEventListener("click", stopPresentation);
  $("#presNext")?.addEventListener("click", () => presGoTo(_presIdx + 1));
  $("#presPrev")?.addEventListener("click", () => presGoTo(_presIdx - 1));
  document.addEventListener("keydown", e => {
    const pm = $("#presentationMode");
    if (!pm || pm.classList.contains("hidden")) return;
    if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); presGoTo(_presIdx + 1); }
    if (e.key === "ArrowLeft")  { e.preventDefault(); presGoTo(_presIdx - 1); }
    if (e.key === "Escape")     stopPresentation();
  });
}

function startPresentation() {
  const pm = $("#presentationMode");
  if (!pm) return;
  pm.classList.remove("hidden");
  _presIdx = 0;
  presShowSlide(0);
  presStartTimer();
  document.documentElement.requestFullscreen?.().catch(() => {});
}

function stopPresentation() {
  const pm = $("#presentationMode");
  if (!pm) return;
  pm.classList.add("hidden");
  clearInterval(_presTimer);
  document.exitFullscreen?.().catch(() => {});
}

function presGoTo(idx) {
  _presIdx = Math.max(0, Math.min(idx, PRES_VIEWS.length - 1));
  presShowSlide(_presIdx);
  if ($("#presAutoPlay")?.checked) presStartTimer();
}

function presShowSlide(idx) {
  const v = PRES_VIEWS[idx];
  if (!v) return;
  $("#presTitle").textContent   = v.label;
  $("#presProgress").textContent = `${idx+1} / ${PRES_VIEWS.length}`;

  // Clonar la vista activa y mostrarla en el panel
  const content = $("#presContent");
  const srcView = $(`#view-${v.id}`);
  if (content && srcView) {
    const clone = srcView.cloneNode(true);
    clone.classList.add("active");
    content.innerHTML = "";
    content.appendChild(clone);
  }
  _presSeconds = 10;
  updatePresTimer();
}

function presStartTimer() {
  clearInterval(_presTimer);
  _presSeconds = 10;
  _presTimer = setInterval(() => {
    _presSeconds--;
    updatePresTimer();
    if (_presSeconds <= 0 && $("#presAutoPlay")?.checked) {
      const next = (_presIdx + 1) % PRES_VIEWS.length;
      presGoTo(next);
    }
  }, 1000);
}

function updatePresTimer() {
  const el = $("#presTimer");
  if (el) el.textContent = `🔄 Siguiente en ${_presSeconds}s`;
}

// =============================================================
// WIDGETS FAVORITOS
// =============================================================
const WIDGET_DEFS = [
  { id: "kpiGrid",       label: "📊 KPIs principales",     sub: "Ingresos, pedidos, clientes" },
  { id: "view-command",  label: "Ã¯Â¿Â½Ã‚Â Centro de mando",      sub: "Globo + ventas + feed" },
  { id: "view-crm",      label: "👥 CRM clientes",         sub: "Segmentos, tabla, heatmap" },
  { id: "view-analytics",label: "📈 Análisis avanzado",    sub: "Forecast, RFM, abandono" },
  { id: "view-kanban",   label: "📌 Kanban de leads",      sub: "Pipeline drag & drop" },
  { id: "view-oportunidades",label: "🎯 Oportunidades",    sub: "Leads, upsell, email" },
  { id: "view-courses",  label: "🎓 Cursos",               sub: "Rendimiento y comparativa" },
  { id: "view-geo",      label: "Ã¯Â¿Â½Ã‚Â Geografía",            sub: "Rankings de países y ciudades" },
];

function loadWidgetConfig() {
  try { return JSON.parse(localStorage.getItem("crm_widgets") || "null"); } catch(e) { return null; }
}

function applyWidgetConfig(cfg) {
  if (!cfg) return;
  WIDGET_DEFS.forEach(w => {
    const el = $(`#${w.id}`);
    if (!el) return;
    if (cfg[w.id] === false) {
      el.style.display = "none";
    } else {
      el.style.display = "";
    }
  });
}

function renderWidgetCustomizer() {
  const box = $("#widgetCustomizer");
  if (!box) return;
  const cfg = loadWidgetConfig() || {};
  box.innerHTML = WIDGET_DEFS.map(w => {
    const checked = cfg[w.id] !== false;
    return `<label class="widget-toggle-item">
      <input type="checkbox" data-widget="${esc(w.id)}" ${checked?"checked":""}>
      <div>
        <div class="widget-toggle-label">${w.label}</div>
        <div class="widget-toggle-sub">${w.sub}</div>
      </div>
    </label>`;
  }).join("");
}

function saveWidgetConfig() {
  const cfg = {};
  $$(".widget-toggle-item input[data-widget]").forEach(inp => {
    cfg[inp.dataset.widget] = inp.checked;
  });
  try { localStorage.setItem("crm_widgets", JSON.stringify(cfg)); } catch(e) {}
  applyWidgetConfig(cfg);
  const msg = $("#widgetSavedMsg");
  if (msg) { msg.style.display="inline"; setTimeout(()=>msg.style.display="none",2000); }
  toast("Preferencias de widgets guardadas", "success");
}

// =============================================================
// EMAIL MARKETING
// =============================================================
function getEmailSegment(key) {
  const now = new Date();
  const cutoff90 = new Date(now - 90*864e5);
  const customers = {};
  state.orders.forEach(o => {
    const k = o.customer_email || o.customer_name;
    if (!k) return;
    if (!customers[k]) customers[k] = { name: o.customer_name||k, email: o.customer_email||"", total: 0, orders: 0, lastDate: o.date, courses: new Set() };
    customers[k].total += Number(o.total||0);
    customers[k].orders++;
    if (o.course_name) customers[k].courses.add(o.course_name);
    if (new Date(o.date) > new Date(customers[k].lastDate)) customers[k].lastDate = o.date;
  });
  const all = Object.values(customers);
  const maxTotal = Math.max(...all.map(c => c.total), 1);
  const vipThresh = maxTotal * 0.9;

  switch(key) {
    case "inactive": return all.filter(c => new Date(c.lastDate) < cutoff90);
    case "vip":      return all.filter(c => c.total >= vipThresh);
    case "risk":     return all.filter(c => c.orders === 1);
    case "upsell":   return all.filter(c => c.courses.size === 1);
    default:         return all;
  }
}

function renderEmailMarketing() {
  const seg     = $("#emailSegment")?.value || "all";
  const list    = getEmailSegment(seg);
  const badge   = $("#emailCountBadge");
  if (badge) badge.textContent = `${list.length} destinatarios`;
}

function previewEmail() {
  const box     = $("#emailPreviewBox");
  const subject = $("#emailSubject")?.value || "(sin asunto)";
  const body    = $("#emailBody")?.value    || "(sin cuerpo)";
  const seg     = $("#emailSegment")?.value || "all";
  const list    = getEmailSegment(seg);
  const sample  = list[0];
  if (!box) return;
  const resolved = body.replace(/{nombre}/g, sample?.name || "Cliente");
  box.innerHTML = `<strong>Para:</strong> ${list.length} destinatarios<br>
<strong>Asunto:</strong> ${esc(subject)}<hr style="border-color:var(--line);margin:8px 0">
${esc(resolved)}`;
  box.classList.remove("hidden");
}

function exportEmailList() {
  const seg  = $("#emailSegment")?.value || "all";
  const list = getEmailSegment(seg);
  if (!list.length) { toast("Sin destinatarios en este segmento","error"); return; }
  const rows = [["Nombre","Email","Total","Pedidos"]];
  list.forEach(c => rows.push([c.name, c.email, c.total.toFixed(2), c.orders]));
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type:"text/csv;charset=utf-8;" });
  const a    = document.createElement("a");
  a.href     = URL.createObjectURL(blob);
  a.download = `email-lista-${seg}-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  toast(`Lista de ${list.length} emails exportada`, "success");
}

function sendEmailMailto() {
  const subject = encodeURIComponent($("#emailSubject")?.value || "");
  const body_t  = encodeURIComponent($("#emailBody")?.value || "");
  const seg     = $("#emailSegment")?.value || "all";
  const list    = getEmailSegment(seg);
  if (!list.length) { toast("Sin destinatarios","error"); return; }
  // Abrir mailto con primer destinatario como ejemplo
  const email = list[0]?.email || "";
  if (!email) { toast("Los clientes de este segmento no tienen email registrado","error"); return; }
  window.open(`mailto:${encodeURIComponent(email)}?subject=${subject}&body=${body_t}`, "_blank");
  toast(`Abriendo cliente de correo con plantilla para ${list.length} destinatarios`, "success");
}

// =============================================================
// GA4 — Guardar configuración
// =============================================================
function saveGA4Config() {
  const mid = $("#ga4MeasurementId")?.value.trim();
  const sec = $("#ga4ApiSecret")?.value.trim();
  if (!mid) { toast("Ingresa el Measurement ID (G-XXXXXX)", "error"); return; }
  try { localStorage.setItem("crm_ga4", JSON.stringify({ measurementId: mid, apiSecret: sec })); } catch(e) {}
  const msg = $("#ga4SavedMsg");
  if (msg) { msg.style.display="inline"; setTimeout(()=>msg.style.display="none",2000); }
  toast("Configuración GA4 guardada", "success");
}

function loadGA4Config() {
  const DEFAULT_GA4 = { measurementId: "G-P2915DSRR4", apiSecret: "RzwhQIaYTN27W6Du1p0ttg" };
  try {
    const stored = JSON.parse(localStorage.getItem("crm_ga4") || "null");
    const cfg = stored?.measurementId ? stored : DEFAULT_GA4;
    if ($("#ga4MeasurementId")) {
      $("#ga4MeasurementId").value = cfg.measurementId;
      $("#ga4ApiSecret").value     = cfg.apiSecret || "";
    }
    if (!stored?.measurementId) localStorage.setItem("crm_ga4", JSON.stringify(DEFAULT_GA4));
  } catch(e) {}
}

// =============================================================
// GA4 — Sincronización de pedidos WooCommerce → GA4 Measurement Protocol
// Evita duplicados guardando IDs ya enviados en localStorage
// =============================================================
function getGA4Cfg() {
  try {
    const stored = JSON.parse(localStorage.getItem("crm_ga4") || "null");
    if (stored?.measurementId && stored?.apiSecret) return stored;
  } catch(e) {}
  return { measurementId: "G-P2915DSRR4", apiSecret: "RzwhQIaYTN27W6Du1p0ttg" };
}

function getGA4SentIds() {
  try { return new Set(JSON.parse(localStorage.getItem("crm_ga4_sent") || "[]")); }
  catch(e) { return new Set(); }
}

function markGA4Sent(ids) {
  try {
    const existing = getGA4SentIds();
    ids.forEach(id => existing.add(String(id)));
    // Limitar a los últimos 2000 IDs para no saturar localStorage
    const arr = [...existing].slice(-2000);
    localStorage.setItem("crm_ga4_sent", JSON.stringify(arr));
  } catch(e) {}
}

async function syncOrdersToGA4(orders) {
  const cfg = getGA4Cfg();
  if (!cfg.measurementId || !cfg.apiSecret) return;

  const sentIds = getGA4SentIds();
  // Solo pedidos completados no enviados aún
  const pending = (orders || state.orders || []).filter(o =>
    statusNorm(o.status) === "completed" && !sentIds.has(String(o.id))
  );
  if (!pending.length) return;

  const endpoint = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(cfg.measurementId)}&api_secret=${encodeURIComponent(cfg.apiSecret)}`;
  const newSent = [];

  for (const order of pending) {
    const items = (order.items || []).map((it, i) => ({
      item_id:   String(it.product_id || `item_${i}`),
      item_name: it.name || "Curso",
      quantity:  Number(it.quantity || 1),
      price:     Number(it.price || 0)
    }));

    const body = {
      client_id: `crm_dashboard_${order.id}`,
      timestamp_micros: String(new Date(order.date).getTime() * 1000),
      non_personalized_ads: false,
      events: [{
        name: "purchase",
        params: {
          transaction_id: String(order.id),
          value:          Number(order.total || 0),
          currency:       CONFIG.currency || "USD",
          items:          items.length ? items : [{ item_id: "sin_detalle", item_name: "Pedido WooCommerce", quantity: 1, price: Number(order.total || 0) }]
        }
      }]
    };

    try {
      await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      newSent.push(order.id);
    } catch(e) { /* red no disponible, se reintentará en la próxima carga */ }
  }

  if (newSent.length) {
    markGA4Sent(newSent);
    console.log(`[GA4] ${newSent.length} pedido(s) sincronizados. Total enviados: ${getGA4SentIds().size}`);
  }
}

// =============================================================
// PAYPAL — API directa desde el browser (sin proxy WordPress)
// PP_LIVE = credenciales producción | PP_SANDBOX = entorno de prueba
// El usuario puede cambiar entre ambas con los botones rápidos.
// =============================================================

const PP_LIVE = {
  clientId: "Af20TMRhzlS8DAeDvGzdDzlE4MLKsD4Zx-OYUZi2n3P6-AL6DnHby510QXnytAYQW4bBU8q2GEFdiDTp",
  secret:   "EPUVbHFgcn3zrHpJtH5HLON7ddBTUpnU1NhA6hpo8rrp4Bt68b0Mz4akSr2D73GS7xocIQUXGHtDLWfT",
  mode:     "live"
};

const PP_SANDBOX = {
  clientId: "AZ5wBHR9FYjombGnYkaPLLZLodDCxVFLS8nyFON4S8r-yiUUjZ8CVBU9G4uJPB1IcO8Dh3gHB9fvMaeg",
  secret:   "EDOqqAcDB6bI9HHsG-GwnJXWhiq5alK8HPf_QKqLuChD5M1bPxiOynaM2_L6aGP85c-AhUPtb6BdYeoV",
  mode:     "sandbox"
};

// Por defecto usa Live (tiene permisos de Reporting habilitados)
const PP_DEFAULT = PP_LIVE;

function loadPaypalConfig() {
  try {
    const s = JSON.parse(localStorage.getItem("crm_paypal") || "null");
    if (s && s.clientId) return s;
    // Si no hay nada, guardar Live por defecto
    try { localStorage.setItem("crm_paypal", JSON.stringify(PP_LIVE)); } catch(e) {}
    return PP_LIVE;
  } catch(e) { return PP_LIVE; }
}

function savePaypalConfig() {
  const cid = (document.getElementById("ppClientId")?.value || "").trim();
  const sec = (document.getElementById("ppSecret")?.value   || "").trim();
  const mode = document.getElementById("ppMode")?.value || "sandbox";
  if (!cid || !sec) { toast("Ingresa Client ID y Secret de PayPal", "error"); return; }
  try { localStorage.setItem("crm_paypal", JSON.stringify({ clientId: cid, secret: sec, mode })); } catch(e) {}
  _ppToken = null;
  _ppTokenExpiry = 0;
  const msg = document.getElementById("ppSavedMsg");
  if (msg) { msg.style.display = "inline"; setTimeout(() => msg.style.display = "none", 2000); }
  toast("Credenciales PayPal guardadas", "success");
}

// Cache del access token en memoria (se pierde al recargar la p�gina, no en disco)
let _ppToken = null;
let _ppTokenExpiry = 0;

async function ppGetToken() {
  const now = Date.now();
  if (_ppToken && now < _ppTokenExpiry) return _ppToken;

  const cfg  = loadPaypalConfig();
  const base = cfg.mode === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
  const creds = btoa(cfg.clientId + ":" + cfg.secret);

  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${creds}`,
      "Content-Type":  "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const e = await res.json(); msg = e.error_description || e.message || msg; } catch(_) {}
    throw new Error(msg + " � verifica tu Client ID y Secret de PayPal");
  }

  const data     = await res.json();
  _ppToken       = data.access_token;
  _ppTokenExpiry = now + Math.max(60, (data.expires_in || 3600) - 60) * 1000;
  return _ppToken;
}

async function ppFetchTransactions(from, to, page) {
  const token = await ppGetToken();
  const cfg   = loadPaypalConfig();
  const base  = cfg.mode === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

  const params = new URLSearchParams({
    start_date:         from + "T00:00:00+0000",
    end_date:           to   + "T23:59:59+0000",
    transaction_status: "S",
    page_size:          "500",
    page:               String(page || 1),
    fields:             "all"
  });

  const res = await fetch(`${base}/v1/reporting/transactions?${params}`, {
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }
  });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    let errJson = null;
    try { errJson = await res.json(); msg = errJson.message || errJson.error_description || msg; } catch(_) {}
    if (res.status === 403) {
      throw new Error(
        "Permiso insuficiente (403). " +
        "Ve a developer.paypal.com → My Apps → tu App → Editar → activa 'Transaction Search' en los permisos. " +
        "Si ves esto en Sandbox, crea una app con ese permiso o usa credenciales Live."
      );
    }
    throw new Error(msg);
  }

  return res.json();
}

const PP_COUNTRIES = {
  ES:"España", MX:"México", CL:"Chile", CO:"Colombia", US:"EEUU", PE:"Perú",
  AR:"Argentina", EC:"Ecuador", BO:"Bolivia", PY:"Paraguay", UY:"Uruguay",
  VE:"Venezuela", CR:"Costa Rica", GT:"Guatemala", PA:"Panamá", DO:"Rep. Dom.",
  GB:"Reino Unido", FR:"Francia", DE:"Alemania", BR:"Brasil", IT:"Italia",
  NL:"Países Bajos", PT:"Portugal", BE:"Bélgica", CH:"Suiza", SE:"Suecia",
  IN:"India", CN:"China", JP:"Japón", AU:"Australia", CA:"Canadá",
  ZA:"Sudfrica", NG:"Nigeria", EG:"Egipto", MA:"Marruecos",
  SG:"Singapur", PH:"Filipinas", ID:"Indonesia", TH:"Tailandia", VN:"Vietnam"
};

// Retorna badge HTML con el codigo ISO (sin emojis)
function ppCountryFlag(code) {
  if (!code || code.length < 1) return "";
  return `<span class="pp-cc">${esc(code.toUpperCase())}</span>`;
}

// Mapa: codigo ISO numerico → alpha-2
const PP_ISO_NUMERIC = {
  4:"AF",8:"AL",12:"DZ",24:"AO",32:"AR",36:"AU",40:"AT",50:"BD",56:"BE",
  68:"BO",76:"BR",100:"BG",104:"MM",116:"KH",120:"CM",124:"CA",144:"LK",
  152:"CL",156:"CN",170:"CO",188:"CR",191:"HR",192:"CU",196:"CY",203:"CZ",
  208:"DK",214:"DO",218:"EC",818:"EG",222:"SV",231:"ET",246:"FI",250:"FR",
  276:"DE",288:"GH",300:"GR",320:"GT",332:"HT",340:"HN",356:"IN",360:"ID",
  364:"IR",368:"IQ",372:"IE",376:"IL",380:"IT",388:"JM",392:"JP",400:"JO",
  404:"KE",410:"KR",422:"LB",484:"MX",504:"MA",508:"MZ",524:"NP",528:"NL",
  566:"NG",578:"NO",586:"PK",591:"PA",600:"PY",604:"PE",608:"PH",616:"PL",
  620:"PT",630:"PR",634:"QA",642:"RO",643:"RU",682:"SA",710:"ZA",724:"ES",
  752:"SE",756:"CH",764:"TH",780:"TT",788:"TN",792:"TR",800:"UG",804:"UA",
  784:"AE",826:"GB",840:"US",858:"UY",862:"VE",704:"VN",716:"ZW",702:"SG",
  458:"MY",466:"ML",288:"GH",266:"GA",430:"LR",434:"LY",516:"NA",706:"SO"
};

async function ppRenderWorldMap(ctEl, byCountry, fmtUSD) {
  ctEl.innerHTML = `<div style="padding:20px;text-align:center;color:var(--muted)">Cargando mapa mundial...</div>`;
  try {
    const resp = await fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json");
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const world = await resp.json();

    const W = 960, H = 490;
    // Natural Earth projection (oval, como PayPal)
    const projection = d3.geoNaturalEarth1()
      .scale(W / 6.28)
      .translate([W / 2, H / 2]);
    const pathGen = d3.geoPath().projection(projection);

    const countries = topojson.feature(world, world.objects.countries);
    const maxV = Math.max(...Object.values(byCountry).filter(v => v > 0), 1);

    const colorFor = (v) => {
      if (!v || v <= 0) return "#1e293b";
      const t = Math.sqrt(v / maxV);
      const r = Math.round(30  + t * (209));
      const g = Math.round(10  + t * 25);
      const b = Math.round(60  - t * 16);
      return `rgb(${r},${g},${b})`;
    };

    const pathsHtml = countries.features.map(feat => {
      const alpha2 = PP_ISO_NUMERIC[+feat.id] || "";
      const sales  = (alpha2 && byCountry[alpha2]) || 0;
      const fill   = colorFor(sales);
      const d      = pathGen(feat);
      if (!d) return "";
      const tipTxt = alpha2
        ? `${PP_COUNTRIES[alpha2] || alpha2}: ${sales > 0 ? fmtUSD(sales) : "Sin datos"}`
        : "";
      return `<path d="${d}" fill="${fill}" stroke="#0f172a" stroke-width="0.4">${tipTxt ? `<title>${esc(tipTxt)}</title>` : ""}</path>`;
    }).join("");

    const entries = Object.entries(byCountry).filter(([,v]) => v > 0).sort(([,a],[,b]) => b - a);
    const legend  = entries.slice(0, 10).map(([code, v]) =>
      `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <div style="width:12px;height:12px;border-radius:3px;background:${colorFor(v)};flex-shrink:0"></div>
        <span style="font-size:13px;flex:1"><span class="pp-cc">${esc(code)}</span> ${esc(PP_COUNTRIES[code] || code)}</span>
        <strong style="font-size:13px;white-space:nowrap">${fmtUSD(v)}</strong>
      </div>`
    ).join("");

    ctEl.innerHTML = `
      <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start">
        <div style="flex:1;min-width:300px;overflow:hidden;border-radius:10px;background:#0f172a">
          <svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block">
            <rect width="${W}" height="${H}" fill="#0f172a"/>
            ${pathsHtml}
          </svg>
        </div>
        <div style="min-width:210px;padding:4px 0">
          <p style="font-size:11px;color:var(--muted);margin:0 0 10px 0;font-weight:700;text-transform:uppercase;letter-spacing:.5px">Top países</p>
          ${legend || '<p style="color:var(--muted);font-size:13px">Sin datos de país aún.</p>'}
        </div>
      </div>`;
  } catch (err) {
    ctEl.innerHTML = `<p style="color:var(--bad);padding:12px">Error cargando mapa: ${esc(String(err.message || err))}</p>`;
    console.warn("[WorldMap]", err);
  }
}

function ppRenderAll(txnDetails) {
  const fmtUSD = n => new Intl.NumberFormat("es-PE", { style:"currency", currency:"USD", maximumFractionDigits:2 }).format(n);
  const setEl  = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

  let gross = 0, fees = 0, count = 0;
  const byCountry  = {};
  const byCustomer = {};
  const byDay      = {};

  txnDetails.forEach(t => {
    const info  = t.transaction_info || {};
    const payer = t.payer_info       || {};
    const amt   = parseFloat(info.transaction_amount?.value  || 0);
    const fee   = Math.abs(parseFloat(info.fee_amount?.value || 0));
    const date  = (info.transaction_initiation_date || "").slice(0, 10);
    const code  = payer.address?.country_code || "XX";
    const email = payer.email_address || "desconocido";
    const name  = payer.payer_name?.alternate_full_name || email;

    gross += amt;
    fees  += fee;
    count++;
    byCountry[code]  = +((byCountry[code]  || 0) + amt).toFixed(2);
    byDay[date]      = +((byDay[date]       || 0) + amt).toFixed(2);
    if (!byCustomer[email]) byCustomer[email] = { name, email, total: 0, orders: 0 };
    byCustomer[email].total  = +(byCustomer[email].total  + amt).toFixed(2);
    byCustomer[email].orders += 1;
  });

  // KPIs
  setEl("ppGross", fmtUSD(gross));
  setEl("ppFees",  "-" + fmtUSD(fees));
  setEl("ppNet",   fmtUSD(gross - fees));
  setEl("ppCount", count.toLocaleString("es-PE"));
  setEl("ppAvg",   fmtUSD(count ? gross / count : 0));

  // ── Gráfico de barras diarias (SVG) ──────────────────────────
  const dayEl = document.getElementById("paypalDayBars");
  if (dayEl) {
    const entries = Object.entries(byDay).sort(([a],[b]) => a.localeCompare(b));
    if (!entries.length) {
      dayEl.innerHTML = `<p style="color:var(--muted);padding:16px">Sin transacciones en el periodo.</p>`;
    } else {
      const maxV = Math.max(...entries.map(([,v]) => v), 1);
      const W = 800, H = 180, pad = 40, barW = Math.max(4, Math.floor((W - pad*2) / entries.length) - 2);
      const bars = entries.map(([d, v], i) => {
        const bh = Math.max(2, Math.round((v / maxV) * (H - pad)));
        const x  = pad + i * ((W - pad*2) / entries.length);
        const y  = H - pad - bh;
        const label = i % Math.ceil(entries.length / 12) === 0 ? `<text x="${x + barW/2}" y="${H - 4}" fill="var(--muted)" font-size="9" text-anchor="middle">${d.slice(5)}</text>` : "";
        return `<rect x="${x}" y="${y}" width="${barW}" height="${bh}" fill="url(#ppGrad)" rx="2"><title>${d}: ${fmtUSD(v)}</title></rect>${label}`;
      }).join("");
      const topLabel = `<text x="${pad}" y="14" fill="var(--muted)" font-size="10">${fmtUSD(maxV)}</text>`;
      dayEl.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:180px">
        <defs><linearGradient id="ppGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ef233c"/><stop offset="100%" stop-color="#8b0000"/></linearGradient></defs>
        <line x1="${pad}" y1="${H-pad}" x2="${W-8}" y2="${H-pad}" stroke="var(--border)" stroke-width="1"/>
        ${topLabel}${bars}
      </svg>`;
    }
  }

  // ── Mapa mundial de ventas por país (SVG choropleth) ─────────
  const ctEl = document.getElementById("paypalCountryBars");
  if (ctEl) {
    // Mapa real con TopoJSON (async)
    ppRenderWorldMap(ctEl, byCountry, fmtUSD);
  }
  // ── Top clientes (barras horizontales + dona) ────────────────
  const custEl = document.getElementById("paypalTopCustomers");
  if (custEl) {
    const sorted = Object.values(byCustomer).sort((a,b) => b.total - a.total).slice(0, 10);
    const maxV   = Math.max(...sorted.map(c => c.total), 1);
    const totalRev = sorted.reduce((s,c) => s+c.total, 0);

    // Dona SVG
    const colors = ["#ef233c","#f97316","#eab308","#22c55e","#3b82f6","#a855f7","#ec4899","#14b8a6","#f43f5e","#84cc16"];
    let donaPath = "", startAngle = -90;
    const R = 70, cx = 90, cy = 90;
    sorted.forEach((c, i) => {
      const angle = (c.total / totalRev) * 360;
      const start = (startAngle * Math.PI) / 180;
      const end   = ((startAngle + angle) * Math.PI) / 180;
      const x1 = cx + R * Math.cos(start), y1 = cy + R * Math.sin(start);
      const x2 = cx + R * Math.cos(end),   y2 = cy + R * Math.sin(end);
      const large = angle > 180 ? 1 : 0;
      donaPath += `<path d="M${cx},${cy} L${x1},${y1} A${R},${R} 0 ${large},1 ${x2},${y2} Z" fill="${colors[i]}" opacity="0.85"><title>${esc(c.name)}: ${fmtUSD(c.total)}</title></path>`;
      startAngle += angle;
    });

    const bars = sorted.map((c, i) => {
      const pct = Math.round(c.total / maxV * 100);
      return `<div style="margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:2px">
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px" title="${esc(c.email)}">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${colors[i]};margin-right:5px"></span>
            ${esc(c.name)}
          </span>
          <span style="white-space:nowrap;margin-left:8px;color:var(--good)">${fmtUSD(c.total)} <span style="color:var(--muted)">(${c.orders})</span></span>
        </div>
        <div style="height:5px;background:var(--border);border-radius:3px;overflow:hidden">
          <div style="width:${pct}%;height:100%;background:${colors[i]};border-radius:3px"></div>
        </div>
      </div>`;
    }).join("");

    custEl.innerHTML = `<div style="display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start">
      <svg viewBox="0 0 180 180" style="width:140px;height:140px;flex-shrink:0">
        ${donaPath}
        <circle cx="${cx}" cy="${cy}" r="42" fill="var(--bg-card,#111827)"/>
        <text x="${cx}" y="${cy-6}" text-anchor="middle" font-size="11" fill="var(--muted)">Total</text>
        <text x="${cx}" y="${cy+10}" text-anchor="middle" font-size="12" fill="#fff" font-weight="bold">${sorted.length} clientes</text>
      </svg>
      <div style="flex:1;min-width:200px">${bars}</div>
    </div>`;
  }

  // ── Tabla de transacciones ────────────────────────────────────
  const tbody = document.getElementById("paypalTxnBody");
  const badge = document.getElementById("paypalTxnCount");
  if (badge) badge.textContent = `${txnDetails.length} transacciones`;
  if (tbody) {
    if (!txnDetails.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:24px">Sin transacciones en el periodo.</td></tr>`;
      return;
    }
    tbody.innerHTML = txnDetails.map(t => {
      const info  = t.transaction_info || {};
      const payer = t.payer_info       || {};
      const amt   = parseFloat(info.transaction_amount?.value || 0);
      const fee   = Math.abs(parseFloat(info.fee_amount?.value || 0));
      const code  = payer.address?.country_code || "";
      const name  = payer.payer_name?.alternate_full_name || payer.email_address || "—";
      const email = payer.email_address || "";
      const txid  = info.transaction_id || "";
      const date  = (info.transaction_initiation_date || "").slice(0, 10);
      const subj  = info.transaction_subject || info.transaction_note || "—";
      return `<tr>
        <td>${date}</td>
        <td style="font-size:11px;color:var(--muted)" title="${esc(txid)}">${esc(txid.slice(-8))}</td>
        <td>${esc(name)}<br><span style="font-size:11px;color:var(--muted)">${esc(email)}</span></td>
        <td>${ppCountryFlag(code)} ${PP_COUNTRIES[code] || code || "—"}</td>
        <td style="font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(subj)}">${esc(subj.substring(0, 60))}</td>
        <td class="text-right">${fmtUSD(amt)}</td>
        <td class="text-right" style="color:var(--bad)">-${fmtUSD(fee)}</td>
        <td class="text-right" style="color:var(--good)">${fmtUSD(amt - fee)}</td>
      </tr>`;
    }).join("");
  }
}
// Divide un rango de fechas en ventanas de maxDays días
function ppSplitDateRange(from, to, maxDays = 31) {
  const chunks = [];
  let cur = new Date(from + "T00:00:00Z");
  const end = new Date(to + "T00:00:00Z");
  while (cur <= end) {
    const chunkEnd = new Date(Math.min(cur.getTime() + (maxDays - 1) * 86400000, end.getTime()));
    chunks.push([
      cur.toISOString().slice(0, 10),
      chunkEnd.toISOString().slice(0, 10)
    ]);
    cur = new Date(chunkEnd.getTime() + 86400000);
  }
  return chunks;
}

async function loadPaypalData() {
  const statusEl = document.getElementById("paypalStatus");
  const btn      = document.getElementById("paypalLoadBtn");
  const fromEl   = document.getElementById("paypalFrom");
  const toEl     = document.getElementById("paypalTo");
  if (!fromEl || !toEl) return;

  const from = fromEl.value || new Date(Date.now() - 30*86400000).toISOString().slice(0, 10);
  const to   = toEl.value   || new Date().toISOString().slice(0, 10);

  if (statusEl) statusEl.textContent = "Conectando con PayPal...";
  if (btn) btn.disabled = true;

  try {
    const chunks = ppSplitDateRange(from, to, 31);
    const allTxns = [];

    for (let i = 0; i < chunks.length; i++) {
      const [cFrom, cTo] = chunks[i];
      if (statusEl) statusEl.textContent = `Cargando... bloque ${i + 1}/${chunks.length} (${cFrom} → ${cTo})`;
      const data = await ppFetchTransactions(cFrom, cTo, 1);
      const txns = data.transaction_details || [];
      allTxns.push(...txns);
      // Si hay más páginas en este bloque
      const totalPages = data.total_pages || 1;
      for (let p = 2; p <= totalPages; p++) {
        const pageData = await ppFetchTransactions(cFrom, cTo, p);
        allTxns.push(...(pageData.transaction_details || []));
      }
    }

    ppRenderAll(allTxns);
    if (statusEl) statusEl.textContent = `${allTxns.length} transacciones · ${new Date().toLocaleTimeString("es-PE")}`;
  } catch(err) {
    const msg = String(err.message || err);
    if (statusEl) { statusEl.innerHTML = "<span style='color:var(--bad)'>" + msg + "</span>"; }
    toast("PayPal: " + msg.substring(0, 80), "error");
    console.warn("[PayPal]", err);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function ppSetMode(mode) {
  const preset = mode === "live" ? PP_LIVE : PP_SANDBOX;
  _ppToken = null;
  _ppTokenExpiry = 0;
  try { localStorage.setItem("crm_paypal", JSON.stringify(preset)); } catch(e) {}
  const el = id => document.getElementById(id);
  if (el("ppClientId")) el("ppClientId").value = preset.clientId;
  if (el("ppSecret"))   el("ppSecret").value   = preset.secret;
  if (el("ppMode"))     el("ppMode").value      = preset.mode;
  const liveBtn = el("ppModeLive");
  const sandBtn = el("ppModeSandbox");
  const label   = el("ppModeLabel");
  if (liveBtn) { liveBtn.style.opacity = mode === "live" ? "1" : "0.4"; liveBtn.style.background = mode === "live" ? "var(--good)" : ""; liveBtn.style.color = mode === "live" ? "#fff" : ""; }
  if (sandBtn) { sandBtn.style.opacity = mode !== "live" ? "1" : "0.4"; sandBtn.style.background = mode !== "live" ? "var(--warn,#f59e0b)" : ""; sandBtn.style.color = mode !== "live" ? "#fff" : ""; }
  if (label)   label.textContent = "Modo: " + (mode === "live" ? "Live (real)" : "Sandbox (prueba)");
}

// Aplica un preset de fecha (días atrás) a los inputs
function ppApplyDatePreset(days) {
  const toEl   = document.getElementById("paypalTo");
  const fromEl = document.getElementById("paypalFrom");
  if (!fromEl || !toEl) return;
  const today = new Date();
  toEl.value = today.toISOString().slice(0, 10);
  if (days === "all") {
    // PayPal Transaction Search API solo permite hasta 3 años hacia atrás
    const threeYearsAgo = new Date(today);
    threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
    fromEl.value = threeYearsAgo.toISOString().slice(0, 10);
  } else {
    fromEl.value = new Date(today - days * 86400000).toISOString().slice(0, 10);
  }
}

// Filtra la tabla de transacciones en tiempo real
function ppFilterTable(query) {
  const q = query.toLowerCase().trim();
  const rows = document.querySelectorAll("#paypalTxnBody tr");
  let visible = 0;
  rows.forEach(row => {
    const match = !q || row.textContent.toLowerCase().includes(q);
    row.style.display = match ? "" : "none";
    if (match) visible++;
  });
  const countEl = document.getElementById("paypalTxnCount");
  if (countEl) countEl.textContent = visible + " filas";
}

function initPaypalView() {
  const fromEl   = document.getElementById("paypalFrom");
  const toEl     = document.getElementById("paypalTo");
  const btn      = document.getElementById("paypalLoadBtn");
  const preset   = document.getElementById("ppDatePreset");
  const searchEl = document.getElementById("ppSearch");
  const liveBtn  = document.getElementById("ppModeLive");
  const sandBtn  = document.getElementById("ppModeSandbox");

  // Establecer modo guardado (o Live por defecto)
  const savedMode = (() => { try { const s = JSON.parse(localStorage.getItem("crm_paypal")||"null"); return s?.mode||"live"; } catch(e){return "live";} })();
  ppSetMode(savedMode);

  // Fechas por defecto: últimos 30 días
  ppApplyDatePreset(30);

  // Preset de fecha cambia fechas automáticamente
  if (preset) {
    preset.value = "30";
    preset.addEventListener("change", () => {
      if (preset.value) ppApplyDatePreset(preset.value === "all" ? "all" : Number(preset.value));
    });
  }

  // Fechas manuales limpian el preset
  if (fromEl) fromEl.addEventListener("change", () => { if (preset) preset.value = ""; });
  if (toEl)   toEl.addEventListener("change",   () => { if (preset) preset.value = ""; });

  // Botones Live / Sandbox
  if (liveBtn) liveBtn.addEventListener("click", () => { ppSetMode("live"); loadPaypalData(); });
  if (sandBtn) sandBtn.addEventListener("click", () => { ppSetMode("sandbox"); loadPaypalData(); });

  // Botón cargar
  if (btn) btn.addEventListener("click", loadPaypalData);

  // Búsqueda en tiempo real
  if (searchEl) searchEl.addEventListener("input", () => ppFilterTable(searchEl.value));

  // Cargar datos automáticamente
  loadPaypalData();
}
