// =============================================================
// CONFIG — Se carga automáticamente desde localStorage al inicio
// =============================================================
let _pushLastOrderIds = new Set();
let _pushEnabled = false;

const CONFIG = (function() {
  const base = { mode: "demo", apiBaseUrl: "", apiToken: "", currency: "USD" };
  try {
    const stored = JSON.parse(localStorage.getItem("cpp_crm_config") || "null");
    if (stored?.url && stored?.token) {
      base.mode       = "api";
      base.apiBaseUrl = stored.url;
      base.apiToken   = stored.token;
      base.currency   = stored.currency || "USD";
    }
  } catch(e) {}
  return base;
})();

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
    // Intentar obtener nombre real del billing o del campo customer
    const billingName = [o.billing?.first_name, o.billing?.last_name].filter(Boolean).join(" ").trim()
      || [o.first_name, o.last_name].filter(Boolean).join(" ").trim();
    const resolvedName = billingName || o.customer || "Cliente";
    const resolvedPhone = o.billing?.phone || o.phone || "";
    map[key] ??= { name: resolvedName, email: o.customer_email || o.billing?.email || "",
                   phone: resolvedPhone,
                   revenue: 0, orders: 0, countries: new Set(), courses: new Set(), last: o.date };
    // Actualizar nombre si el actual es genérico y encontramos uno mejor
    if ((map[key].name === "Cliente" || !map[key].name) && resolvedName !== "Cliente") {
      map[key].name = resolvedName;
    }
    // Actualizar teléfono si aún no tenemos uno
    if (!map[key].phone && resolvedPhone) map[key].phone = resolvedPhone;
    map[key].orders++;
    if (["completed","processing"].includes(statusNorm(o.status))) map[key].revenue += netRev(o);
    map[key].countries.add(o.country || o.country_code || o.billing?.country || "");
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
    revenue, orders: valid.length,
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
  renderStripeView();
  renderSuscripciones();
  renderRevenuePrediction();
  renderSalesHeatmap();
  renderConversionByCountry();
  renderVIPPanel();
  updateGoalBar();
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

  const statusIcon = s => ({ completed:'✅', processing:'⏳', pending:'🔔', cancelled:'❌', refunded:'↩', 'on-hold':'⏸' }[s] || '📦');
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
  validRevenueOrders(orders).forEach(o =>
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
    ['⏳ Pendientes',  pend],
    ['❌ Cancelados',  canc],
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

  const totalPotential = pendingLeads.reduce((s,l) => s+l.value, 0)
    + cancelledLeads.reduce((s,l) => s+l.value, 0)
    + (inactiveLeads.length + upsellLeads.length) * avgTicket;

  // ── KPIs de oportunidades ──
  const kpisHtml = [
    ['🔥', pendingLeads.length,  'Pagos pendientes',     fmtMoney(pendingLeads.reduce((s,l)=>s+l.value,0))],
    ['🛒', cancelledLeads.length,'Carritos perdidos',     fmtMoney(cancelledLeads.reduce((s,l)=>s+l.value,0))],
    ['😴', inactiveLeads.length, 'Inactivos a reactivar',fmtMoney(inactiveLeads.length * avgTicket)],
    ['🚀', upsellLeads.length,   'Potencial upsell',     fmtMoney(upsellLeads.length * avgTicket)],
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

  const emKpisEl = $('#emKpis');
  if (emKpisEl) emKpisEl.innerHTML = kpisHtml;

  // ── Segment cards con conteo de destinatarios ──
  const cm = Object.values(customerMap(state.filtered));
  const now = Date.now();
  const allWithEmail = cm.filter(c => c.email);
  const vipEmails = cm.sort((a,b)=>b.revenue-a.revenue).slice(0, Math.ceil(cm.length*0.1)).map(c=>c.email);
  const segments = [
    { key:'all',      icon:'👥', label:'Todos los clientes',        count: allWithEmail.length,                                                              color:'var(--accent)' },
    { key:'inactive', icon:'😴', label:'Inactivos (+90 días)',       count: allWithEmail.filter(c=>new Date(c.last)<new Date(now-90*864e5)).length,           color:'#f59e0b' },
    { key:'vip',      icon:'⭐', label:'VIP (top 10%)',              count: allWithEmail.filter(c=>vipEmails.includes(c.email)).length,                      color:'#a78bfa' },
    { key:'risk',     icon:'⚠', label:'En riesgo (1 compra)',        count: allWithEmail.filter(c=>c.orders===1).length,                                     color:'#f87171' },
    { key:'upsell',   icon:'🚀', label:'Upsell (ticket bajo)',        count: allWithEmail.filter(c=>c.orders===1&&c.revenue<100).length,                     color:'#34d399' },
  ];
  const segCardsEl = $('#emSegmentCards');
  if (segCardsEl) {
    segCardsEl.innerHTML = segments.map(s =>
      `<div class="kpi-card" style="cursor:pointer;border:2px solid transparent;transition:.2s" data-seg="${s.key}"
            onmouseenter="this.style.borderColor='${s.color}'" onmouseleave="this.style.borderColor='transparent'"
            onclick="document.getElementById('emailSegment').value='${s.key}';updateEmailCountBadge()">
        <p class="kpi-label">${s.icon} ${s.label}</p>
        <p class="kpi-val" style="color:${s.color}">${s.count}</p>
        <p style="font-size:11px;color:var(--muted);margin:0">destinatarios</p>
      </div>`
    ).join('');
  }
  const totalBadge = $('#emTotalBadge');
  if (totalBadge) totalBadge.textContent = allWithEmail.length + ' con email';

  // ── Brevo & historial ──
  restoreBrevoConfig();
  renderCampaignHistory();

  // ── Inicializar tabs de oportunidades (solo la primera vez) ──
  const view = $('#view-oportunidades');
  if (view && !view.dataset.tabsInit) {
    view.dataset.tabsInit = '1';
    view.querySelectorAll('.opo-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        view.querySelectorAll('.opo-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        OPO_STATE.tab = btn.dataset.opotab;
        opoRenderList();
      });
    });
    $('#opoExportBtn')?.addEventListener('click', opoExportCSV);
  }
  opoRenderList();
  updateEmailCountBadge();
}

function updateEmailCountBadge() {
  const seg   = $('#emailSegment')?.value || 'all';
  const excl  = $('#excludeConverted')?.checked ?? false;
  const unsub = getUnsubscribeList();

  // Mostrar/ocultar filtros avanzados según segmento
  if ($('#filterCountryWrap'))     $('#filterCountryWrap').style.display     = seg === 'country'       ? '' : 'none';
  if ($('#filterTicketWrap'))      $('#filterTicketWrap').style.display      = seg === 'ticket'        ? '' : 'none';
  if ($('#filterCourseWrap'))      $('#filterCourseWrap').style.display      = seg === 'course'        ? '' : 'none';
  if ($('#smartCoursePanel'))      $('#smartCoursePanel').style.display      = seg === 'smart_course'  ? '' : 'none';
  if ($('#filterMinAmountWrap'))   $('#filterMinAmountWrap').style.display   = seg === 'min_amount'    ? '' : 'none';
  if ($('#filterLastPurchaseWrap'))$('#filterLastPurchaseWrap').style.display= seg === 'last_purchase' ? '' : 'none';
  if ($('#filterKanbanTagWrap'))   $('#filterKanbanTagWrap').style.display   = seg === 'kanban_tag'    ? '' : 'none';
  if ($('#filterMultiCountryWrap'))$('#filterMultiCountryWrap').style.display= seg === 'multi_country' ? '' : 'none';

  // Si es smart_course, el conteo lo actualiza renderSmartCourseResults
  if (seg === 'smart_course') return;

  const count = getEmailRecipients(seg, excl).filter(r => !unsub.includes(r.email)).length;
  const badge = $('#emailCountBadge');
  if (badge) badge.textContent = count + ' destinatarios';
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

// =============================================================
// EXPORTADOR EXCEL PROFESIONAL (HTML → .xls, sin dependencias)
// =============================================================
function _exportXLS(filename, sheetName, headers, colWidths, rows) {
  const esc = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const colDefs = colWidths.map(w => `<col style="width:${w}pt"/>`).join('');
  const headerRow = headers.map(h =>
    `<th style="background:#1a1a2e;color:#ffffff;font-weight:700;font-size:11pt;padding:8px 10px;border:1px solid #444;white-space:nowrap">${esc(h)}</th>`
  ).join('');
  const dataRows = rows.map((row, i) => {
    const bg = i % 2 === 0 ? '#f8f9fc' : '#ffffff';
    const cells = row.map((v, ci) => {
      const isNum = typeof v === 'number' || (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim()) && v.trim() !== '');
      const align = isNum ? 'right' : 'left';
      const fmt   = isNum ? `mso-number-format:"#,##0.00"` : '';
      return `<td style="background:${bg};color:#1a1a2e;font-size:10pt;padding:6px 10px;border:1px solid #dde1ea;text-align:${align};${fmt}">${esc(v)}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  const tableHtml = `\uFEFF<html xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:x="urn:schemas-microsoft-com:office:excel"
xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="UTF-8">
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets>
<x:ExcelWorksheet><x:Name>${esc(sheetName)}</x:Name>
<x:WorksheetOptions><x:Selected/>
<x:FreezePanes/><x:FrozenNoSplit/>
<x:SplitHorizontal>1</x:SplitHorizontal>
<x:TopRowBottomPane>1</x:TopRowBottomPane>
</x:WorksheetOptions>
</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
<style>
  body { font-family: Calibri, Arial, sans-serif; }
  table { border-collapse: collapse; width: 100%; }
</style>
</head><body>
<table>
  <colgroup>${colDefs}</colgroup>
  <thead><tr>${headerRow}</tr></thead>
  <tbody>${dataRows}</tbody>
</table>
</body></html>`;

  const blob = new Blob([tableHtml], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename.endsWith('.xls') ? filename : filename + '.xls';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function opoExportCSV() {
  const { pendingLeads, cancelledLeads, inactiveLeads, upsellLeads } = opoLeads();
  const all = [...pendingLeads, ...cancelledLeads, ...inactiveLeads, ...upsellLeads];
  const headers   = ['Tipo', 'Nombre', 'Email', 'País', 'Ciudad', 'Cursos', 'Valor estimado (USD)', 'Score', 'Acción recomendada'];
  const colWidths = [90, 160, 200, 80, 100, 220, 100, 60, 180];
  const rows = all.map(l => [
    l.tag.replace(/[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ\s]/g, '').trim(),
    l.name, l.email, l.country || '', l.city || '',
    l.courses, Number(l.value || 0).toFixed(2), Math.round(l.score), l.action || ''
  ]);
  const date = new Date().toISOString().slice(0, 10);
  _exportXLS(`Leads_Email_Marketing_${date}.xls`, 'Leads Email Marketing', headers, colWidths, rows);
  toast(`${all.length} leads exportados`, 'success');
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
  if (total >= 80) return { score: total, label: '💎 VIP',        cls: 'rfm-vip' };
  if (total >= 60) return { score: total, label: '🔥 Activo',     cls: 'rfm-active' };
  if (total >= 40) return { score: total, label: '⚡ Potencial',  cls: 'rfm-potential' };
  if (total >= 20) return { score: total, label: '😴 En riesgo',  cls: 'rfm-risk' };
  return              { score: total, label: '💤 Inactivo',    cls: 'rfm-inactive' };
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
      <div style="display:flex;align-items:flex-start;margin-bottom:3px;gap:6px;min-width:0">
        <span style="font-size:13px;flex:1;min-width:0;word-break:break-word;line-height:1.35" title="${esc(name)}">
          <span style="margin-right:4px">${medal}</span>${esc(name)}
        </span>
        <span style="font-size:11px;flex-shrink:0;color:var(--muted);text-align:right;white-space:nowrap;padding-top:1px">
          ${s.units}u &middot; ${fmtMoney(s.revenue)}
        </span>
      </div>
      <div style="height:6px;background:rgba(255,255,255,.08);border-radius:3px;overflow:hidden">
        <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,var(--accent),var(--accent2,var(--accent)));border-radius:3px;transition:width .4s"></div>
      </div>
    </div>`;
  }).join("");
}

// =============================================================
// MATRIZ CURSOS × CLIENTES — con selector interactivo y paginación
// =============================================================
const _cmState = {
  selectedCourses: [],   // cursos activos (max 10)
  allCourses: [],        // todos los cursos con stats
  page: 1,
  perPage: 25,
};

function cmBuildCourseList(orders) {
  const map = {};
  validRevenueOrders(orders).forEach(o =>
    (o.products || []).forEach(p => {
      const n = p.name || "Curso sin nombre";
      map[n] ??= { name: n, sales: 0, revenue: 0, customers: new Set() };
      map[n].sales   += Number(p.quantity || 1);
      map[n].revenue += Number(p.total    || 0);
      map[n].customers.add(o.customer_email || o.customer || o.id);
    })
  );
  return Object.values(map).sort((a, b) => b.revenue - a.revenue);
}

// Lookup global para que onclick="cmToggleIdx(n)" funcione siempre
window._cmVisibleNames = [];

function cmToggleIdx(i) {
  const name = window._cmVisibleNames[i];
  if (name !== undefined) cmToggleCourse(name);
}

function cmRenderChips(filter = "") {
  const container = document.getElementById("cmCourseChips");
  if (!container) return;
  const lower = filter.toLowerCase();
  const visible = filter
    ? _cmState.allCourses.filter(c => c.name.toLowerCase().includes(lower))
    : _cmState.allCourses;

  // Guardar nombres en array global (los índices en onclick son enteros, nunca se rompen)
  window._cmVisibleNames = visible.map(c => c.name);

  container.innerHTML = visible.map((c, i) => {
    const active = _cmState.selectedCourses.includes(c.name);
    const label  = c.name.length > 32 ? c.name.slice(0, 32) + "…" : c.name;
    return `<button class="cm-chip${active ? " cm-chip-active" : ""}"
      onclick="cmToggleIdx(${i})"
      title="${esc(c.name)} · ${c.sales} ventas · ${fmtMoney(c.revenue)}">
      ${esc(label)}<span class="cm-chip-count">${c.sales}</span>
    </button>`;
  }).join("");
}

function cmToggleCourse(name) {
  const idx = _cmState.selectedCourses.indexOf(name);
  if (idx >= 0) {
    _cmState.selectedCourses.splice(idx, 1);
  } else {
    _cmState.selectedCourses.push(name);
  }
  _cmState.page = 1;
  cmRenderChips(document.getElementById("cmCourseSearch")?.value || "");
  cmRenderSummary();
  cmRenderTable();
}

function cmRenderSummary() {
  const el = document.getElementById("cmCourseSummary");
  if (!el) return;
  if (!_cmState.selectedCourses.length) { el.innerHTML = ""; return; }
  const statsMap = Object.fromEntries(_cmState.allCourses.map(c => [c.name, c]));
  el.innerHTML = _cmState.selectedCourses.map(name => {
    const s = statsMap[name] || { sales: 0, revenue: 0, customers: new Set() };
    return `<div class="cm-summary-card">
      <div class="cm-summary-name" title="${esc(name)}">${esc(name.length > 30 ? name.slice(0,30)+"…" : name)}</div>
      <div class="cm-summary-stats">
        <span>💰 ${fmtMoney(s.revenue)}</span>
        <span>🛒 ${s.sales} ventas</span>
        <span>👤 ${s.customers.size} clientes</span>
      </div>
    </div>`;
  }).join("");
}

function cmRenderTable() {
  const tbl  = document.getElementById("courseMatrix");
  const pag  = document.getElementById("cmPagination");
  if (!tbl) return;

  const courses = _cmState.selectedCourses;
  if (!courses.length) {
    tbl.innerHTML = `<tbody><tr><td colspan="4" class="cm-empty-msg">
      Selecciona al menos un curso arriba para ver los clientes.
    </td></tr></tbody>`;
    if (pag) pag.innerHTML = "";
    const badge = document.getElementById("matrixBadge");
    if (badge) badge.textContent = `${_cmState.allCourses.length} cursos disponibles`;
    return;
  }

  const allCustomers = Object.values(customerMap(state.filtered))
    .filter(c => courses.some(name => c.courses.has(name)))
    .sort((a, b) => b.revenue - a.revenue);

  const total = allCustomers.length;
  const pages = Math.max(1, Math.ceil(total / _cmState.perPage));
  _cmState.page = Math.min(_cmState.page, pages);
  const start = (_cmState.page - 1) * _cmState.perPage;
  const slice = allCustomers.slice(start, start + _cmState.perPage);

  const badge = document.getElementById("matrixBadge");
  if (badge) badge.textContent = `${total} clientes · ${courses.length} cursos`;

  const thead = `<thead><tr>
    <th class="cm-th" style="width:220px">Cliente</th>
    <th class="cm-th">Cursos comprados</th>
    <th class="cm-th cm-th-r" style="width:110px">Ingresos</th>
    <th class="cm-th cm-th-c" style="width:80px">Pedidos</th>
  </tr></thead>`;

  const tbody = `<tbody>${slice.map((c, i) => {
    const bought    = courses.filter(name =>  c.courses.has(name));
    const notBought = courses.filter(name => !c.courses.has(name));
    // Otros cursos que este cliente comprò, fuera de la seleccion actual
    const otherCourses = [...c.courses].filter(name => !courses.includes(name)).sort();
    const selectedBadges =
      bought.map(name =>
        `<span class="cm-badge-yes" title="${esc(name)}">${esc(name.length > 30 ? name.slice(0,30)+"\u2026" : name)}</span>`
      ).join("") +
      notBought.map(name =>
        `<span class="cm-badge-no" title="${esc(name)}">${esc(name.length > 30 ? name.slice(0,30)+"\u2026" : name)}</span>`
      ).join("");
    const otherSection = otherCourses.length
      ? `<div class="cm-other-courses">
          <span class="cm-other-label">Tambi\u00e9n compr\u00f3 (${otherCourses.length}):</span>
          ${otherCourses.map(name =>
            `<span class="cm-badge-other" title="${esc(name)}">${esc(name.length > 30 ? name.slice(0,30)+"\u2026" : name)}</span>`
          ).join("")}
        </div>`
      : "";
    return `<tr class="cm-client-row">
      <td class="cm-client-cell">
        <div class="cm-client-name">${esc(c.name)}</div>
        <div class="cm-client-email">${esc(c.email)}</div>
      </td>
      <td class="cm-badges-cell">
        <div class="cm-badge-list">${selectedBadges}</div>
        ${otherSection}
      </td>
      <td class="cm-val-r"><strong>${fmtMoney(c.revenue)}</strong></td>
      <td class="cm-val-c">${c.orders}</td>
    </tr>`;
  }).join("")}</tbody>`;

  tbl.innerHTML = thead + tbody;

  if (pag) {
    if (pages <= 1) { pag.innerHTML = ""; return; }
    pag.innerHTML = `
      <button class="cm-page-btn" ${_cmState.page <= 1 ? "disabled" : ""}
        onclick="_cmState.page--;cmRenderTable()">‹ Anterior</button>
      <span class="cm-page-info">Página ${_cmState.page} de ${pages} · ${total} clientes</span>
      <button class="cm-page-btn" ${_cmState.page >= pages ? "disabled" : ""}
        onclick="_cmState.page++;cmRenderTable()">Siguiente ›</button>`;
  }
}

function cmExportCSV() {
  const courses = _cmState.selectedCourses;
  if (!courses.length) {
    alert("Selecciona al menos un curso antes de exportar.");
    return;
  }

  const allCustomers = Object.values(customerMap(state.filtered))
    .filter(c => courses.some(name => c.courses.has(name)))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!allCustomers.length) {
    alert("No hay clientes para los cursos seleccionados.");
    return;
  }

  const headers   = ['Nombre completo', 'Email', 'País', 'Teléfono', 'Cursos comprados', 'Total gastado (USD)', 'Pedidos'];
  const colWidths = [160, 200, 80, 110, 260, 100, 60];
  const rows = allCustomers.map(c => {
    const countriesList = [...c.countries].filter(Boolean).join(' / ') || '';
    const boughtCourses = courses.filter(name => c.courses.has(name)).join(' | ');
    return [
      c.name,
      c.email,
      countriesList,
      c.phone || '',
      boughtCourses,
      Number(c.revenue || 0).toFixed(2),
      c.orders
    ];
  });

  const dateStr     = new Date().toISOString().slice(0, 10);
  const courseLabel = courses.length === 1
    ? courses[0].slice(0, 40).replace(/[^a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ\s]/g, '').trim().replace(/\s+/g, '_')
    : `${courses.length}_cursos`;

  _exportXLS(`CRM_${courseLabel}_${dateStr}.xls`, 'Clientes por Curso', headers, colWidths, rows);
  toast(`${allCustomers.length} clientes exportados`, 'success');
}

function renderCourseMatrix() {
  _cmState.allCourses = cmBuildCourseList(state.filtered);
  _cmState.page = 1;

  // Si no hay selección previa, auto-seleccionar top 5
  if (_cmState.selectedCourses.length === 0 && _cmState.allCourses.length > 0) {
    _cmState.selectedCourses = _cmState.allCourses.slice(0, 5).map(c => c.name);
  } else {
    // Mantener solo los que siguen existiendo en el periodo actual
    _cmState.selectedCourses = _cmState.selectedCourses.filter(
      name => _cmState.allCourses.some(c => c.name === name)
    );
  }

  // Buscador
  const searchEl = document.getElementById("cmCourseSearch");
  if (searchEl && !searchEl._cmBound) {
    searchEl._cmBound = true;
    searchEl.addEventListener("input", () => cmRenderChips(searchEl.value));
  }

  // Botón limpiar
  const clearBtn = document.getElementById("cmClearBtn");
  if (clearBtn && !clearBtn._cmBound) {
    clearBtn._cmBound = true;
    clearBtn.addEventListener("click", () => {
      _cmState.selectedCourses = [];
      _cmState.page = 1;
      cmRenderChips(searchEl?.value || "");
      cmRenderSummary();
      cmRenderTable();
    });
  }

  // Botón top 10
  const topBtn = document.getElementById("cmSelectTopBtn");
  if (topBtn && !topBtn._cmBound) {
    topBtn._cmBound = true;
    topBtn.addEventListener("click", () => {
      _cmState.selectedCourses = _cmState.allCourses.slice(0, 10).map(c => c.name);
      _cmState.page = 1;
      cmRenderChips(searchEl?.value || "");
      cmRenderSummary();
      cmRenderTable();
    });
  }

  cmRenderChips();
  cmRenderSummary();
  cmRenderTable();
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
// GLOBO 3D — globe.gl (WebGL real con textura NASA)
// =============================================================

let _globe = null;   // instancia globe.gl
let _globeMode    = 'default'; // modo actual del globo
let _globeNight   = false;     // modo noche/día
let _globeMinRev  = 0;         // filtro slider mínimo revenue
let _globeTimeline= false;     // modo timeline activo
let _globeTimelineIdx = -1;    // índice del mes actual en timeline
let _globeTimelineTimer = null;// intervalo del timeline
let _globeRings   = [];        // anillos actuales
let _globeRingTimer = null;    // timer de anillos de onda
// Nuevas vars para mejoras
let _globeCompareA = null;     // país A para comparador
let _globeCompareB = null;     // país B para comparador
let _globeIsolated = null;     // país aislado (doble clic)
let _globeAlertDays= 30;       // días sin ventas = alerta
let _globeNavIdx   = 0;        // índice de navegación por teclado

// Texturas
const GLOBE_IMG        = 'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg';
const GLOBE_IMG_8K     = 'https://unpkg.com/three-globe/example/img/earth-day.jpg';
const GLOBE_NIGHT_TEX  = 'https://unpkg.com/three-globe/example/img/earth-night.jpg';
const GLOBE_BUMP       = 'https://unpkg.com/three-globe/example/img/earth-topology.png';
const GLOBE_NIGHT      = 'https://unpkg.com/three-globe/example/img/night-sky.png';
const GLOBE_CLOUDS     = 'https://unpkg.com/three-globe/example/img/earth-water.png';

function updateGlobePoints() {
  state.globe.points = Object.entries(groupBy(state.filtered, o => o.country_code || o.country))
    .map(([code, arr]) => {
      const ref = COUNTRIES.find(c => c.code === code)
               || { code, name: arr[0]?.country || code, lat: arr[0]?.latitude || 0, lon: arr[0]?.longitude || 0 };
      return { code, name: arr[0]?.country || ref.name, lat: ref.lat, lon: ref.lon,
               orders: arr.length, revenue: sum(validRevenueOrders(arr), netRev) };
    });

  // Actualizar slider max con el revenue real más alto
  const maxRev = Math.max(...state.globe.points.map(p => p.revenue), 1);
  const sl = document.getElementById('globeRevenueSlider');
  if (sl) sl.max = Math.ceil(maxRev / 100) * 100;

  _globeRefresh();
  // Pulsación visual al actualizar datos
  if (_globe) setTimeout(_globePulseOnLoad, 100);
}

// ── Pulsación al cargar nuevos datos ──
function _globePulseOnLoad() {
  if (!_globe) return;
  const pts = state.globe.points;
  if (!pts.length) return;
  // Doble pulso rápido en todos los puntos
  _globe.ringsData(pts)
    .ringLat('lat').ringLng('lon')
    .ringMaxRadius(3)
    .ringPropagationSpeed(3)
    .ringRepeatPeriod(500)
    .ringColor(() => f => `rgba(255,255,255,${Math.max(0,0.6-f)})`);
  setTimeout(() => {
    // Volver al estado normal del modo activo
    _globeRefresh();
  }, 1800);
}

// ── Explosión de partículas al clic (DOM overlay) ──
function _globeSpawnParticles(x, y) {
  const wrap = document.querySelector('.globe-wrap');
  if (!wrap) return;
  const colors = ['#4ade80','#f87171','#fbbf24','#818cf8','#22d3ee','#fb7185'];
  for (let i = 0; i < 18; i++) {
    const p = document.createElement('div');
    const angle  = (Math.random() * Math.PI * 2);
    const dist   = 30 + Math.random() * 55;
    const size   = 4 + Math.random() * 6;
    const color  = colors[Math.floor(Math.random() * colors.length)];
    const dur    = 500 + Math.random() * 400;
    p.style.cssText = `
      position:absolute;left:${x}px;top:${y}px;width:${size}px;height:${size}px;
      background:${color};border-radius:50%;pointer-events:none;z-index:30;
      transform:translate(-50%,-50%);opacity:1;
      transition:transform ${dur}ms ease-out,opacity ${dur}ms ease-out;
    `;
    wrap.appendChild(p);
    requestAnimationFrame(() => {
      p.style.transform = `translate(calc(-50% + ${Math.cos(angle)*dist}px), calc(-50% + ${Math.sin(angle)*dist}px)) scale(0.2)`;
      p.style.opacity   = '0';
    });
    setTimeout(() => p.remove(), dur + 50);
  }
}

// ── COMPARADOR DE 2 PAÍSES ──
function _showGlobeCompare(pA, pB) {
  const panel = document.getElementById('globeCountryPanel');
  if (!panel) return;
  function mkCol(p) {
    const orders = state.filtered.filter(o => (o.country_code||o.country)===p.code);
    const revMonth = {};
    orders.forEach(o => {
      const d = new Date(o.date_created||o.date_paid||'');
      if (isNaN(d)) return;
      const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      revMonth[k] = (revMonth[k]||0) + (parseFloat(o.total)||0);
    });
    const mKeys = Object.keys(revMonth).sort().slice(-6);
    const mVals = mKeys.map(k => revMonth[k]);
    const mMax  = Math.max(...mVals, 1);
    const bars  = mKeys.map((k,i) => {
      const h = Math.round(40 * mVals[i] / mMax) || 2;
      return `<div style="display:flex;flex-direction:column;align-items:center;gap:2px">
        <div style="width:14px;height:${h}px;background:#4ade80;border-radius:2px 2px 0 0;min-height:2px"></div>
        <span style="font-size:8px;color:#94a3b8">${k.slice(5)}</span>
      </div>`;
    }).join('');
    return `<div style="flex:1;text-align:center">
      <div style="font-weight:700;font-size:13px;margin-bottom:6px">${esc(p.name)}</div>
      <div style="color:#f87171;font-size:12px">${p.orders} pedidos</div>
      <div style="color:#4ade80;font-size:13px;font-weight:700">${fmtMoney(p.revenue)}</div>
      <div style="display:flex;gap:2px;align-items:flex-end;margin-top:8px;height:46px;justify-content:center">${bars}</div>
    </div>`;
  }
  const winner = pA.revenue >= pB.revenue ? pA : pB;
  panel.innerHTML = `
    <div class="globe-cp-header">
      <strong>⚖️ Comparador</strong>
      <button onclick="document.getElementById('globeCountryPanel').style.display='none';_globeCompareA=null;_globeCompareB=null;" style="background:none;border:none;color:#94a3b8;font-size:18px;cursor:pointer;line-height:1">&times;</button>
    </div>
    <div style="font-size:11px;color:#fbbf24;margin-bottom:8px">🏆 Gana <strong>${esc(winner.name)}</strong></div>
    <div style="display:flex;gap:12px;border-top:1px solid rgba(255,255,255,.1);padding-top:10px">
      ${mkCol(pA)}
      <div style="width:1px;background:rgba(255,255,255,.1)"></div>
      ${mkCol(pB)}
    </div>
  `;
  panel.style.display = 'block';
}

// Panel lateral al hacer clic en un país del globo
function _showGlobeCountryPanel(p) {
  const panel = document.getElementById('globeCountryPanel');
  if (!panel) return;
  const orders = state.filtered.filter(o => (o.country_code || o.country) === p.code);
  const revMonth = {};
  orders.forEach(o => {
    const d = new Date(o.date_created || o.date_paid || '');
    if (isNaN(d)) return;
    const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    revMonth[k] = (revMonth[k] || 0) + (parseFloat(o.total)||0);
  });
  const mKeys  = Object.keys(revMonth).sort().slice(-6);
  const mVals  = mKeys.map(k => revMonth[k]);
  const mMax   = Math.max(...mVals, 1);
  const bars   = mKeys.map((k, i) => {
    const h = Math.round(50 * mVals[i] / mMax) || 2;
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:3px">
      <div style="width:18px;height:${h}px;background:linear-gradient(to top,#4ade80,#22d3ee);border-radius:3px 3px 0 0;min-height:3px"></div>
      <span style="font-size:9px;color:#94a3b8">${k.slice(5)}</span>
    </div>`;
  }).join('');

  panel.innerHTML = `
    <div class="globe-cp-header">
      <strong>${esc(p.name)}</strong>
      <button onclick="document.getElementById('globeCountryPanel').style.display='none'" style="background:none;border:none;color:#94a3b8;font-size:18px;cursor:pointer;line-height:1">&times;</button>
    </div>
    <div class="globe-cp-stats">
      <div class="globe-cp-stat"><span>${p.orders}</span>Pedidos</div>
      <div class="globe-cp-stat"><span>${fmtMoney(p.revenue)}</span>Ingresos</div>
    </div>
    <div style="display:flex;gap:4px;align-items:flex-end;margin-top:10px;height:60px;padding-bottom:4px">${bars}</div>
    <button class="chip" style="margin-top:10px;width:100%" onclick="
      const s=document.getElementById('countryFilter');
      if(s){s.value='${esc(p.code)}';applyFilters();}
      document.getElementById('globeCountryPanel').style.display='none';
    ">Filtrar por este país</button>
    <button class="chip" style="margin-top:6px;width:100%;background:rgba(99,102,241,.25)" onclick="
      if(!_globeCompareA){_globeCompareA=window.__lastClickedPt;toast('País A: ${esc(p.name)} — ahora clic en otro');}
      else if(!_globeCompareB && _globeCompareA.code!=='${esc(p.code)}'){_globeCompareB=window.__lastClickedPt;_showGlobeCompare(_globeCompareA,_globeCompareB);}
      else{_globeCompareA=window.__lastClickedPt;_globeCompareB=null;toast('País A: ${esc(p.name)} — ahora clic en otro');}
    ">⚖️ Comparar</button>
  `;
  panel.style.display = 'block';
}

function _globeRefresh() {
  if (!_globe) return;
  const allPts = state.globe.points;

  // ── Filtro slider mínimo revenue ──
  let pts = _globeMinRev > 0
    ? allPts.filter(p => p.revenue >= _globeMinRev)
    : allPts;

  // ── Filtro: país aislado (doble clic) ──
  if (_globeIsolated) pts = pts.filter(p => p.code === _globeIsolated);

  const maxRev    = Math.max(...pts.map(p => p.revenue), 1);
  const maxOrders = Math.max(...pts.map(p => p.orders), 1);

  // ── Textura: modo noche o 8K ──
  const use8K = document.getElementById('globe8KBtn')?.classList.contains('active');
  const dayTex = use8K ? GLOBE_IMG_8K : GLOBE_IMG;
  _globe
    .globeImageUrl(_globeNight ? GLOBE_NIGHT_TEX : dayTex)
    .atmosphereColor(_globeNight ? '#ff9944' : 'lightskyblue');

  // ── Helper color choropleth ──
  function choroplethColor(rev) {
    const t = Math.pow(rev / maxRev, 0.5);
    const r = Math.round(20  + t * 220);
    const g = Math.round(60  - t * 10);
    const b = Math.round(180 - t * 160);
    return `rgba(${r},${g},${b},0.82)`;
  }

  // ── Top 5 ──
  const top5Codes = new Set(
    [...pts].sort((a,b) => b.revenue - a.revenue).slice(0,5).map(p => p.code)
  );

  // ── Alertas: países sin ventas en X días ──
  const now = Date.now();
  const alertCodes = new Set();
  const lastSaleDate = {};
  state.filtered.forEach(o => {
    const d = new Date(o.date_created || o.date_paid || '');
    const cc = o.country_code || o.country;
    if (!isNaN(d) && cc) {
      if (!lastSaleDate[cc] || d > lastSaleDate[cc]) lastSaleDate[cc] = d;
    }
  });
  pts.forEach(p => {
    const last = lastSaleDate[p.code];
    if (!last || (now - last.getTime()) > _globeAlertDays * 86400000) alertCodes.add(p.code);
  });

  // ── Tooltip enriquecido con sparkline 12 meses ──
  function richLabel(p) {
    const nowD   = new Date();
    const months = Array.from({length:12}, (_,i) => {
      const d = new Date(nowD.getFullYear(), nowD.getMonth() - (11-i), 1);
      return { label: d.toLocaleString('es',{month:'short'}), year: d.getFullYear(), month: d.getMonth() };
    });
    const byMonth = months.map(m => {
      const rev = state.filtered
        .filter(o => {
          const d  = new Date(o.date_created || o.date_paid || '');
          const cc = o.country_code || o.country;
          return cc === p.code && d.getFullYear() === m.year && d.getMonth() === m.month;
        })
        .reduce((s,o) => s + (parseFloat(o.total)||0), 0);
      return { label: m.label, rev };
    });
    const mMax = Math.max(...byMonth.map(m => m.rev), 1);
    // Sparkline SVG línea
    const svgW = 160, svgH = 32;
    const points = byMonth.map((m,i) => {
      const x = Math.round(i * svgW / 11);
      const y = Math.round(svgH - (m.rev / mMax) * svgH);
      return `${x},${y}`;
    }).join(' ');
    // Tendencia (últimos 3 meses)
    const recent = byMonth.slice(-3).map(m=>m.rev);
    const trend  = recent[2] > recent[0] ? '↑' : recent[2] < recent[0] ? '↓' : '→';
    const tColor = trend === '↑' ? '#4ade80' : trend === '↓' ? '#f87171' : '#fbbf24';
    const alertBadge = alertCodes.has(p.code)
      ? `<span style="background:#7f1d1d;color:#fca5a5;padding:2px 6px;border-radius:4px;font-size:10px">⚠ Sin ventas +${_globeAlertDays}d</span>`
      : '';
    return `<div style="background:rgba(8,12,24,.96);border:1px solid rgba(255,255,255,.18);
      border-radius:12px;padding:.7rem .9rem;font-family:Inter,sans-serif;font-size:13px;color:#fff;min-width:190px">
      <strong style="font-size:15px">${esc(p.name)}</strong>
      <span style="float:right;font-size:18px">${tColor === '#4ade80' ? '📈' : tColor === '#f87171' ? '📉' : '📊'}</span><br>
      <span style="color:#f87171">📅 ${p.orders} pedido${p.orders!==1?'s':''}</span>&nbsp;&nbsp;
      <span style="color:#4ade80">${fmtMoney(p.revenue)}</span>&nbsp;
      <span style="color:${tColor};font-weight:700">${trend}</span><br>
      ${alertBadge}
      <svg width="${svgW}" height="${svgH}" style="margin-top:6px;display:block">
        <polyline points="${points}" fill="none" stroke="#4ade80" stroke-width="1.8" stroke-linejoin="round"/>
        <polyline points="${points}" fill="url(#gl)" stroke="none"/>
        <defs>
          <linearGradient id="gl" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#4ade80" stop-opacity=".25"/>
            <stop offset="100%" stop-color="#4ade80" stop-opacity="0"/>
          </linearGradient>
        </defs>
      </svg>
    </div>`;
  }

  const mode = _globeMode;

  // ── MODO HEX BINS (hexágonos 3D) ──
  if (mode === 'hexbin') {
    // Usar los pedidos individuales como puntos lat/lng para hex binning
    const hexPts = state.filtered
      .map(o => {
        const cc  = o.country_code || o.country;
        const ref = COUNTRIES.find(c => c.code === cc);
        if (!ref) return null;
        // Dispersión aleatoria para que los hex bins no colapsen en un solo hex
        return { lat: ref.lat + (Math.random()-0.5)*4, lng: ref.lon + (Math.random()-0.5)*4, weight: parseFloat(o.total)||1 };
      }).filter(Boolean);
    _globe
      .hexBinPointsData(hexPts)
      .hexBinPointWeight('weight')
      .hexAltitude(d => 0.05 + d.sumWeight / Math.max(...hexPts.map(p=>p.weight), 1) * 0.25)
      .hexBinResolution(3)
      .hexTopColor(d => {
        const t = d.sumWeight / Math.max(...hexPts.map(p=>p.weight), 1);
        return `rgba(${Math.round(60+t*195)},${Math.round(220-t*180)},${Math.round(255-t*200)},0.9)`;
      })
      .hexSideColor(d => {
        const t = d.sumWeight / Math.max(...hexPts.map(p=>p.weight), 1);
        return `rgba(${Math.round(60+t*195)},${Math.round(220-t*180)},${Math.round(255-t*200)},0.4)`;
      })
      .hexLabel(d => `<div style="background:rgba(8,12,24,.9);border-radius:8px;padding:6px 10px;color:#fff;font-size:12px">
        Densidad: <strong>${d.points.length}</strong> pedidos<br>Rev: <strong>${fmtMoney(d.sumWeight)}</strong>
      </div>`);
    _globe.pointsData([]).ringsData([]).arcsData([]).labelsData([]).polygonsData([]);
    return;
  } else {
    _globe.hexBinPointsData([]);
  }

  // ── Polígonos choropleth ──
  if ((mode === 'choropleth' || mode === 'all') && typeof window._worldPolys !== 'undefined') {
    const revByCode = {};
    pts.forEach(p => revByCode[p.code] = p.revenue);
    _globe
      .polygonsData(window._worldPolys.features)
      .polygonAltitude(0.005)
      .polygonCapColor(f => {
        const rev = revByCode[f.properties.ISO_A2] || 0;
        if (rev === 0) return 'rgba(255,255,255,0.04)';
        return choroplethColor(rev);
      })
      .polygonSideColor(() => 'rgba(255,255,255,0.03)')
      .polygonStrokeColor(() => 'rgba(255,255,255,0.12)')
      .polygonLabel(f => {
        const pt = pts.find(p => p.code === f.properties.ISO_A2);
        return pt ? richLabel(pt) : `<div style="background:rgba(8,12,24,.85);border-radius:8px;padding:.4rem .6rem;color:#fff;font-size:12px">${f.properties.NAME}</div>`;
      });
  } else {
    _globe.polygonsData([]);
  }

  // ── Puntos/columnas (con gradiente densidad+revenue) ──
  const showPoints = mode !== 'hexbin';
  if (showPoints) {
    _globe
      .pointsData(pts)
      .pointLat('lat')
      .pointLng('lon')
      .pointAltitude(p => {
        if (mode === 'heatmap') return 0.001;
        return 0.04 + (p.revenue / maxRev) * 0.18;
      })
      .pointRadius(p => {
        if (mode === 'heatmap') return 1.5 + (p.revenue / maxRev) * 3.5;
        if (mode === 'top5')    return top5Codes.has(p.code) ? 0.5 + (p.revenue / maxRev) * 1.8 : 0.2;
        return 0.35 + (p.revenue / maxRev) * 1.4;
      })
      .pointColor(p => {
        // Gradiente por densidad: blend revenue + órdenes
        const tRev  = p.revenue / maxRev;
        const tOrd  = p.orders  / maxOrders;
        const t     = (tRev * 0.6 + tOrd * 0.4);
        if (mode === 'heatmap') return `rgba(${Math.round(255*t)},${Math.round(120*(1-t))},60,${0.3+t*0.45})`;
        if (mode === 'top5') {
          if (!top5Codes.has(p.code)) return 'rgba(150,150,150,0.25)';
          return `rgba(${Math.round(220+t*35)},${Math.round(40-t*30)},${Math.round(60-t*40)},0.95)`;
        }
        if (alertCodes.has(p.code)) return 'rgba(239,68,68,0.85)'; // rojo alerta
        if (mode === 'choropleth' || mode === 'all') return choroplethColor(p.revenue);
        return `rgba(${Math.round(220+t*35)},${Math.round(40-t*30)},${Math.round(60-t*40)},0.92)`;
      })
      .pointLabel(p => richLabel(p));
  } else {
    _globe.pointsData([]);
  }

  // ── Anillos de ALERTA (rojos, países sin ventas X días) ──
  const alertPts = pts.filter(p => alertCodes.has(p.code));
  if (alertPts.length && mode !== 'hexbin') {
    // Mezclamos alertas con pulso si corresponde
    const ringData = (mode === 'pulse' || mode === 'all')
      ? pts
      : alertPts;
    _globe
      .ringsData(ringData)
      .ringLat('lat')
      .ringLng('lon')
      .ringMaxRadius(p => alertCodes.has(p.code) ? 3.5 : 2 + (p.revenue/maxRev)*3)
      .ringPropagationSpeed(p => alertCodes.has(p.code) ? 2.5 : 1 + (p.revenue/maxRev)*2)
      .ringRepeatPeriod(p => alertCodes.has(p.code) ? 600 : 800 + (1-p.revenue/maxRev)*1200)
      .ringColor(p => {
        if (alertCodes.has(p.code)) return f => `rgba(239,68,68,${Math.max(0, 0.9-f)})`;
        const t = p.revenue/maxRev;
        return f => `rgba(${Math.round(80+t*175)},${Math.round(200-t*100)},255,${Math.max(0,0.8-f)})`;
      });
  } else if (mode === 'pulse' || mode === 'all') {
    _globe
      .ringsData(pts)
      .ringLat('lat')
      .ringLng('lon')
      .ringMaxRadius(p => 2 + (p.revenue/maxRev)*3)
      .ringPropagationSpeed(p => 1 + (p.revenue/maxRev)*2)
      .ringRepeatPeriod(p => 800 + (1-p.revenue/maxRev)*1200)
      .ringColor(p => { const t=p.revenue/maxRev; return f=>`rgba(${Math.round(80+t*175)},${Math.round(200-t*100)},255,${Math.max(0,0.8-f)})`; });
  } else {
    _globe.ringsData([]);
  }

  // ── Arcos bidireccionales (top país ↔ resto) ──
  if (['arcs','all'].includes(mode) && pts.length >= 2) {
    const sorted  = [...pts].sort((a,b) => b.revenue - a.revenue);
    const origin  = sorted[0];
    const targets = sorted.slice(1, Math.min(9, sorted.length));
    const arcs    = [];
    targets.forEach(t => {
      // A→B
      arcs.push({
        startLat: origin.lat, startLng: origin.lon,
        endLat: t.lat, endLng: t.lon,
        color: ['rgba(255,200,60,0.9)','rgba(255,100,60,0.4)'],
        stroke: 0.4 + (t.revenue/maxRev)*0.8,
        dir: 'out'
      });
      // B→A (bidireccional, color diferente)
      arcs.push({
        startLat: t.lat, startLng: t.lon,
        endLat: origin.lat, endLng: origin.lon,
        color: ['rgba(56,189,248,0.6)','rgba(99,102,241,0.3)'],
        stroke: 0.2 + (t.revenue/maxRev)*0.4,
        dir: 'in'
      });
    });
    _globe
      .arcsData(arcs)
      .arcStartLat('startLat').arcStartLng('startLng')
      .arcEndLat('endLat').arcEndLng('endLng')
      .arcColor('color')
      .arcAltitudeAutoScale(0.4)
      .arcStroke('stroke')
      .arcDashLength(0.35)
      .arcDashGap(0.15)
      .arcDashAnimateTime(a => a.dir === 'in' ? 2400 : 1800)
      .arcDashInitialGap(() => Math.random());
  } else {
    _globe.arcsData([]);
  }

  // ── Labels top 5 con KPIs flotantes (tendencia ↑↓) ──
  if (mode === 'top5' || mode === 'all') {
    const top5 = [...pts].sort((a,b) => b.revenue - a.revenue).slice(0,5);
    // Calcular tendencia mensual para cada uno
    top5.forEach(p => {
      const last2m = [1,0].map(offset => {
        const d = new Date();
        d.setMonth(d.getMonth() - offset);
        return state.filtered
          .filter(o => {
            const od = new Date(o.date_created||o.date_paid||'');
            return (o.country_code||o.country)===p.code && od.getMonth()===d.getMonth() && od.getFullYear()===d.getFullYear();
          })
          .reduce((s,o) => s+(parseFloat(o.total)||0), 0);
      });
      p._trend = last2m[0] > last2m[1] ? '↑' : last2m[0] < last2m[1] ? '↓' : '→';
    });
    _globe
      .labelsData(top5)
      .labelLat('lat')
      .labelLng('lon')
      .labelText(p => `${p.name} ${p._trend}`)
      .labelSize(p => 0.55 + (p.revenue/maxRev)*0.5)
      .labelDotRadius(p => 0.3 + (p.revenue/maxRev)*0.4)
      .labelColor(p => p._trend==='↑' ? '#4ade80' : p._trend==='↓' ? '#f87171' : '#fbbf24')
      .labelResolution(2)
      .labelAltitude(0.03);
  } else {
    _globe.labelsData([]);
  }
}

// Reconstruir el globo cuando se pierde el contexto WebGL
function _rebuildGlobe() {
  try {
    if (_globe) {
      // Detener animación y liberar recursos Three.js
      if (_globe.controls) _globe.controls().autoRotate = false;
      if (_globe.renderer) {
        const r = _globe.renderer();
        if (r.dispose) r.dispose();
      }
      _globe = null;
    }
    const container = document.getElementById('globeCanvas');
    if (container) container.innerHTML = ''; // limpiar el canvas viejo
    _initGlobeNow();
  } catch(e) {
    // Si falla, esperar 1s y reintentar una vez
    setTimeout(() => {
      _globe = null;
      const c = document.getElementById('globeCanvas');
      if (c) c.innerHTML = '';
      _initGlobeNow();
    }, 1000);
  }
}

function initGlobe() {
  // Listener de visibilitychange: si el tab vuelve visible y el globo está
  // en blanco (contexto WebGL perdido), lo reconstruimos automáticamente
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (!_globe) return;
    const view = document.getElementById('view-home');
    if (!view || view.style.display === 'none') return; // solo si el globo está visible
    try {
      const gl = _globe.renderer && _globe.renderer().getContext();
      if (gl && gl.isContextLost()) _rebuildGlobe();
    } catch(e) { _rebuildGlobe(); }
  });

  // Si globe.gl aún no cargó, esperar hasta 10s
  if (typeof Globe === 'undefined') {
    let tries = 0;
    const wait = setInterval(() => {
      tries++;
      if (typeof Globe !== 'undefined') { clearInterval(wait); _initGlobeNow(); }
      else if (tries > 100) clearInterval(wait); // abandona tras 10s
    }, 100);
    return;
  }
  _initGlobeNow();
}

function _initGlobeNow() {
  const container = document.getElementById('globeCanvas');
  if (!container) return;

  const wrap = container.parentElement;
  const W = wrap ? (wrap.offsetWidth || 700) : 700;
  const H = Math.max(460, Math.round(W * 0.65));
  container.style.width  = W + 'px';
  container.style.height = H + 'px';

  // Constructor correcto: new Globe(domElement, options)
  _globe = new Globe(container, { animateIn: true })
    .width(W)
    .height(H)
    .globeImageUrl(GLOBE_IMG)
    .bumpImageUrl(GLOBE_BUMP)
    .backgroundImageUrl(GLOBE_NIGHT)
    .showAtmosphere(true)
    .atmosphereColor('lightskyblue')
    .atmosphereAltitude(0.18)
    .showGraticules(true)
    // lon → lng (mis datos usan 'lon', globe.gl espera 'lng')
    .pointLat('lat')
    .pointLng('lon')
    .pointsMerge(false)
    .onPointClick((p, event) => {
      window.__lastClickedPt = p;
      const sel = document.getElementById('countryFilter');
      if (sel) { sel.value = p.code; applyFilters(); }
      toast('País seleccionado: ' + p.name);
      // Zoom al país + panel lateral
      _globe.pointOfView({ lat: p.lat, lng: p.lon, altitude: 1.4 }, 900);
      _showGlobeCountryPanel(p);
      // Explosión de partículas
      if (event) {
        const wrap = document.querySelector('.globe-wrap');
        if (wrap) {
          const rect = wrap.getBoundingClientRect();
          _globeSpawnParticles(event.clientX - rect.left, event.clientY - rect.top);
        }
      }
    })
    .onGlobeReady(() => {
      // ── Animación cinematográfica de entrada ──
      _globe.pointOfView({ lat: 20, lng: -120, altitude: 3.5 });
      setTimeout(() => _globe.pointOfView({ lat: 5, lng: -40, altitude: 2.5 }, 1200), 200);
      setTimeout(() => {
        _globe.pointOfView({ lat: 10, lng: -70, altitude: 2.2 }, 1000);
        _globeRefresh();
        // ── Pulsación inicial: "respirar" al cargar ──
        _globePulseOnLoad();
      }, 1600);

      // ── Recuperación ante pérdida de contexto WebGL (tab en background) ──
      const glCanvas = _globe.renderer && _globe.renderer().domElement;
      if (glCanvas) {
        glCanvas.addEventListener('webglcontextlost', e => {
          e.preventDefault();
        }, false);
        glCanvas.addEventListener('webglcontextrestored', () => {
          setTimeout(_rebuildGlobe, 200);
        }, false);
      }
    });

  // Auto-rotación
  _globe.controls().autoRotate      = state.globe.autoRotate;
  _globe.controls().autoRotateSpeed = 0.5;
  _globe.controls().enableZoom      = true;

  // Botón Auto-giro
  document.getElementById('autoRotateBtn')?.addEventListener('click', function() {
    state.globe.autoRotate = !state.globe.autoRotate;
    _globe.controls().autoRotate = state.globe.autoRotate;
    this.classList.toggle('active', state.globe.autoRotate);
  });

  // Botón Centrar
  document.getElementById('resetGlobeBtn')?.addEventListener('click', () => {
    _globe.pointOfView({ lat: 10, lng: -70, altitude: 2.2 }, 800);
  });

  // Botones de modo
  document.querySelectorAll('.globe-mode-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.globe-mode-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      const mode = this.dataset.mode;
      _globeMode = mode;
      try { localStorage.setItem('crm_globe_mode', mode); } catch(e) {}
      _globeRefresh();
    });
  });

  // ── BÚSQUEDA DE PAÍS ──
  const searchInput = document.getElementById('globeSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', function() {
      const q = this.value.trim().toLowerCase();
      if (!q) return;
      const match = state.globe.points.find(p =>
        p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)
      );
      if (match) {
        _globe.pointOfView({ lat: match.lat, lng: match.lon, altitude: 1.5 }, 1000);
        _showGlobeCountryPanel(match);
      }
    });
  }

  // ── SLIDER DE REVENUE MÍNIMO ──
  const revSlider = document.getElementById('globeRevenueSlider');
  const revLabel  = document.getElementById('globeRevenueLabel');
  if (revSlider) {
    revSlider.addEventListener('input', function() {
      _globeMinRev = parseFloat(this.value) || 0;
      if (revLabel) revLabel.textContent = _globeMinRev > 0 ? fmtMoney(_globeMinRev) : 'Todos';
      _globeRefresh();
    });
  }

  // ── TOGGLE MODO NOCHE ──
  const nightBtn = document.getElementById('globeNightBtn');
  if (nightBtn) {
    nightBtn.addEventListener('click', function() {
      _globeNight = !_globeNight;
      this.classList.toggle('active', _globeNight);
      this.textContent = _globeNight ? '☀️ Día' : '🌙 Noche';
      _globeRefresh();
    });
  }

  // ── TOGGLE NUBES ANIMADAS ──
  const cloudsBtn = document.getElementById('globeCloudsBtn');
  let _cloudsMesh = null;
  if (cloudsBtn) {
    cloudsBtn.addEventListener('click', function() {
      this.classList.toggle('active');
      const active = this.classList.contains('active');
      if (active && !_cloudsMesh) {
        // Cargar textura de nubes y añadir esfera extra a la escena
        const THREE = _globe.scene ? window.THREE : null;
        if (THREE) {
          const loader = new THREE.TextureLoader();
          loader.load(GLOBE_CLOUDS, tex => {
            const R = 101.5; // radio ligeramente mayor que el globo (100)
            const geo = new THREE.SphereGeometry(R, 48, 48);
            const mat = new THREE.MeshPhongMaterial({
              map: tex, transparent: true, opacity: 0.32, depthWrite: false
            });
            _cloudsMesh = new THREE.Mesh(geo, mat);
            _globe.scene().add(_cloudsMesh);
            // Animar nubes girando lentamente
            (function animate() {
              if (!_cloudsMesh) return;
              requestAnimationFrame(animate);
              _cloudsMesh.rotation.y += 0.0005;
            })();
          });
        }
      } else if (!active && _cloudsMesh) {
        _globe.scene().remove(_cloudsMesh);
        _cloudsMesh = null;
      }
    });
  }

  // ── TIMELINE DE MESES ──
  const timelineSlider = document.getElementById('globeTimelineSlider');
  const timelineLabel  = document.getElementById('globeTimelineLabel');
  const timelinePlay   = document.getElementById('globeTimelinePlay');

  function _buildTimelineFrames() {
    // Agrupar pedidos por mes → { "2024-01": [...], ... }
    const byMonth = {};
    state.filtered.forEach(o => {
      const d = new Date(o.date_created || o.date_paid || '');
      if (isNaN(d)) return;
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      (byMonth[key] = byMonth[key] || []).push(o);
    });
    return Object.keys(byMonth).sort().map(k => ({
      label: k,
      orders: byMonth[k]
    }));
  }

  function _applyTimelineFrame(frames, idx) {
    if (!frames || !frames[idx]) return;
    const frame = frames[idx];
    // Construir puntos de globo solo con los pedidos del mes
    const grouped = groupBy(frame.orders, o => o.country_code || o.country);
    const pts = Object.entries(grouped)
      .map(([code, orders]) => {
        const geo = COUNTRY_COORDS[code];
        if (!geo) return null;
        return {
          code,
          name: geo.name || code,
          lat:  geo.lat,
          lon:  geo.lon,
          orders: orders.length,
          revenue: orders.reduce((s,o) => s + (parseFloat(o.total)||0), 0)
        };
      }).filter(Boolean);
    const tmp = state.globe.points;
    state.globe.points = pts;
    if (timelineLabel) timelineLabel.textContent = frame.label;
    _globeRefresh();
    state.globe.points = tmp; // restaurar estado real
  }

  if (timelineSlider) {
    timelineSlider.addEventListener('input', function() {
      if (_globeTimelineTimer) { clearInterval(_globeTimelineTimer); _globeTimelineTimer = null; }
      const frames = _buildTimelineFrames();
      if (!frames.length) return;
      const idx = Math.min(parseInt(this.value), frames.length - 1);
      this.max = frames.length - 1;
      _globeTimelineIdx = idx;
      _applyTimelineFrame(frames, idx);
    });
  }
  if (timelinePlay) {
    timelinePlay.addEventListener('click', function() {
      if (_globeTimelineTimer) {
        clearInterval(_globeTimelineTimer);
        _globeTimelineTimer = null;
        this.textContent = '▶';
        if (timelineSlider) timelineSlider.value = 0;
        _globeRefresh(); // restaurar datos actuales
        return;
      }
      const frames = _buildTimelineFrames();
      if (!frames.length) { toast('Sin datos para timeline'); return; }
      if (timelineSlider) { timelineSlider.max = frames.length - 1; timelineSlider.value = 0; }
      let idx = 0;
      this.textContent = '⏹';
      _globeTimelineIdx = 0;
      _applyTimelineFrame(frames, idx);
      _globeTimelineTimer = setInterval(() => {
        idx++;
        if (idx >= frames.length) {
          clearInterval(_globeTimelineTimer);
          _globeTimelineTimer = null;
          if (timelinePlay) timelinePlay.textContent = '▶';
          if (timelineSlider) timelineSlider.value = 0;
          _globeRefresh();
          return;
        }
        if (timelineSlider) timelineSlider.value = idx;
        _applyTimelineFrame(frames, idx);
      }, 1200);
    });
  }

  // Vista inicial centrada en Latinoamérica (antes de animación se sobreescribe en onGlobeReady)
  _globe.pointOfView({ lat: 20, lng: -120, altitude: 3.5 });

  // ── BOTÓN 8K ──
  document.getElementById('globe8KBtn')?.addEventListener('click', function() {
    this.classList.toggle('active');
    _globeRefresh();
  });

  // ── BOTÓN ALERTAS ──
  document.getElementById('globeAlertBtn')?.addEventListener('click', function() {
    this.classList.toggle('active');
    const active = this.classList.contains('active');
    _globeAlertDays = active ? 30 : 9999;
    this.title = active ? `Alertando países sin ventas +${_globeAlertDays}d` : 'Alertas desactivadas';
    _globeRefresh();
  });

  // ── DOBLE CLIC: aislar país ──
  container.addEventListener('dblclick', () => {
    if (_globeIsolated) {
      // Desaislar
      _globeIsolated = null;
      toast('Vista global restaurada');
      _globe.pointOfView({ lat: 10, lng: -70, altitude: 2.2 }, 800);
      _globeRefresh();
    } else if (window.__lastClickedPt) {
      _globeIsolated = window.__lastClickedPt.code;
      toast(`Aislando: ${window.__lastClickedPt.name} — doble clic para salir`);
      _globe.pointOfView({ lat: window.__lastClickedPt.lat, lng: window.__lastClickedPt.lon, altitude: 0.8 }, 1000);
      _globeRefresh();
    }
  });

  // ── ATAJOS DE TECLADO ──
  document.addEventListener('keydown', e => {
    // Solo activos si el globo es visible
    const view = document.getElementById('view-home');
    if (!view || view.style.display === 'none') return;
    if (e.target.matches('input,textarea,select')) return;

    const pts = state.globe.points;
    if (!pts.length) return;

    if (e.key === 'r' || e.key === 'R') {
      _globeIsolated = null;
      _globe.pointOfView({ lat: 10, lng: -70, altitude: 2.2 }, 700);
      toast('Vista centrada');
    } else if (e.key === 'n' || e.key === 'N') {
      _globeNight = !_globeNight;
      const btn = document.getElementById('globeNightBtn');
      if (btn) { btn.classList.toggle('active', _globeNight); btn.textContent = _globeNight ? '☀️ Día' : '🌙 Noche'; }
      _globeRefresh();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const sorted = [...pts].sort((a,b) => b.revenue - a.revenue);
      _globeNavIdx = Math.max(0, Math.min(sorted.length-1,
        _globeNavIdx + (e.key === 'ArrowRight' ? 1 : -1)
      ));
      const p = sorted[_globeNavIdx];
      _globe.pointOfView({ lat: p.lat, lng: p.lon, altitude: 1.5 }, 700);
      toast(`${p.name} — ${fmtMoney(p.revenue)}`);
      window.__lastClickedPt = p;
    } else if (e.key === 'Escape') {
      _globeIsolated = null;
      _globeCompareA = null;
      _globeCompareB = null;
      const cp = document.getElementById('globeCountryPanel');
      if (cp) cp.style.display = 'none';
      _globeRefresh();
    }
  });

  // ── AUTOFOCUS: país con mayor crecimiento mensual ──
  setTimeout(() => {
    const pts = state.globe.points;
    if (!pts.length) return;
    const now    = new Date();
    const growth = pts.map(p => {
      const getMonthRev = offset => {
        const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
        return state.filtered
          .filter(o => {
            const od = new Date(o.date_created||o.date_paid||'');
            const cc = o.country_code||o.country;
            return cc===p.code && od.getMonth()===d.getMonth() && od.getFullYear()===d.getFullYear();
          })
          .reduce((s,o) => s+(parseFloat(o.total)||0), 0);
      };
      const m0 = getMonthRev(0), m1 = getMonthRev(1);
      return { p, pct: m1 > 0 ? (m0-m1)/m1 : (m0 > 0 ? 1 : 0) };
    });
    const best = growth.sort((a,b) => b.pct - a.pct)[0];
    if (best && best.pct > 0) {
      toast(`🚀 Mayor crecimiento: ${best.p.name} (+${Math.round(best.pct*100)}%)`);
      setTimeout(() => {
        _globe.pointOfView({ lat: best.p.lat, lng: best.p.lon, altitude: 1.6 }, 1200);
        setTimeout(() => _globe.pointOfView({ lat: 10, lng: -70, altitude: 2.2 }, 1200), 3000);
      }, 500);
    }
  }, 3000);

  // Redimensionar el globo automáticamente cuando cambia el tamaño del contenedor
  // (rotación de pantalla, resize de ventana, cambio de orientación en móvil)
  if (typeof ResizeObserver !== 'undefined') {
    const _ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const newW = Math.round(entry.contentRect.width);
        const newH = Math.round(entry.contentRect.height);
        if (_globe && newW > 50 && newH > 50) {
          _globe.width(newW).height(newH);
        }
      }
    });
    _ro.observe(container);
  }
}



// =============================================================
// GRAFICO DE LINEA - ingresos por dia
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

  const colors = { '💎 VIP':'#fbbf24', '🔥 Activo':'#ef233c', '⚡ Potencial':'#38bdf8', '😴 En riesgo':'#f59e0b', '💤 Inactivo':'#9ca3af' };

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
        const labels = { new:'Nuevo', contacted:'Contactado', won:'✅ Ganado', lost:'❌ Perdido' };
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
    const labels = { new:'Nuevo', contacted:'Contactado', won:'Ganado ✅', lost:'Perdido ❌' };
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

  const stIcon = s => ({ completed:'✅', processing:'⏳', pending:'🔔', cancelled:'❌', refunded:'↩' }[s] || '📦');

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
  const allC    = Object.values(customerMap(state.orders));
  const list    = Object.values(customerMap(state.filtered)).sort((a, b) => b.revenue - a.revenue);
  const headers   = ['Nombre completo', 'Email', 'Pedidos', 'Cursos distintos', 'Ingresos (USD)', 'Segmento RFM', 'Score RFM', 'Última compra'];
  const colWidths = [160, 200, 60, 70, 90, 120, 60, 90];
  const rows = list.map(c => {
    const rfm = rfmScore(c, allC);
    return [c.name, c.email, c.orders, c.courses.size, Number(c.revenue || 0).toFixed(2),
            rfm.label.replace(/[^\w\sáéíóúüñÁÉÍÓÚÜÑ]/g, '').trim(), Math.round(rfm.score), c.last?.slice(0, 10) || ''];
  });
  _exportXLS(`Clientes_RFM_${new Date().toISOString().slice(0,10)}.xls`, 'Clientes CRM', headers, colWidths, rows);
  toast(`${list.length} clientes exportados`, 'success');
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

  window.addEventListener("resize", debounce(() => renderRevenueChart(), 150));

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
    $("#cfgShowToken").textContent = inp.type === "password" ? "👁 Ver" : "🙈 Ocultar";
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
        st.className = "cfg-status error"; st.textContent = "🔌 Plugin no encontrado (404). Verifica que el plugin esté activo.";
      } else {
        st.className = "cfg-status error"; st.textContent = "⚠ Respuesta inesperada: " + res.status;
      }
    } catch (e) {
      st.className = "cfg-status error";
      st.textContent = "❌ No se pudo conectar. Verifica la URL o CORS del servidor.";
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
  try {
    const stored = JSON.parse(localStorage.getItem("cpp_crm_config") || "null");
    if (stored?.url && stored?.token) {
      $("#cfgUrl").value      = stored.url;
      $("#cfgToken").value    = stored.token;
      $("#cfgCurrency").value = stored.currency || "USD";
      CONFIG.mode       = "api";
      CONFIG.apiBaseUrl = stored.url;
      CONFIG.apiToken   = stored.token;
      CONFIG.currency   = stored.currency || "USD";
    }
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
  $("#emailPreviewBtn")?.addEventListener("click", () => {
    renderEmailPreview();
  });
  $("#emailExportBtn")?.addEventListener("click", exportEmailList);
  $("#emailSendBtn")?.addEventListener("click", sendEmailMailto);

  // ── Brevo ──
  $("#brevoConfigToggle")?.addEventListener("click", () => {
    const panel = $("#brevoConfigPanel");
    if (!panel) return;
    const isOpen = panel.style.display !== "none";
    panel.style.display = isOpen ? "none" : "block";
  });
  $("#brevoSaveBtn")?.addEventListener("click", saveBrevoConfig);
  $("#brevoTestBtn")?.addEventListener("click", testBrevoConnection);
  $("#emailSendBrevoBtn")?.addEventListener("click", sendViaBrevo);
  $("#clearCampaignHistoryBtn")?.addEventListener("click", clearCampaignHistory);

  // ── Stripe ──
  $("#stripeRefreshBtn")?.addEventListener("click", renderStripeView);
  $("#stripeSearch")?.addEventListener("input", renderStripeView);

  // ── Suscripciones ──
  $("#subExportBtn")?.addEventListener("click", exportSuscripcionesCSV);
  $("#subSearch")?.addEventListener("input", renderSuscripciones);
  $("#subFilter")?.addEventListener("change", renderSuscripciones);

  // ── Email Marketing: actualizar badge al cambiar segmento/filtros ──
  $("#emailSegment")?.addEventListener("change", updateEmailCountBadge);
  $("#excludeConverted")?.addEventListener("change", updateEmailCountBadge);
  $("#filterCountry")?.addEventListener("change", updateEmailCountBadge);
  $("#filterTicket")?.addEventListener("input", updateEmailCountBadge);
  $("#filterCourse")?.addEventListener("change", updateEmailCountBadge);

  // ── Smart Course: botón Analizar ──
  $("#smartCourseAnalyzeBtn")?.addEventListener("click", () => {
    const selectVal  = $("#smartCourseSelect")?.value;       // del dropdown
    const searchText = $("#smartCourseSearch")?.value.trim(); // texto escrito

    if (selectVal) {
      // Curso conocido — análisis normal
      runSmartCourseAnalysis(selectVal);
      renderSmartCourseResults();
      toast(`🤖 Análisis listo — ${selectVal.slice(0, 40)}`, "success");
      return;
    }

    if (!searchText) { toast("⚠ Escribe o selecciona un curso", "warning"); return; }

    // Curso nuevo (no está en catálogo) — Modo Prospección
    const similar = _findSimilarCourses(searchText, 8);
    if (!similar.length) {
      toast("⚠ No encontré cursos similares en tu catálogo. Prueba con otras palabras.", "warning");
      return;
    }
    runSmartProspectionAnalysis(searchText, similar);
    renderSmartCourseResults();
    toast(`🔭 Modo Prospección: "${searchText.slice(0, 35)}" — usando ${similar.length} cursos similares`, "success");
  });

  // Re-renderizar tabla cuando cambia el modo (buyers/similar/both)
  document.querySelectorAll('input[name="smartMode"]').forEach(radio => {
    radio.addEventListener("change", () => {
      if (_smartState.selectedCourse) renderSmartCourseResults();
      updateEmailCountBadge();
    });
  });

  // ── Contador de caracteres del asunto ──
  $("#emailSubject")?.addEventListener("input", updateSubjectCharCount);

  // ── Modo HTML toggle ──
  $("#htmlModeToggle")?.addEventListener("click", () => {
    const body = $("#emailBody");
    if (!body) return;
    const isHtml = body.dataset.mode === "html";
    body.dataset.mode = isHtml ? "text" : "html";
    body.style.fontFamily = isHtml ? "" : "monospace";
    body.style.fontSize   = isHtml ? "" : "12px";
    $("#htmlModeToggle").textContent = isHtml ? "</> Modo HTML" : "📝 Modo texto";
  });

  // ── Botones de formato ──
  document.querySelectorAll(".fmt-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const fmt  = btn.dataset.fmt;
      const area = $("#emailBody");
      if (!area) return;
      const start = area.selectionStart, end = area.selectionEnd;
      const sel   = area.value.substring(start, end);
      let ins = sel;
      if (fmt === "bold")   ins = `<strong>${sel}</strong>`;
      if (fmt === "italic") ins = `<em>${sel}</em>`;
      if (fmt === "h2")     ins = `\n<h2>${sel}</h2>\n`;
      if (fmt === "hr")     ins = `\n<hr>\n`;
      if (fmt === "link") {
        const url = prompt("URL del enlace:");
        if (!url) return;
        ins = `<a href="${url}">${sel || url}</a>`;
      }
      area.value = area.value.substring(0, start) + ins + area.value.substring(end);
    });
  });

  // ── Test A/B toggle ──
  $("#enableAB")?.addEventListener("change", () => {
    const panel = $("#abPanel");
    if (panel) panel.style.display = $("#enableAB").checked ? "block" : "none";
  });

  // ── Plantillas ──
  $("#templateSaveBtn")?.addEventListener("click", () => {
    const name = prompt("Nombre de la plantilla:");
    if (!name?.trim()) return;
    saveTemplate(name.trim(), {
      subject:     $("#emailSubject")?.value     || "",
      body:        $("#emailBody")?.value        || "",
      headerImage: $("#emailHeaderImage")?.value || "",
      ctaText:     $("#ctaText")?.value          || "",
      ctaUrl:      $("#ctaUrl")?.value           || "",
    });
    toast(`💾 Plantilla "${name}" guardada`, "success");
  });
  $("#templateLoadBtn")?.addEventListener("click", () => {
    const name = $("#templateSelect")?.value;
    if (name) loadTemplate(name);
  });
  $("#templateDeleteBtn")?.addEventListener("click", () => {
    const name = $("#templateSelect")?.value;
    if (name && confirm(`¿Eliminar plantilla "${name}"?`)) deleteTemplate(name);
  });

  // ── Cerrar vista previa ──
  $("#closePreviewBtn")?.addEventListener("click", () => {
    const box = $("#emailPreviewBox");
    if (box) box.style.display = "none";
  });

  // ── Correo de prueba ──
  $("#testEmailSendBtn")?.addEventListener("click", sendTestEmail);

  // ══════════════════════════════════════════════════════
  // NUEVAS FEATURES EMAIL MARKETING
  // ══════════════════════════════════════════════════════

  // Spam badge en tiempo real
  $("#emailSubject")?.addEventListener("input", renderSpamBadge);
  $("#emailBody")?.addEventListener("input", renderSpamBadge);

  // Guardar imagen en galería
  $("#imgGallerySaveBtn")?.addEventListener("click", () => {
    const url = $("#emailHeaderImage")?.value.trim();
    if (url) saveImageToGallery(url);
    else toast("⚠ Escribe una URL de imagen primero", "warning");
  });
  // Mostrar galería al cargar
  renderImageGallery();

  // Texto plano
  $("#showPlainTextBtn")?.addEventListener("click", window.showPlainTextPreview);

  // Envío programado
  $("#scheduleSendBtn")?.addEventListener("click", scheduleSend);

  // Lista negra: abrir panel + agregar email
  $("#toggleBlacklistBtn")?.addEventListener("click", () => {
    const panel = $("#blacklistPanel");
    if (!panel) return;
    const open = panel.style.display !== "none";
    panel.style.display = open ? "none" : "block";
    if (!open) renderBlacklistPanel();
  });
  $("#blacklistAddBtn")?.addEventListener("click", () => {
    const input = $("#blacklistInput");
    const email = input?.value.trim();
    if (!email || !email.includes("@")) { toast("⚠ Ingresa un email válido", "warning"); return; }
    addToUnsubscribeList(email);
    if (input) input.value = "";
    renderBlacklistPanel();
    updateEmailCountBadge();
    toast(`🚫 "${email}" agregado a lista negra`, "success");
  });

  // Drip: guardar secuencia desde el builder
  $("#dripSaveBtn")?.addEventListener("click", () => {
    const name = prompt("Nombre de esta secuencia:");
    if (!name?.trim()) return;
    const steps = [];
    document.querySelectorAll(".drip-step").forEach(stepEl => {
      const sub = stepEl.querySelector(".drip-subject")?.value.trim() || "";
      const bod = stepEl.querySelector(".drip-body")?.value.trim()    || "";
      const del = parseInt(stepEl.querySelector(".drip-delay")?.value || "0", 10);
      if (sub || bod) steps.push({ subject: sub, body: bod, delayDays: del });
    });
    if (!steps.length) { toast("⚠ Define al menos un paso con asunto o mensaje", "warning"); return; }
    saveDripCampaign(name.trim(), steps);
  });

  // Drip: ejecutar directamente desde el builder
  $("#dripRunBtn")?.addEventListener("click", () => {
    const steps = [];
    document.querySelectorAll(".drip-step").forEach(stepEl => {
      const sub = stepEl.querySelector(".drip-subject")?.value.trim() || "";
      const bod = stepEl.querySelector(".drip-body")?.value.trim()    || "";
      const del = parseInt(stepEl.querySelector(".drip-delay")?.value || "0", 10);
      if (sub || bod) steps.push({ subject: sub, body: bod, delayDays: del });
    });
    if (!steps.length) { toast("⚠ Define al menos un paso", "warning"); return; }
    const tmpName = "_drip_run_" + Date.now();
    saveDripCampaign(tmpName, steps);
    runDripCampaign(tmpName);
  });
  renderDripPanel();

  // A/B diff
  $("#abDiffBtn")?.addEventListener("click", showABDiff);
  $("#emailSubjectB")?.addEventListener("input", showABDiff);

  // Nuevos filtros avanzados → actualizar badge
  $("#filterMinAmount")?.addEventListener("input", updateEmailCountBadge);
  $("#filterLastPurchaseDays")?.addEventListener("input", updateEmailCountBadge);
  $("#filterKanbanTag")?.addEventListener("change", updateEmailCountBadge);
  $("#filterMultiCountry")?.addEventListener("change", updateEmailCountBadge);
}

// =============================================================
// VIP PANEL — segmentacion visual elite en CRM
// =============================================================
function renderVIPPanel() {
  const grid    = document.getElementById("vipGrid");
  const badge   = document.getElementById("vipCountBadge");
  if (!grid) return;

  const allC = Object.values(customerMap(state.filtered));
  allC.sort((a, b) => b.revenue - a.revenue);
  const top10pct = Math.max(1, Math.ceil(allC.length * 0.1));
  const vips = allC.slice(0, top10pct);

  if (badge) badge.textContent = vips.length + " clientes";

  if (!vips.length) {
    grid.innerHTML = `<p style="color:var(--muted);font-size:13px">Sin datos de clientes VIP en el periodo.</p>`;
    return;
  }

  grid.innerHTML = vips.slice(0, 10).map((c, i) => {
    const initials = c.name.slice(0, 2).toUpperCase();
    const rfm = rfmScore(c, allC);
    return `<div class="vip-card" style="cursor:pointer" data-email="${esc(c.email || c.name)}">
      <div class="vip-rank">#${i + 1}</div>
      <div class="vip-avatar" style="background:hsl(${(i * 47) % 360},55%,32%)">${esc(initials)}</div>
      <div class="vip-info">
        <strong class="vip-name">${esc(c.name)}</strong>
        <span class="vip-email">${esc(c.email)}</span>
        <span class="rfm-badge ${rfm.cls}">${rfm.label}</span>
      </div>
      <div class="vip-revenue">
        <strong>${fmtMoney(c.revenue)}</strong>
        <span>${c.orders} pedido${c.orders !== 1 ? "s" : ""}</span>
      </div>
    </div>`;
  }).join("");

  grid.querySelectorAll(".vip-card").forEach(el => {
    el.addEventListener("click", () => openCustomerModal(el.dataset.email));
  });
}

// =============================================================
// STRIPE VIEW — panel con pedidos via Stripe
// =============================================================
function renderStripeView() {
  const search = ($("#stripeSearch")?.value || "").trim().toLowerCase();
  const stripeOrders = state.filtered.filter(o => {
    const pm = (o.payment_method || "").toLowerCase();
    return pm.includes("stripe") || pm.includes("card") || pm === "wc_stripe";
  });

  const filtered = search
    ? stripeOrders.filter(o =>
        (o.customer || "").toLowerCase().includes(search) ||
        (o.customer_email || "").toLowerCase().includes(search) ||
        (o.products || []).some(p => (p.name || "").toLowerCase().includes(search))
      )
    : stripeOrders;

  // KPIs
  const total  = filtered.reduce((s, o) => s + Number(o.total || 0), 0);
  const fees   = filtered.reduce((s, o) => s + (Number(o.total || 0) * 0.029 + 0.30), 0);
  const net    = total - fees;
  const count  = filtered.length;
  const avg    = count ? total / count : 0;

  const kpisEl = document.getElementById("stripeKpis");
  if (kpisEl) kpisEl.innerHTML = [
    { label: "Ingresos brutos", val: fmtMoney(total), cls: "" },
    { label: "Comisiones est. (2.9%+0.30)", val: fmtMoney(fees), cls: "style=\"color:var(--bad)\"" },
    { label: "Ingresos netos est.", val: fmtMoney(net), cls: "style=\"color:var(--good)\"" },
    { label: "Transacciones", val: count, cls: "" },
    { label: "Ticket promedio", val: fmtMoney(avg), cls: "" }
  ].map(k => `<div class="kpi-card"><p class="kpi-label">${k.label}</p><p class="kpi-val" ${k.cls}>${k.val}</p></div>`).join("");

  // Transacciones individuales con curso (ordenadas por fecha desc)
  const dayBarsEl = document.getElementById("stripeDayBars");
  if (dayBarsEl) {
    const txns = [...filtered].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 50);
    const maxTxn = Math.max(...txns.map(o => Number(o.total || 0)), 1);
    dayBarsEl.innerHTML = txns.map(o => {
      const day  = new Date(o.date).toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
      const course = (o.products || [])[0]?.name || o.products?.[0] || "Producto";
      const val  = Number(o.total || 0);
      const pct  = (val / maxTxn * 100).toFixed(1);
      return `<div class="stripe-txn-row">
        <div class="stripe-txn-meta">
          <span class="stripe-txn-date">${day}</span>
          <span class="stripe-txn-course">${esc(course)}</span>
        </div>
        <div class="pb-track" style="flex:1;min-width:60px"><div class="pb-fill" style="width:${pct}%;background:linear-gradient(90deg,#6366f1,#818cf8)"></div></div>
        <span class="pb-val">${fmtMoney(val)}</span>
      </div>`;
    }).join("") || `<p style="color:var(--muted);font-size:13px;padding:8px 0">Sin ventas v&#xED;a Stripe en el periodo.</p>`;
  }

  // Top productos
  const byProduct = {};
  filtered.forEach(o => {
    (o.products || []).forEach(p => {
      const name = p.name || "Producto";
      byProduct[name] = (byProduct[name] || 0) + Number(p.total || p.subtotal || 0);
    });
  });
  const productEntries = Object.entries(byProduct).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const maxProd = Math.max(...productEntries.map(e => e[1]), 1);
  const prodBadge = document.getElementById("stripeProductsBadge");
  if (prodBadge) prodBadge.textContent = productEntries.length + " cursos";
  const prodEl = document.getElementById("stripeProductBars");
  if (prodEl) {
    prodEl.innerHTML = productEntries.map(([name, v]) =>
      `<div class="pb-row pb-wide">
        <span class="pb-label">${esc(name)}</span>
        <div class="pb-track" style="min-width:80px"><div class="pb-fill" style="width:${(v/maxProd*100).toFixed(1)}%;background:linear-gradient(90deg,#6366f1,#818cf8)"></div></div>
        <span class="pb-val">${fmtMoney(v)}</span>
      </div>`
    ).join("") || `<p style="color:var(--muted);font-size:13px">Sin productos.</p>`;
  }

  // Tabla transacciones
  const txnCount = document.getElementById("stripeTxnCount");
  if (txnCount) txnCount.textContent = filtered.length + " transacciones";
  const tbody = document.getElementById("stripeTxnBody");
  if (tbody) {
    const rows = filtered.slice(0, 200);
    tbody.innerHTML = rows.map(o => {
      const gross = Number(o.total || 0);
      const fee   = gross * 0.029 + 0.30;
      const net_  = gross - fee;
      const prod  = (o.products || [])[0]?.name || "—";
      return `<tr>
        <td>${fmtDate(o.date)}</td>
        <td>#${esc(String(o.number || o.id))}</td>
        <td>${esc(o.customer || "—")}</td>
        <td>${esc(o.country || o.country_code || "—")}</td>
        <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(prod)}</td>
        <td class="text-right">${fmtMoney(gross)}</td>
        <td class="text-right" style="color:var(--bad)">-${fmtMoney(fee)}</td>
        <td class="text-right" style="color:var(--good)">${fmtMoney(net_)}</td>
      </tr>`;
    }).join("") || `<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:20px">Sin transacciones Stripe en el periodo.</td></tr>`;
  }
}

// =============================================================
// SUSCRIPCIONES — clientes recurrentes WooCommerce
// =============================================================
function buildRecurringCustomers() {
  const customers = customerMap(state.orders);
  const now = new Date();
  return Object.values(customers)
    .filter(c => c.orders >= 2)
    .map(c => {
      const lastDate = new Date(c.last);
      const daysSince = Math.floor((now - lastDate) / 86400000);
      const avgInterval = c.orders > 1 ? Math.floor(daysSince / (c.orders - 1)) : 0;
      let status = "active";
      if (daysSince > 180) status = "churned";
      else if (daysSince > 60) status = "atrisk";
      return { ...c, daysSince, avgInterval, status };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

function renderSuscripciones() {
  const search    = ($("#subSearch")?.value || "").trim().toLowerCase();
  const filterVal = $("#subFilter")?.value || "all";

  let recurring = buildRecurringCustomers();
  if (filterVal !== "all") recurring = recurring.filter(c => c.status === filterVal);
  if (search) recurring = recurring.filter(c =>
    c.name.toLowerCase().includes(search) || c.email.toLowerCase().includes(search)
  );

  const all = buildRecurringCustomers();
  const active  = all.filter(c => c.status === "active").length;
  const atrisk  = all.filter(c => c.status === "atrisk").length;
  const churned = all.filter(c => c.status === "churned").length;
  const totalMrr = all.filter(c => c.status === "active")
    .reduce((s, c) => s + (c.revenue / Math.max(c.orders, 1)), 0);

  const badge = document.getElementById("subCountBadge");
  if (badge) badge.textContent = recurring.length + " clientes";

  const kpisEl = document.getElementById("subKpis");
  if (kpisEl) kpisEl.innerHTML = [
    { label: "MRR estimado", val: fmtMoney(totalMrr), cls: "style=\"color:var(--good)\"" },
    { label: "Activos (&#xFA;lt. 60d)", val: active, cls: "" },
    { label: "En riesgo (61&#x2013;180d)", val: atrisk, cls: "style=\"color:#f59e0b\"" },
    { label: "Perdidos (+180d)", val: churned, cls: "style=\"color:var(--bad)\"" },
    { label: "Total recurrentes", val: all.length, cls: "" }
  ].map(k => `<div class="kpi-card"><p class="kpi-label">${k.label}</p><p class="kpi-val" ${k.cls}>${k.val}</p></div>`).join("");

  const mrrBadge = document.getElementById("subMrrBadge");
  if (mrrBadge) mrrBadge.textContent = fmtMoney(totalMrr) + "/mes";

  const mrrByMonth = {};
  all.filter(c => c.status === "active").forEach(c => {
    const m = new Date(c.last).toLocaleDateString("es-PE", { month: "short", year: "2-digit" });
    mrrByMonth[m] = (mrrByMonth[m] || 0) + c.revenue / Math.max(c.orders, 1);
  });
  const mrrEntries = Object.entries(mrrByMonth).slice(-12);
  const maxMrr = Math.max(...mrrEntries.map(e => e[1]), 1);
  const mrrEl = document.getElementById("subMrrBars");
  if (mrrEl) {
    mrrEl.innerHTML = mrrEntries.map(([m, v]) =>
      `<div class="pb-row">
        <span class="pb-label">${m}</span>
        <div class="pb-track"><div class="pb-fill" style="width:${(v/maxMrr*100).toFixed(1)}%;background:linear-gradient(90deg,#22c55e,#4ade80)"></div></div>
        <span class="pb-val">${fmtMoney(v)}</span>
      </div>`
    ).join("") || `<p style="color:var(--muted);font-size:13px">Sin datos MRR.</p>`;
  }

  const listEl = document.getElementById("subList");
  if (listEl) {
    const statusColor = { active: "var(--good)", atrisk: "#f59e0b", churned: "var(--bad)" };
    const statusLabel = { active: "Activo", atrisk: "En riesgo", churned: "Perdido" };
    listEl.innerHTML = recurring.slice(0, 100).map((c, i) => {
      const initials = c.name.slice(0, 2).toUpperCase();
      return `<div class="customer" data-email="${esc(c.email || c.name)}" style="cursor:pointer">
        <div class="avatar" style="min-width:36px;font-size:13px;background:hsl(${(i*47)%360},50%,32%)">${esc(initials)}</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <h3 style="margin:0">${esc(c.name)}</h3>
            <span class="badge" style="background:${statusColor[c.status]}20;color:${statusColor[c.status]};border:1px solid ${statusColor[c.status]}40">${statusLabel[c.status]}</span>
          </div>
          <p style="margin:2px 0;font-size:12px;color:var(--muted)">${esc(c.email)} &middot; ${c.orders} pedidos &middot; intervalo ~${c.avgInterval}d</p>
          <p style="margin:2px 0;font-size:12px;color:var(--muted)">&#xDA;ltima compra: ${c.daysSince}d atr&#xE1;s</p>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <strong style="display:block;font-size:15px">${fmtMoney(c.revenue)}</strong>
          <span style="font-size:11px;color:var(--muted)">~${fmtMoney(c.revenue/Math.max(c.orders,1))}/compra</span>
        </div>
      </div>`;
    }).join("") || `<p style="color:var(--muted);font-size:13px;padding:12px 0">Sin clientes recurrentes en el filtro seleccionado.</p>`;

    listEl.querySelectorAll(".customer").forEach(el => {
      el.addEventListener("click", () => openCustomerModal(el.dataset.email));
    });
  }

  const byCourse = {};
  all.forEach(c => {
    c.courses.forEach(course => {
      byCourse[course] = (byCourse[course] || 0) + 1;
    });
  });
  const courseEntries = Object.entries(byCourse).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const maxCourse = Math.max(...courseEntries.map(e => e[1]), 1);
  const courseEl = document.getElementById("subCourseBars");
  if (courseEl) {
    courseEl.innerHTML = courseEntries.map(([name, v]) =>
      `<div class="pb-row pb-wide">
        <span class="pb-label">${esc(name)}</span>
        <div class="pb-track" style="min-width:80px"><div class="pb-fill" style="width:${(v/maxCourse*100).toFixed(1)}%;background:linear-gradient(90deg,#22c55e,#4ade80)"></div></div>
        <span class="pb-val">${v} clientes</span>
      </div>`
    ).join("") || `<p style="color:var(--muted);font-size:13px">Sin datos.</p>`;
  }
}

function exportSuscripcionesCSV() {
  const rows = buildRecurringCustomers();
  const header = ["Nombre", "Email", "Pedidos", "Revenue Total", "Ultima Compra", "Dias desde ultima compra", "Estado"].join(",");
  const body = rows.map(c => [
    `"${c.name}"`, `"${c.email}"`, c.orders, c.revenue.toFixed(2),
    new Date(c.last).toLocaleDateString("es-PE"), c.daysSince,
    c.status === "active" ? "Activo" : c.status === "atrisk" ? "En riesgo" : "Perdido"
  ].join(","));
  const csv = [header, ...body].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "suscripciones_crm.csv" });
  a.click(); URL.revokeObjectURL(a.href);
}

// =============================================================
// CONVERSION POR PAIS
// =============================================================
function renderConversionByCountry() {
  const el = document.getElementById("conversionByCountry");
  const badge = document.getElementById("conversionBadge");
  if (!el) return;

  const byCountry = {};
  state.filtered.forEach(o => {
    const country = o.country || o.country_code || "Desconocido";
    if (!byCountry[country]) byCountry[country] = { total: 0, completed: 0 };
    byCountry[country].total++;
    if (["completed", "processing"].includes(statusNorm(o.status))) {
      byCountry[country].completed++;
    }
  });

  const entries = Object.entries(byCountry)
    .filter(([, v]) => v.total >= 2)
    .map(([country, v]) => ({
      country,
      total: v.total,
      completed: v.completed,
      rate: v.total > 0 ? (v.completed / v.total) * 100 : 0
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 20);

  if (badge) badge.textContent = entries.length + " paises";

  if (!entries.length) {
    el.innerHTML = `<p style="color:var(--muted);font-size:13px">Sin datos suficientes.</p>`;
    return;
  }

  el.innerHTML = `<div class="conv-table">
    <div class="conv-header">
      <span>Pais</span><span style="text-align:right">Pedidos</span>
      <span style="text-align:right">Completados</span><span>Conversion</span>
    </div>
    ${entries.map(e => {
      const color = e.rate >= 75 ? "var(--good)" : e.rate >= 50 ? "#f59e0b" : "var(--bad)";
      return `<div class="conv-row">
        <span class="conv-country">${esc(e.country)}</span>
        <span class="conv-num">${e.total}</span>
        <span class="conv-num">${e.completed}</span>
        <div class="conv-rate-cell">
          <div class="conv-bar-track">
            <div class="conv-bar-fill" style="width:${e.rate.toFixed(1)}%;background:${color}"></div>
          </div>
          <span class="conv-pct" style="color:${color}">${e.rate.toFixed(1)}%</span>
        </div>
      </div>`;
    }).join("")}
  </div>`;
}

// =============================================================
// META MENSUAL — barra de progreso en sidebar
// =============================================================
function loadMonthlyGoal() {
  try { return parseFloat(localStorage.getItem("crm_monthly_goal") || "0") || 0; } catch(e) { return 0; }
}
function saveMonthlyGoal(val) {
  try { localStorage.setItem("crm_monthly_goal", String(val)); } catch(e) {}
}
function updateGoalBar() {
  const goal = loadMonthlyGoal();
  const now  = new Date();
  const thisMonthOrders = state.orders.filter(o => {
    const d = new Date(o.date);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
  const current = thisMonthOrders
    .filter(o => ["completed", "processing"].includes(statusNorm(o.status)))
    .reduce((s, o) => s + Number(o.total || 0), 0);
  const pct = goal > 0 ? Math.min(100, (current / goal) * 100) : 0;

  const goalBar     = document.getElementById("goalBar");
  const goalPct     = document.getElementById("goalPct");
  const goalCurrent = document.getElementById("goalCurrent");
  const goalTarget  = document.getElementById("goalTarget");
  const goalInput   = document.getElementById("goalInput");

  if (goalBar)     goalBar.style.width = pct.toFixed(1) + "%";
  if (goalPct)     goalPct.textContent = pct.toFixed(0) + "%";
  if (goalCurrent) goalCurrent.textContent = fmtMoney(current);
  if (goalTarget)  goalTarget.textContent  = goal > 0 ? "de " + fmtMoney(goal) : "Sin meta";
  if (goalInput && goal > 0) goalInput.value = goal;
  if (goalBar) {
    goalBar.style.background = pct >= 100 ? "var(--good)" : pct >= 70 ? "#f59e0b" : "var(--accent)";
  }
}

// =============================================================
// MODAL DETALLE DE PEDIDO
// =============================================================
function openOrderModal(orderId) {
  const o = state.filtered.find(x => String(x.id) === String(orderId));
  if (!o) return;
  const modal = document.getElementById("orderModal");
  if (!modal) return;

  const titleEl = document.getElementById("orderModalTitle");
  const contentEl = document.getElementById("orderModalContent");
  if (titleEl) titleEl.textContent = "#" + (o.number || o.id);

  const products = (o.products || []).map(p =>
    `<div class="om-product">
      <span class="om-product-name">${esc(p.name || "Producto")}</span>
      <span class="om-product-qty">x${p.quantity || 1}</span>
      <strong class="om-product-price">${fmtMoney(p.total || p.subtotal || 0)}</strong>
    </div>`
  ).join("") || `<p style="color:var(--muted);font-size:13px">Sin detalle de productos.</p>`;

  if (contentEl) contentEl.innerHTML = `
    <div class="om-grid">
      <div class="om-field"><span>Fecha</span><strong>${fmtDate(o.date)}</strong></div>
      <div class="om-field"><span>Estado</span><strong><span class="status ${statusNorm(o.status)}">${esc(statusNorm(o.status))}</span></strong></div>
      <div class="om-field"><span>Cliente</span><strong>${esc(o.customer || "Sin nombre")}</strong></div>
      <div class="om-field"><span>Email</span><strong>${esc(o.customer_email || "&#x2014;")}</strong></div>
      <div class="om-field"><span>Pais</span><strong>${esc(o.country || o.country_code || "&#x2014;")}</strong></div>
      <div class="om-field"><span>Ciudad</span><strong>${esc(o.city || "&#x2014;")}</strong></div>
      <div class="om-field"><span>Pago</span><strong>${esc(o.payment_method || "&#x2014;")}</strong></div>
      <div class="om-field"><span>Numero</span><strong>#${esc(String(o.number || o.id))}</strong></div>
    </div>
    <h4 style="margin:16px 0 8px;font-size:14px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;font-size:11px">Productos</h4>
    ${products}
    <div class="om-total">
      <span>Total del pedido</span>
      <strong>${fmtMoney(o.total)}</strong>
    </div>
    <div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap">
      <button class="chip" onclick="openCustomerModal('${esc(o.customer_email || o.customer || "")}');closeOrderModal()">
        Ver perfil del cliente
      </button>
    </div>`;

  modal.classList.remove("hidden");
  logActivity("Pedido #" + (o.number || o.id) + " abierto — " + esc(o.customer || "cliente"));

  const noteKey = "crm_order_note_" + o.id;
  const notesEl = document.getElementById("orderModalNotes");
  if (notesEl) {
    notesEl.value = "";
    try { notesEl.value = localStorage.getItem(noteKey) || ""; } catch(e) {}
    notesEl.dataset.noteKey = noteKey;
  }
  const savedEl = document.getElementById("orderModalNoteSaved");
  if (savedEl) savedEl.style.display = "none";
}

function closeOrderModal() {
  document.getElementById("orderModal")?.classList.add("hidden");
}

// =============================================================
// LOG DE ACTIVIDAD
// =============================================================
function logActivity(msg) {
  try {
    const log = JSON.parse(localStorage.getItem("crm_activity_log") || "[]");
    log.unshift({ msg: String(msg), time: new Date().toISOString() });
    localStorage.setItem("crm_activity_log", JSON.stringify(log.slice(0, 100)));
  } catch(e) {}
}

function renderActivityLog() {
  const box = document.getElementById("activityLog");
  if (!box) return;
  try {
    const log = JSON.parse(localStorage.getItem("crm_activity_log") || "[]");
    if (!log.length) {
      box.innerHTML = `<p style="color:var(--muted);font-size:13px;padding:8px 0">Sin actividad registrada aun.</p>`;
      return;
    }
    box.innerHTML = log.slice(0, 30).map(e => {
      const d = new Date(e.time);
      const time = d.toLocaleDateString("es-PE", { day: "2-digit", month: "short" }) +
                   " " + d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
      return `<div class="activity-item">
        <span class="activity-time">${esc(time)}</span>
        <span class="activity-msg">${esc(e.msg)}</span>
      </div>`;
    }).join("");
  } catch(e) {
    box.innerHTML = `<p style="color:var(--muted);font-size:13px">Error leyendo log.</p>`;
  }
}

// =============================================================
// PREDICCION DE INGRESOS — mes actual (proyeccion lineal)
// =============================================================
function renderRevenuePrediction() {
  const el = document.getElementById("revenuePrediction");
  if (!el) return;
  const now        = new Date();
  const month      = now.getMonth();
  const year       = now.getFullYear();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const thisMonthOrders = state.orders.filter(o => {
    const d = new Date(o.date);
    return d.getFullYear() === year && d.getMonth() === month;
  });
  const current = thisMonthOrders
    .filter(o => ["completed", "processing"].includes(statusNorm(o.status)))
    .reduce((s, o) => s + Number(o.total || 0), 0);

  const dailyRate = dayOfMonth > 0 ? current / dayOfMonth : 0;
  const projected = dailyRate * daysInMonth;
  const remaining = Math.max(0, projected - current);
  const pctMonth  = Math.round(dayOfMonth / daysInMonth * 100);

  const goal    = loadMonthlyGoal();
  const goalPct = goal > 0 ? Math.min(100, (projected / goal) * 100) : 0;
  const goalMsg = goal > 0
    ? `<div class="pred-card" style="--pred-accent:${goalPct >= 100 ? "var(--good)" : goalPct >= 70 ? "#f59e0b" : "var(--accent)"}">
        <small>Proyeccion vs meta</small>
        <strong style="color:var(--pred-accent)">${goalPct.toFixed(0)}% de la meta</strong>
      </div>`
    : "";

  el.innerHTML = `
    <div class="pred-grid">
      <div class="pred-card">
        <small>Acumulado este mes</small>
        <strong>${fmtMoney(current)}</strong>
        <span class="pred-sub">Dias ${dayOfMonth} de ${daysInMonth} (${pctMonth}%)</span>
      </div>
      <div class="pred-card" style="--pred-accent:var(--good)">
        <small>Proyeccion al cierre</small>
        <strong style="color:var(--pred-accent)">${fmtMoney(projected)}</strong>
        <span class="pred-sub">Ritmo: ${fmtMoney(dailyRate)}/dia</span>
      </div>
      <div class="pred-card">
        <small>Pendiente por generar</small>
        <strong style="color:#f59e0b">${fmtMoney(remaining)}</strong>
        <span class="pred-sub">En los ${daysInMonth - dayOfMonth} dias restantes</span>
      </div>
      ${goalMsg}
    </div>`;
}

// =============================================================
// CALENDARIO HEATMAP DE VENTAS — ultimas 12 semanas
// =============================================================
function renderSalesHeatmap() {
  const el = document.getElementById("salesHeatmapCalendar");
  if (!el) return;

  const byDay = {};
  state.filtered.forEach(o => {
    const d = String(o.date).slice(0, 10);
    byDay[d] = (byDay[d] || 0) + Number(o.total || 0);
  });

  const today = new Date();
  const days  = [];
  for (let i = 83; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ key, val: byDay[key] || 0, dow: d.getDay(), label: d.toLocaleDateString("es-PE", { day: "2-digit", month: "short" }) });
  }

  const maxVal = Math.max(...days.map(d => d.val), 1);
  const colorFor = v => {
    if (!v) return "rgba(255,255,255,.06)";
    const t = Math.sqrt(v / maxVal);
    const r = Math.round(80  + t * 159);
    const g = Math.round(0   + t * 35);
    const b = Math.round(20  + t * 10);
    return `rgba(${r},${g},${b},${(0.35 + t * 0.65).toFixed(2)})`;
  };

  const weeks = [];
  let week    = [];
  days.forEach((d, i) => {
    if (i === 0 && d.dow !== 0) {
      for (let j = 0; j < d.dow; j++) week.push(null);
    }
    week.push(d);
    if (week.length === 7) { weeks.push(week); week = []; }
  });
  if (week.length) weeks.push(week);

  const DOW = ["D", "L", "M", "X", "J", "V", "S"];
  const dowLabels = DOW.map(l => `<div class="hm-dow">${l}</div>`).join("");
  const cols = weeks.map(w => {
    const cells = w.map(d => d
      ? `<div class="hm-cell" style="background:${colorFor(d.val)}" title="${d.key}: ${d.val > 0 ? fmtMoney(d.val) : "Sin ventas"}"></div>`
      : `<div class="hm-cell hm-empty"></div>`
    ).join("");
    return `<div class="hm-col">${cells}</div>`;
  }).join("");

  const legendStops = [0.1, 0.3, 0.5, 0.7, 1].map(t => {
    const r = Math.round(80 + t * 159), g = Math.round(t * 35), b = Math.round(20 + t * 10);
    return `<div style="width:14px;height:14px;border-radius:3px;background:rgba(${r},${g},${b},${(0.35 + t * 0.65).toFixed(2)});flex-shrink:0"></div>`;
  }).join("");

  el.innerHTML = `
    <div class="hm-wrap">
      <div class="hm-days">${dowLabels}</div>
      <div class="hm-grid">${cols}</div>
    </div>
    <div class="hm-legend">
      <span style="color:var(--muted);font-size:11px">Menos</span>
      ${legendStops}
      <span style="color:var(--muted);font-size:11px">Mas ventas</span>
    </div>`;
}

// =============================================================
// MODO MIDNIGHT — tema azul profundo
// =============================================================
function toggleMidnightMode() {
  const app = document.querySelector(".app");
  if (!app) return;
  const on = app.classList.toggle("midnight-mode");
  try { localStorage.setItem("crm_midnight", on ? "1" : "0"); } catch(e) {}
  const btn = document.getElementById("midnightToggle");
  if (btn) btn.textContent = on ? "🌙 Midnight ON" : "🌌 Midnight";
}

// Restaurar modo midnight al cargar
(function restoreMidnight() {
  // Midnight mode desactivado — limpiar estado guardado
  try { localStorage.removeItem("crm_midnight"); } catch(e) {}
})();

// =============================================================
// BREVO EMAIL MARKETING
// =============================================================
// =============================================================
// BREVO EMAIL MARKETING
// =============================================================
async function sendTestEmail() {
  const toEmail  = $("#testEmailTo")?.value.trim();
  const toName   = $("#testEmailName")?.value.trim() || "Test";
  const subject  = $("#testEmailSubject")?.value.trim() || "Test CRM Dashboard";
  const body     = $("#testEmailBody")?.value.trim();
  const btn      = $("#testEmailSendBtn");
  const result   = $("#testEmailResult");
  const statusEl = $("#testEmailStatus");

  if (!toEmail) { toast("⚠ Escribe el email destinatario", "warning"); return; }
  if (!subject) { toast("⚠ Escribe el asunto", "warning"); return; }

  if (btn) { btn.disabled = true; btn.textContent = "⏳ Enviando..."; }
  if (result) { result.style.display = "none"; }

  try {
    let res, data;
    if (CONFIG.mode === "api") {
      res = await fetch(`${CONFIG.apiBaseUrl}/brevo/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CPP-CRM-Dashboard-Token": CONFIG.apiToken
        },
        body: JSON.stringify({
          to_email:     toEmail,
          to_name:      toName,
          subject:      subject,
          html_content: body.replace(/\n/g, "<br>")
        })
      });
      data = await res.json();
    } else {
      const b = JSON.parse(localStorage.getItem("crm_brevo") || "null");
      if (!b?.key) { toast("⚠ Configura tu API Key de Brevo primero", "warning"); return; }
      res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "Content-Type": "application/json", "api-key": b.key },
        body: JSON.stringify({
          sender:      { name: b.name || "CRM", email: b.email },
          to:          [{ email: toEmail, name: toName }],
          subject:     subject,
          htmlContent: body.replace(/\n/g, "<br>")
        })
      });
      data = await res.json();
    }

    if (res.ok && (data.success || data.messageId)) {
      if (result) {
        result.style.display = "inline";
        result.style.color   = "var(--good)";
        result.textContent   = "✅ Correo enviado correctamente a " + toEmail;
      }
      if (statusEl) statusEl.textContent = "✅ Último envío OK";
      toast("✅ Correo de prueba enviado a " + toEmail, "success");
    } else {
      const msg = data.message || data.error || res.status;
      if (result) {
        result.style.display = "inline";
        result.style.color   = "var(--bad)";
        result.textContent   = "❌ Error: " + msg;
      }
      if (statusEl) statusEl.textContent = "❌ Error en último envío";
      toast("❌ Error al enviar: " + msg, "error");
    }
  } catch(e) {
    if (result) {
      result.style.display = "inline";
      result.style.color   = "var(--bad)";
      result.textContent   = "❌ Error de red: " + e.message;
    }
    toast("❌ Error de red: " + e.message, "error");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "🚀 Enviar correo de prueba"; }
  }
}

function saveBrevoConfig() {
  const key   = $("#brevoApiKey")?.value.trim()   || "";
  const name  = $("#brevoSenderName")?.value.trim() || "";
  const email = $("#brevoSenderEmail")?.value.trim() || "";
  localStorage.setItem("crm_brevo", JSON.stringify({ key, name, email }));
  const msg = $("#brevoSavedMsg");
  if (msg) { msg.style.display = "inline"; setTimeout(() => msg.style.display = "none", 2000); }
  updateBrevoStatus();
  toast("Configuración de Brevo guardada", "success");
}

function restoreBrevoConfig() {
  try {
    const b = JSON.parse(localStorage.getItem("crm_brevo") || "null");
    if (!b) { updateBrevoStatus(); return; }
    if ($("#brevoApiKey"))    $("#brevoApiKey").value    = b.key   || "";
    if ($("#brevoSenderName")) $("#brevoSenderName").value = b.name  || "";
    if ($("#brevoSenderEmail")) $("#brevoSenderEmail").value = b.email || "";
    updateBrevoStatus();
  } catch(e) {}
}

function updateBrevoStatus() {
  const lbl = $("#brevoStatusLabel");
  if (!lbl) return;
  if (CONFIG.mode === "api") {
    lbl.style.color = "var(--good)";
    lbl.textContent = "✅ Usando proxy seguro de WordPress (clave en servidor)";
  } else {
    try {
      const b = JSON.parse(localStorage.getItem("crm_brevo") || "null");
      if (b?.key) {
        lbl.style.color = "var(--good)";
        lbl.textContent = "✅ API Key configurada (modo demo)";
      } else {
        lbl.style.color = "var(--muted)";
        lbl.textContent = "No configurado — haz clic en ⚙ Configurar";
      }
    } catch(e) {}
  }
}

async function testBrevoConnection() {
  const btn = $("#brevoTestBtn");
  if (btn) btn.disabled = true;
  try {
    if (CONFIG.mode === "api") {
      const res = await fetch(`${CONFIG.apiBaseUrl}/brevo/test`, {
        headers: { "X-CPP-CRM-Dashboard-Token": CONFIG.apiToken }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const left  = data.creditsLeft  ?? "?";
        const total = data.credits      ?? "?";
        const used  = data.creditsUsed  ?? "?";
        const quota = $("#brevoQuotaBar");
        if (quota) quota.textContent = `📩 Cuota Brevo: ${used} enviados / ${total} — disponibles: ${left}`;
        toast(`✅ Brevo OK — ${data.account || "conectado"} | ${left} créditos disponibles`, "success");
      } else {
        toast(`❌ Error: ${data.message || res.status}`, "error");
      }
    } else {
      const b = JSON.parse(localStorage.getItem("crm_brevo") || "null");
      if (!b?.key) { toast("⚠ Configura tu API Key primero", "warning"); return; }
      const res = await fetch("https://api.brevo.com/v3/account", {
        headers: { "api-key": b.key }
      });
      const data = await res.json();
      if (res.ok) toast(`✅ Brevo OK — ${data.email || "cuenta verificada"}`, "success");
      else toast(`❌ Error Brevo: ${data.message || res.status}`, "error");
    }
  } catch(e) {
    toast(`❌ Error de conexión: ${e.message}`, "error");
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ── Construye el HTML completo del email ──────────────────────────
function buildEmailHtml({ name, bodyText, headerImage, ctaText, ctaUrl, includeFooter, extraVars = {} }) {
  const _fechaDef = new Date().toLocaleDateString("es-MX", { day:"numeric", month:"long", year:"numeric" });
  const bodyHtml = bodyText
    .replace(/\{nombre\}/gi, name).replace(/\{name\}/gi, name)
    .replace(/\{curso\}/gi,  extraVars.curso  ?? "")
    .replace(/\{fecha\}/gi,  extraVars.fecha  ?? _fechaDef)
    .replace(/\{monto\}/gi,  extraVars.monto  ?? "")
    .replace(/\n/g, "<br>");
  const imgBlock = headerImage
    ? `<img src="${headerImage}" alt="Banner" style="width:100%;max-height:280px;object-fit:cover;display:block;border-radius:8px 8px 0 0;">`
    : "";
  const ctaBlock = (ctaText && ctaUrl)
    ? `<div style="text-align:center;margin:24px 0"><a href="${ctaUrl}" style="background:#0092ff;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:16px;font-weight:700">${ctaText}</a></div>`
    : "";
  const unsub = getUnsubscribeLink(name);
  const footerBlock = includeFooter
    ? `<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center">
        Cursospirataspro.com · Todos los derechos reservados.<br>
        <a href="${unsub}" style="color:#9ca3af">Dar de baja</a> de esta lista de correos.
       </div>`
    : "";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 16px">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
<tr><td>${imgBlock}</td></tr>
<tr><td style="padding:32px 36px;font-size:15px;color:#1f2937;line-height:1.65">${bodyHtml}${ctaBlock}${footerBlock}</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

// ── Enlace de baja (se registra en lista local) ───────────────────
function getUnsubscribeLink(name) {
  return `https://cursospirataspro.com/baja?ref=${encodeURIComponent(name)}`;
}

// ── Lista de bajas (localStorage) ────────────────────────────────
function getUnsubscribeList() {
  try { return JSON.parse(localStorage.getItem("crm_unsubscribe") || "[]"); } catch(e) { return []; }
}
function addToUnsubscribeList(email) {
  const list = getUnsubscribeList();
  if (!list.includes(email)) {
    list.push(email);
    localStorage.setItem("crm_unsubscribe", JSON.stringify(list));
  }
}

// ── Envío principal via Brevo ─────────────────────────────────────
async function sendViaBrevo() {
  const segment      = $("#emailSegment")?.value || "all";
  const subject      = $("#emailSubject")?.value.trim();
  const subjectB     = $("#emailSubjectB")?.value.trim();
  const bodyText     = $("#emailBody")?.value.trim();
  const headerImage  = $("#emailHeaderImage")?.value.trim();
  const ctaText      = $("#ctaText")?.value.trim();
  const ctaUrl       = $("#ctaUrl")?.value.trim();
  const includeFooter= $("#includeFooter")?.checked ?? true;
  const delayMs      = parseInt($("#sendDelay")?.value || "400", 10) || 400;
  const enableAB     = $("#enableAB")?.checked && subjectB;
  const excludeConv  = $("#excludeConverted")?.checked ?? false;

  if (!subject || !bodyText) { toast("⚠ Escribe el asunto y el cuerpo del mensaje", "warning"); return; }

  const recipients = getEmailRecipients(segment, excludeConv).filter(r => !getUnsubscribeList().includes(r.email));
  if (!recipients.length) { toast("⚠ No hay destinatarios para este segmento", "warning"); return; }

  const progressWrap = $("#brevoProgressWrap");
  const progressBar  = $("#brevoProgressBar");
  const progressPct  = $("#brevoProgressPct");
  const progressLog  = $("#brevoProgressLog");
  const progressLbl  = $("#brevoProgressLabel");
  if (progressWrap) progressWrap.style.display = "block";
  if (progressLog)  progressLog.innerHTML = "";

  let sent = 0, failed = 0;
  const total = recipients.length;

  // Variables dinámicas {curso} {fecha} {monto} personalizadas por destinatario
  const _crmByEmail = {};
  Object.values(customerMap(state.filtered)).forEach(c => { if (c.email) _crmByEmail[c.email] = c; });
  const _varCurso = _smartState.selectedCourse || $("#filterCourse")?.value || "";
  const _varFecha = new Date().toLocaleDateString("es-MX", { day:"numeric", month:"long", year:"numeric" });

  for (let i = 0; i < recipients.length; i++) {
    const r = recipients[i];
    // A/B: alternar asunto
    const chosenSubject = enableAB && i % 2 === 1 ? subjectB : subject;
    const personalSubject = chosenSubject.replace(/\{nombre\}/gi, r.name).replace(/\{name\}/gi, r.name);
    const _crmC     = _crmByEmail[r.email] || {};
    const _extraVars = { curso: _varCurso, fecha: _varFecha, monto: _crmC.revenue ? `$${Number(_crmC.revenue).toFixed(2)}` : "" };
    const htmlContent = buildEmailHtml({ name: r.name, bodyText, headerImage, ctaText, ctaUrl, includeFooter, extraVars: _extraVars });
    try {
      let res, data;
      if (CONFIG.mode === "api") {
        res  = await fetch(`${CONFIG.apiBaseUrl}/brevo/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-CPP-CRM-Dashboard-Token": CONFIG.apiToken },
          body: JSON.stringify({ to_email: r.email, to_name: r.name, subject: personalSubject, html_content: htmlContent })
        });
        data = await res.json();
      } else {
        const b = JSON.parse(localStorage.getItem("crm_brevo") || "null");
        if (!b?.key) { toast("⚠ Configura tu API Key de Brevo primero", "warning"); break; }
        res  = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: { "Content-Type": "application/json", "api-key": b.key },
          body: JSON.stringify({ sender: { name: b.name, email: b.email }, to: [{ email: r.email, name: r.name }], subject: personalSubject, htmlContent })
        });
        data = await res.json();
      }
      if (res.ok) { sent++; if (progressLog) progressLog.innerHTML += `<div>✅ ${esc(r.email)}</div>`; }
      else        { failed++; if (progressLog) progressLog.innerHTML += `<div style="color:var(--danger)">❌ ${esc(r.email)} — ${esc(data.message||res.status)}</div>`; }
    } catch(e) {
      failed++;
      if (progressLog) progressLog.innerHTML += `<div style="color:var(--danger)">❌ ${esc(r.email)} — ${e.message}</div>`;
    }
    const pct = Math.round(((sent + failed) / total) * 100);
    if (progressBar) progressBar.style.width = pct + "%";
    if (progressPct) progressPct.textContent  = pct + "%";
    if (progressLbl) progressLbl.textContent  = `Enviando ${sent + failed} de ${total}...`;
    if (delayMs > 0 && i < recipients.length - 1) await new Promise(r => setTimeout(r, delayMs));
  }

  saveCampaignToHistory({ segment, subject, total, sent, failed, date: new Date().toISOString() });
  toast(`📧 Campaña enviada: ${sent} OK, ${failed} fallidos`, sent > 0 ? "success" : "error");
  if (progressLbl) progressLbl.textContent = `✅ Completado: ${sent} enviados, ${failed} fallidos`;
  renderCampaignHistory();
}

// ── Función global para botones del banner ────────────────────────
window.smartSelectAll = function(select) {
  if (select) {
    _smartState.allRows.forEach(r => _smartState.selectedEmails.add(r.email));
  } else {
    _smartState.selectedEmails.clear();
  }
  renderSmartCourseResults();
};

// ── Segmentación avanzada ─────────────────────────────────────────
function getEmailRecipients(segment, excludeConverted = false) {
  // ── Segmento Smart Course: usa emails marcados con checkbox ──
  if (segment === "smart_course") {
    const sel = _smartState.selectedEmails;
    if (!sel.size) {
      // fallback: todos los rows
      return _smartState.allRows
        .filter(r => r.email)
        .map(r => ({ email: r.email, name: r.name || r.email }));
    }
    return _smartState.allRows
      .filter(r => sel.has(r.email))
      .map(r => ({ email: r.email, name: r.name || r.email }));
  }

  const cm  = Object.values(customerMap(state.filtered));
  const now = Date.now();
  const sortedRevDesc = [...cm].sort((a, b) => b.revenue - a.revenue);
  const vipEmails = sortedRevDesc.slice(0, Math.ceil(cm.length * 0.1)).map(c => c.email || c.name);

  let list = cm;
  if (segment === "inactive")    list = cm.filter(c => new Date(c.last) < new Date(now - 90 * 864e5));
  else if (segment === "vip")    list = cm.filter(c => vipEmails.includes(c.email || c.name));
  else if (segment === "risk")   list = cm.filter(c => c.orders === 1);
  else if (segment === "upsell") list = cm.filter(c => c.orders === 1 && c.revenue < 100);
  else if (segment === "country") {
    const country = $("#filterCountry")?.value;
    if (country) list = cm.filter(c => c.country === country || c.billing_country === country);
  }
  else if (segment === "ticket") {
    const minTicket = parseFloat($("#filterTicket")?.value || "0");
    list = cm.filter(c => c.orders > 0 && (c.revenue / c.orders) >= minTicket);
  }
  else if (segment === "course") {
    const course = $("#filterCourse")?.value;
    if (course) {
      list = state.filtered.filter(o => (o.items || []).some(i => (i.name || "").toLowerCase().includes(course.toLowerCase())))
        .map(o => o.billing_email || o.customer_email)
        .filter(Boolean)
        .filter((v, i, a) => a.indexOf(v) === i)
        .map(email => cm.find(c => c.email === email))
        .filter(Boolean);
    }
  }
  else if (segment === "min_amount") {
    const minAmt = parseFloat($("#filterMinAmount")?.value || "0");
    list = cm.filter(c => (c.revenue || 0) >= minAmt);
  }
  else if (segment === "last_purchase") {
    const days = parseInt($("#filterLastPurchaseDays")?.value || "60", 10);
    list = cm.filter(c => c.last && new Date(c.last) < new Date(now - days * 864e5));
  }
  else if (segment === "kanban_tag") {
    const tag = $("#filterKanbanTag")?.value || "new";
    const emailsInTag = Object.entries(KANBAN_STATE)
      .filter(([, s]) => s.status === tag)
      .map(([id]) => id);
    list = cm.filter(c => emailsInTag.includes(c.email));
  }
  else if (segment === "multi_country") {
    const sel = $("#filterMultiCountry");
    if (sel) {
      const selected = [...sel.selectedOptions].map(o => o.value);
      if (selected.length) list = cm.filter(c => selected.includes(c.country) || selected.includes(c.billing_country));
    }
  }

  // Excluir convertidos recientemente (compraron en últimos 30 días)
  if (excludeConverted) {
    const recent = new Date(now - 30 * 864e5);
    list = list.filter(c => !c.last || new Date(c.last) < recent);
  }

  return list.filter(c => c.email).map(c => ({ email: c.email, name: c.name || c.email }));
}

// ── Plantillas (localStorage) ─────────────────────────────────────
function getTemplates() {
  try { return JSON.parse(localStorage.getItem("crm_em_templates") || "{}"); } catch(e) { return {}; }
}
function saveTemplate(name, tpl) {
  const templates = getTemplates();
  templates[name] = tpl;
  localStorage.setItem("crm_em_templates", JSON.stringify(templates));
  renderTemplateSelect();
}
function loadTemplate(name) {
  const templates = getTemplates();
  const tpl = templates[name];
  if (!tpl) return;
  if ($("#emailSubject"))      $("#emailSubject").value      = tpl.subject      || "";
  if ($("#emailBody"))         $("#emailBody").value         = tpl.body         || "";
  if ($("#emailHeaderImage"))  $("#emailHeaderImage").value  = tpl.headerImage  || "";
  if ($("#ctaText"))           $("#ctaText").value           = tpl.ctaText      || "";
  if ($("#ctaUrl"))            $("#ctaUrl").value            = tpl.ctaUrl       || "";
  updateSubjectCharCount();
  toast(`📄 Plantilla "${name}" cargada`, "success");
}
function deleteTemplate(name) {
  const templates = getTemplates();
  delete templates[name];
  localStorage.setItem("crm_em_templates", JSON.stringify(templates));
  renderTemplateSelect();
  toast(`🗑 Plantilla "${name}" eliminada`, "success");
}
function renderTemplateSelect() {
  const sel = $("#templateSelect");
  if (!sel) return;
  const templates = getTemplates();
  const names = Object.keys(templates);
  sel.innerHTML = '<option value="">— Seleccionar plantilla guardada —</option>' +
    names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join("");
}

// ── Contador de caracteres del asunto ────────────────────────────
function updateSubjectCharCount() {
  const el = $("#emailSubject");
  const counter = $("#subjectCharCount");
  if (!el || !counter) return;
  const len = el.value.length;
  counter.textContent = `${len} / 60`;
  counter.style.color = len > 60 ? "var(--danger)" : len > 45 ? "var(--warn)" : "var(--muted)";
}

// ── Mejor horario de envío ────────────────────────────────────────
function renderBestSendHour() {
  const tip = $("#bestHourTip");
  if (!tip || !state.filtered?.length) return;
  const hourCounts = Array(24).fill(0);
  state.filtered.forEach(o => {
    const d = new Date(o.date_created || o.date_paid || o.created_at || "");
    if (!isNaN(d)) hourCounts[d.getHours()]++;
  });
  const bestHour = hourCounts.indexOf(Math.max(...hourCounts));
  const h = bestHour.toString().padStart(2, "0");
  tip.textContent = `🕐 Mejor hora de envío: ${h}:00 (máxima actividad)`;
  tip.style.display = "inline";
}

// ── Poblar selects de filtros avanzados ───────────────────────────
function populateAdvancedFilters() {
  // Países
  const countries = [...new Set(state.filtered.map(o => o.billing?.country || o.billing_country).filter(Boolean))].sort();
  const countrySel = $("#filterCountry");
  if (countrySel) countrySel.innerHTML = countries.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
  // Multi-país
  const multiSel = $("#filterMultiCountry");
  if (multiSel) multiSel.innerHTML = countries.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
  // Cursos (filtro básico)
  const courseSel = $("#filterCourse");
  if (courseSel) {
    const courses = [...new Set(state.filtered.flatMap(o => (o.line_items || o.items || o.products || []).map(i => i.name)).filter(Boolean))].sort();
    courseSel.innerHTML = courses.slice(0, 100).map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
  }
  // Cursos para el panel Smart
  populateSmartCourseSelect();
}

// =============================================================
// MOTOR DE RECOMENDACIÓN INTELIGENTE POR CURSO
// =============================================================

// Estado del panel smart
const _smartState = {
  selectedCourse: "",
  buyers: [],
  similar: [],
  relatedCourses: [],
  selectedEmails: new Set(),        // emails marcados con checkbox
  allRows: [],                      // todos los rows actuales para select-all
  selectedRelatedCourses: new Set(),// chips de cursos relacionados activados manualmente
  prospectionMode: false,           // true cuando el curso no existe en catálogo
  prospectionBaseCourses: [],       // cursos similares usados en prospección
  prospectionQuery: "",             // nombre del curso nuevo que el usuario escribió
};

// =============================================================
// SIMILITUD DE CURSOS — para modo prospección
// =============================================================
function _courseWordScore(a, b) {
  // Jaccard de palabras limpias (≥3 chars)
  const words = s => new Set(s.toLowerCase().replace(/[^a-záéíóúüñ0-9 ]/gi, " ").split(/\s+/).filter(w => w.length >= 3));
  const wa = words(a), wb = words(b);
  const intersection = [...wa].filter(w => wb.has(w)).length;
  const union = new Set([...wa, ...wb]).size;
  return union ? intersection / union : 0;
}

function _findSimilarCourses(query, topN = 8) {
  const allCourses = cmBuildCourseList(state.filtered);
  return allCourses
    .map(c => ({ ...c, sim: _courseWordScore(query, c.name) }))
    .filter(c => c.sim > 0)
    .sort((a, b) => b.sim - a.sim || b.sales - a.sales)
    .slice(0, topN);
}

// Poblar el select de cursos del panel smart
function populateSmartCourseSelect() {
  const sel = $("#smartCourseSelect");
  if (!sel) return;
  const courseList = cmBuildCourseList(state.filtered);
  sel.innerHTML = '<option value="">— Seleccionar curso —</option>' +
    courseList.map(c => `<option value="${esc(c.name)}">${esc(c.name.length > 55 ? c.name.slice(0,55)+"…" : c.name)} (${c.sales} ventas)</option>`).join("");

  // Búsqueda en tiempo real filtra el select
  const search = $("#smartCourseSearch");
  if (search) {
    search.addEventListener("input", () => {
      const q = search.value.toLowerCase();
      Array.from(sel.options).forEach(opt => {
        opt.style.display = (opt.value === "" || opt.text.toLowerCase().includes(q)) ? "" : "none";
      });
    }, { once: false });
  }
}

/**
 * Análisis de recomendación colaborativa basado en historial de compras.
 * Para el curso X seleccionado:
 *  - buyers: clientes que ya compraron X
 *  - co-courses: todos los cursos que esos buyers también compraron (sin X)
 *  - similar: clientes que compraron ≥1 co-course pero NO compraron X
 *    → ordenados por score = (co-courses en común / total cursos del cliente)
 */
function runSmartCourseAnalysis(courseName) {
  if (!courseName) return;

  const cm = Object.values(customerMap(state.filtered));

  // 1. Compradores del curso objetivo
  const buyers = cm.filter(c => c.courses && c.courses.has(courseName));

  // 2. Cursos co-comprados (frecuencia de aparición en el segmento buyers)
  const coMap = {};
  buyers.forEach(c => {
    c.courses.forEach(name => {
      if (name === courseName) return;
      coMap[name] = (coMap[name] || 0) + 1;
    });
  });
  const relatedCourses = Object.entries(coMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([name, freq]) => ({ name, freq }));

  const coCourseSet = new Set(relatedCourses.map(r => r.name));

  // 3. Clientes similares: compraron ≥1 co-course pero NO el curso objetivo
  const similar = cm
    .filter(c => {
      if (!c.email) return false;
      if (c.courses.has(courseName)) return false;
      return [...c.courses].some(n => coCourseSet.has(n));
    })
    .map(c => {
      const sharedCourses = [...c.courses].filter(n => coCourseSet.has(n));
      const score = sharedCourses.length / (c.courses.size || 1);
      return { ...c, sharedCourses, score };
    })
    .sort((a, b) => b.score - a.score || b.revenue - a.revenue)
    .slice(0, 200);

  _smartState.selectedCourse = courseName;
  _smartState.buyers = buyers.filter(c => c.email);
  _smartState.similar = similar;
  _smartState.relatedCourses = relatedCourses;
  _smartState.selectedEmails = new Set();
  _smartState.allRows = [];
  _smartState.prospectionMode = false;
  _smartState.selectedRelatedCourses = new Set();
}

// Análisis especial para curso nuevo (no existe en catálogo)
function runSmartProspectionAnalysis(query, baseCourses) {
  const cm = Object.values(customerMap(state.filtered));
  const baseNames = new Set(baseCourses.map(c => c.name));

  // Prospectos: compraron ≥1 curso base
  const prospectMap = {};
  cm.forEach(c => {
    if (!c.email) return;
    const shared = [...c.courses].filter(n => baseNames.has(n));
    if (!shared.length) return;
    const score = shared.length / (c.courses.size || 1);
    prospectMap[c.email] = { ...c, sharedCourses: shared, score };
  });
  const prospects = Object.values(prospectMap)
    .sort((a, b) => b.score - a.score || b.revenue - a.revenue)
    .slice(0, 200);

  // co-courses de esos prospectos (para mostrar relaciones)
  const coMap = {};
  prospects.forEach(c => {
    c.courses.forEach(n => { coMap[n] = (coMap[n] || 0) + 1; });
  });
  const relatedCourses = Object.entries(coMap)
    .filter(([n]) => !baseNames.has(n))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, freq]) => ({ name, freq }));

  _smartState.selectedCourse = query;
  _smartState.buyers = [];
  _smartState.similar = prospects;
  _smartState.relatedCourses = relatedCourses;
  _smartState.selectedEmails = new Set();
  _smartState.allRows = [];
  _smartState.prospectionMode = true;
  _smartState.prospectionQuery = query;
  _smartState.prospectionBaseCourses = baseCourses;
  _smartState.selectedRelatedCourses = new Set();
}

// Renderizar el panel de resultados
function renderSmartCourseResults() {
  const resultsDiv = $("#smartCourseResults");
  const kpisDiv    = $("#smartCourseKpis");
  const relWrap    = $("#smartRelatedCoursesWrap");
  const relDiv     = $("#smartRelatedCourses");
  const tbody      = $("#smartCourseTable");
  if (!resultsDiv || !kpisDiv || !tbody) return;

  const mode = document.querySelector('input[name="smartMode"]:checked')?.value || "similar";
  const { buyers, similar, relatedCourses } = _smartState;

  const showBuyers  = mode === "buyers"  || mode === "both";
  const showSimilar = mode === "similar" || mode === "both";

  // Construir lista de filas
  const rows = [];
  if (showBuyers) {
    buyers.forEach(c => rows.push({
      name: c.name, email: c.email,
      shared: "— ya compró este curso —",
      score: "✅",
      typeLabel: '<span style="background:#16a34a22;color:#16a34a;padding:2px 8px;border-radius:10px;font-size:11px">Comprador</span>'
    }));
  }
  if (showSimilar) {
    similar.forEach(c => rows.push({
      name: c.name, email: c.email,
      shared: c.sharedCourses.slice(0, 3).map(n => n.length > 28 ? n.slice(0,28)+"…" : n).join(", "),
      score: `${Math.round(c.score * 100)}%`,
      typeLabel: '<span style="background:#0092ff22;color:#0092ff;padding:2px 8px;border-radius:10px;font-size:11px">Similar</span>'
    }));
  }

  // Guardar en estado + seleccionar todos por defecto en el primer análisis
  _smartState.allRows = rows;
  if (_smartState.selectedEmails.size === 0) {
    rows.forEach(r => _smartState.selectedEmails.add(r.email));
  } else {
    // Mantener solo los que siguen en la lista actual
    const currentEmails = new Set(rows.map(r => r.email));
    [..._smartState.selectedEmails].forEach(e => { if (!currentEmails.has(e)) _smartState.selectedEmails.delete(e); });
  }

  const total = [...new Set([...buyers.filter(()=>showBuyers).map(r=>r.email), ...similar.filter(()=>showSimilar).map(r=>r.email)])].length;
  const selCount = _smartState.selectedEmails.size;

  // KPIs — ajustar etiquetas según modo prospección
  const kpiLabels = _smartState.prospectionMode
    ? [
        { label: "Compradores base", value: buyers.length,         icon: "🛒", color: "var(--muted)"   },
        { label: "Prospectos potenciales", value: similar.length,  icon: "🔍", color: "var(--accent)" },
        { label: "Cursos similares usados", value: relatedCourses.length, icon: "🔗", color: "var(--warn)" },
        { label: "Seleccionados",    value: selCount,              icon: "☑️", color: "var(--good)"   },
      ]
    : [
        { label: "Compradores del curso", value: buyers.length,         icon: "🛒", color: "var(--good)"   },
        { label: "Clientes similares",    value: similar.length,        icon: "💡", color: "var(--accent)" },
        { label: "Cursos relacionados",   value: relatedCourses.length, icon: "🔗", color: "var(--warn)"   },
        { label: "Seleccionados",         value: selCount,              icon: "☑️", color: "var(--good)"   },
      ];
  kpisDiv.innerHTML = kpiLabels.map(k =>
    `<div style="background:var(--bg);border-radius:8px;padding:10px 14px;flex:1;min-width:120px;border:1px solid var(--line)">
      <div style="font-size:20px;font-weight:800;color:${k.color}">${k.icon} ${k.value}</div>
      <div style="font-size:11px;color:var(--muted)">${k.label}</div>
    </div>`).join("");

  // Cursos relacionados (chips CLICABLES — toggle agrega compradores de ese curso)
  if (relWrap && relDiv) {
    if (relatedCourses.length) {
      relWrap.style.display = "block";
      // Actualizar texto del encabezado según el modo
      const relHeadP = relWrap.querySelector("p");
      if (relHeadP) relHeadP.textContent = _smartState.prospectionMode
        ? "📊 Cursos similares usados como base — actívalos para agregar más prospectos:"
        : "📊 Cursos frecuentemente comprados junto a este curso — haz clic para incluir sus compradores:";

      relDiv.innerHTML = relatedCourses.map(r => {
        const active = _smartState.selectedRelatedCourses.has(r.name);
        const label  = r.name.length > 38 ? r.name.slice(0, 38) + "…" : r.name;
        return `<button class="smart-chip-btn${active ? " smart-chip-active" : ""}"
          data-course="${esc(r.name)}"
          style="background:${active ? "var(--accent)" : "var(--card2)"};
            border:1px solid ${active ? "var(--accent)" : "#ffffff33"};
            border-radius:20px;padding:4px 12px;font-size:11px;
            color:${active ? "#fff" : "var(--accent)"};
            cursor:pointer;transition:.15s all;display:inline-flex;align-items:center;gap:4px">
          ${esc(label)}
          <span style="opacity:.65">${r.freq}x</span>
          <span style="font-weight:700">${active ? " ✓" : " +"}</span>
        </button>`;
      }).join("");

      // Listeners de chips — toggle + re-render
      relDiv.querySelectorAll(".smart-chip-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          const name = btn.dataset.course;
          if (_smartState.selectedRelatedCourses.has(name)) {
            _smartState.selectedRelatedCourses.delete(name);
          } else {
            _smartState.selectedRelatedCourses.add(name);
          }
          _applyChipRecipients();
          renderSmartCourseResults();
        });
      });
    } else {
      relWrap.style.display = "none";
    }
  }

  // ── Barra de selección masiva ──
  const allChecked  = rows.length > 0 && rows.every(r => _smartState.selectedEmails.has(r.email));
  const someChecked = rows.some(r => _smartState.selectedEmails.has(r.email));

  // Construir thead con checkbox select-all
  const tableEl = tbody.closest("table");
  if (tableEl) {
    let thead = tableEl.querySelector("thead");
    if (!thead) { thead = document.createElement("thead"); tableEl.prepend(thead); }
    thead.innerHTML = `<tr style="background:var(--card2);position:sticky;top:0">
      <th style="padding:8px 10px;text-align:center;width:40px">
        <input type="checkbox" id="smartSelectAll" style="width:16px;height:16px;accent-color:var(--accent);cursor:pointer"
          ${allChecked ? "checked" : ""} ${someChecked && !allChecked ? 'style="opacity:.6"' : ""}>
      </th>
      <th style="padding:8px 10px;text-align:left;font-weight:700">Cliente</th>
      <th style="padding:8px 10px;text-align:left;font-weight:700">Cursos en común</th>
      <th style="padding:8px 10px;text-align:right;font-weight:700">Score</th>
      <th style="padding:8px 10px;text-align:center;font-weight:700">Tipo</th>
    </tr>`;

    const selectAllChk = thead.querySelector("#smartSelectAll");
    if (selectAllChk) {
      selectAllChk.indeterminate = someChecked && !allChecked;
      selectAllChk.addEventListener("change", () => {
        if (selectAllChk.checked) {
          rows.forEach(r => _smartState.selectedEmails.add(r.email));
        } else {
          rows.forEach(r => _smartState.selectedEmails.delete(r.email));
        }
        renderSmartCourseResults();
      });
    }
  }

  // Filas con checkbox individual
  tbody.innerHTML = rows.slice(0, 150).map(r => {
    const checked = _smartState.selectedEmails.has(r.email);
    const hasRealName = r.name && r.name !== r.email && r.name !== "Cliente";
    return `<tr style="border-bottom:1px solid var(--line);${checked ? "" : "opacity:.45"}">
      <td style="padding:8px 10px;text-align:center">
        <input type="checkbox" class="smart-row-chk" data-email="${esc(r.email)}"
          style="width:16px;height:16px;accent-color:var(--accent);cursor:pointer"
          ${checked ? "checked" : ""}>
      </td>
      <td style="padding:8px 10px">
        <div style="font-weight:600;font-size:12px">${esc(r.name)}</div>
        <div style="color:var(--muted);font-size:11px">${esc(r.email)}</div>
        ${hasRealName ? '' : '<div style="font-size:10px;color:var(--warn)">⚠ Sin nombre en CRM</div>'}
      </td>
      <td style="padding:8px 10px;font-size:11px;color:var(--muted);max-width:200px">${esc(r.shared)}</td>
      <td style="padding:8px 10px;text-align:right;font-weight:700;color:var(--accent)">${r.score}</td>
      <td style="padding:8px 10px;text-align:center">${r.typeLabel}</td>
    </tr>`;
  }).join("");

  // Listeners de checkboxes individuales
  tbody.querySelectorAll(".smart-row-chk").forEach(chk => {
    chk.addEventListener("change", () => {
      const email = chk.dataset.email;
      if (chk.checked) _smartState.selectedEmails.add(email);
      else             _smartState.selectedEmails.delete(email);
      // Re-render solo kpis y badge (sin re-render completo para no perder scroll)
      _smartUpdateCounters();
    });
  });

  resultsDiv.style.display = "block";

  // ── Banner de confirmación ──
  _smartRenderBanner(rows);

  // Actualizar badge header
  _smartUpdateCounters();
}

// Actualizar solo los contadores sin re-renderizar la tabla
// Agregar/quitar de _smartState.buyers+similar los compradores de chips activos
function _applyChipRecipients() {
  const cm = Object.values(customerMap(state.filtered));
  const sel = _smartState.selectedRelatedCourses;
  if (!sel.size) return; // nada que hacer

  // Compradores de los chips seleccionados que aún no están en ninguna lista
  const existingEmails = new Set([
    ..._smartState.buyers.map(c => c.email),
    ..._smartState.similar.map(c => c.email),
  ]);

  sel.forEach(courseName => {
    cm.forEach(c => {
      if (!c.email || existingEmails.has(c.email)) return;
      if (c.courses && c.courses.has(courseName)) {
        // Añadir como "similar" con sharedCourses = [courseName]
        _smartState.similar.push({ ...c, sharedCourses: [courseName], score: 0.5 });
        existingEmails.add(c.email);
      }
    });
  });
}

function _smartUpdateCounters() {
  const selCount = _smartState.selectedEmails.size;
  const badge = $("#emailCountBadge");
  if (badge) badge.textContent = `${selCount} seleccionados`;

  // Actualizar KPI "Seleccionados"
  const kpisDiv = $("#smartCourseKpis");
  if (kpisDiv) {
    const kpiCards = kpisDiv.querySelectorAll("div > div:first-child");
    if (kpiCards[3]) kpiCards[3].textContent = `☑️ ${selCount}`;
  }

  // Actualizar banner
  const banner = $("#smartSelectedBanner");
  if (banner) {
    const countEl = banner.querySelector(".smart-banner-count");
    if (countEl) countEl.textContent = `${selCount} destinatarios seleccionados`;
  }

  // Actualizar select-all checkbox state
  const selectAll = $("#smartSelectAll");
  if (selectAll && _smartState.allRows.length > 0) {
    const allChecked  = _smartState.allRows.every(r => _smartState.selectedEmails.has(r.email));
    const someChecked = _smartState.allRows.some(r => _smartState.selectedEmails.has(r.email));
    selectAll.checked       = allChecked;
    selectAll.indeterminate = someChecked && !allChecked;
  }
}

// Renderizar solo el banner de confirmación
function _smartRenderBanner(rows) {
  const resultsDiv = $("#smartCourseResults");
  if (!resultsDiv) return;
  const selCount = _smartState.selectedEmails.size;
  const selRows  = rows.filter(r => _smartState.selectedEmails.has(r.email));

  const namePreview = selRows.slice(0, 4).map(r => {
    const hasRealName = r.name && r.name !== r.email && r.name !== "Cliente";
    return `<span style="background:rgba(255,255,255,.08);border-radius:6px;padding:3px 8px;font-size:12px;white-space:nowrap">
      ${hasRealName
        ? `<strong>${esc(r.name)}</strong> <span style="opacity:.6">&lt;${esc(r.email)}&gt;</span>`
        : `<span style="opacity:.8">${esc(r.email)}</span>`}
    </span>`;
  }).join("");
  const moreCount = selRows.length > 4
    ? `<span style="font-size:12px;opacity:.7">+${selRows.length - 4} más</span>` : "";

  // Banner extra: modo prospección
  const prospBanner = _smartState.prospectionMode ? `
    <div style="margin-bottom:12px;padding:10px 14px;background:rgba(251,191,36,.1);border:1px solid #fbbf2466;border-radius:8px;font-size:12px">
      <strong style="color:#fbbf24">🔍 Modo Prospección</strong>
      <span style="color:var(--muted);margin-left:6px">El curso "<strong>${esc(_smartState.prospectionQuery)}</strong>" no existe aún en tu catálogo.</span><br>
      <span style="color:var(--muted)">Estos son <strong style="color:#fbbf24">${selCount} prospectos potenciales</strong> basados en ${_smartState.prospectionBaseCourses.length} cursos similares de tu plataforma.</span>
      <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
        ${_smartState.prospectionBaseCourses.map(c =>
          `<span style="background:#fbbf2420;border:1px solid #fbbf2444;border-radius:12px;padding:2px 8px;font-size:11px;color:#fbbf24">${esc(c.name.length > 35 ? c.name.slice(0,35)+"…" : c.name)}</span>`
        ).join("")}
      </div>
    </div>` : "";

  let banner = $("#smartSelectedBanner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "smartSelectedBanner";
    resultsDiv.appendChild(banner);
  }
  banner.innerHTML = `
    <div style="margin-top:16px;padding:14px 16px;background:linear-gradient(135deg,rgba(0,146,255,.15),rgba(22,163,74,.12));border:1px solid #16a34a55;border-radius:10px">
      ${prospBanner}
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px">
        <span style="font-size:18px">✅</span>
        <span class="smart-banner-count" style="font-weight:700;font-size:14px;color:#4ade80">${selCount} destinatarios seleccionados</span>
        <span style="font-size:12px;color:var(--muted)">— nombres del CRM para personalización con <code style="background:rgba(255,255,255,.1);padding:1px 5px;border-radius:3px">{nombre}</code></span>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
        ${namePreview}${moreCount}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button onclick="smartSelectAll(true)"
          style="background:rgba(0,146,255,.2);color:#0092ff;border:1px solid #0092ff55;border-radius:7px;padding:8px 14px;font-size:12px;font-weight:700;cursor:pointer">
          ☑ Seleccionar todos (${_smartState.allRows.length})
        </button>
        <button onclick="smartSelectAll(false)"
          style="background:rgba(255,80,80,.12);color:#f87171;border:1px solid #f8717155;border-radius:7px;padding:8px 14px;font-size:12px;font-weight:700;cursor:pointer">
          ☐ Deseleccionar todos
        </button>
        <button onclick="document.getElementById('emailSubject')?.scrollIntoView({behavior:'smooth',block:'center'})"
          style="background:linear-gradient(135deg,#0092ff,#16a34a);color:#fff;border:none;border-radius:7px;padding:8px 18px;font-size:13px;font-weight:700;cursor:pointer">
          ✏️ Componer y enviar →
        </button>
      </div>
    </div>`;
}

// ── Preview HTML real en iframe ───────────────────────────────────
function renderEmailPreview() {
  const frame = $("#emailPreviewFrame");
  const box   = $("#emailPreviewBox");
  if (!frame || !box) return;
  const name        = "Cliente";
  const subject     = $("#emailSubject")?.value.trim() || "(sin asunto)";
  const bodyText    = $("#emailBody")?.value.trim()    || "";
  const headerImage = $("#emailHeaderImage")?.value.trim();
  const ctaText     = $("#ctaText")?.value.trim();
  const ctaUrl      = $("#ctaUrl")?.value.trim();
  const includeFooter = $("#includeFooter")?.checked ?? true;
  const html = buildEmailHtml({ name, bodyText, headerImage, ctaText, ctaUrl, includeFooter });
  frame.srcdoc = html;
  box.style.display = "block";
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function saveCampaignToHistory(campaign) {
  try {
    // Auto-capturar snapshot del compositor si no viene ya incluido
    if (!campaign.body) {
      campaign.body        = $("#emailBody")?.value        || "";
      campaign.headerImage = $("#emailHeaderImage")?.value || "";
      campaign.ctaText     = $("#ctaText")?.value          || "";
      campaign.ctaUrl      = $("#ctaUrl")?.value           || "";
    }
    const history = JSON.parse(localStorage.getItem("crm_campaign_history") || "[]");
    history.unshift(campaign);
    localStorage.setItem("crm_campaign_history", JSON.stringify(history.slice(0, 50)));
  } catch(e) {}
}

function renderCampaignHistory() {
  const el = $("#campaignHistory");
  if (!el) return;
  try {
    const history = JSON.parse(localStorage.getItem("crm_campaign_history") || "[]");
    if (!history.length) { el.innerHTML = '<p style="color:var(--muted);font-size:13px">No hay campañas enviadas aún.</p>'; return; }
    el.innerHTML = history.map((c, idx) => `
      <div style="padding:8px 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div>
          <strong>${esc(c.subject)}</strong>
          <span style="color:var(--muted);margin-left:8px">${new Date(c.date).toLocaleString()}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px">
          <span style="color:var(--good)">✅ ${c.sent} enviados</span>
          ${c.failed ? `<span style="color:var(--danger)">❌ ${c.failed} fallidos</span>` : ""}
          <span style="color:var(--muted)">Segmento: ${esc(c.segment)}</span>
          ${c.body ? `<button onclick="loadCampaignToComposer(${idx})" style="font-size:11px;padding:3px 9px;background:var(--card2);border:1px solid var(--line);border-radius:6px;color:var(--accent);cursor:pointer">↩ Cargar en compositor</button>` : ""}
        </div>
      </div>`).join("");
  } catch(e) {}
}

function clearCampaignHistory() {
  localStorage.removeItem("crm_campaign_history");
  renderCampaignHistory();
  toast("Historial limpiado", "success");
}

// =============================================================
// CARGAR CAMPAÑA AL COMPOSITOR (desde historial)
// =============================================================
window.loadCampaignToComposer = function(idx) {
  try {
    const c = JSON.parse(localStorage.getItem("crm_campaign_history") || "[]")[idx];
    if (!c) return;
    if ($("#emailSubject"))     $("#emailSubject").value     = c.subject     || "";
    if ($("#emailBody"))        $("#emailBody").value        = c.body        || "";
    if ($("#emailHeaderImage")) $("#emailHeaderImage").value = c.headerImage || "";
    if ($("#ctaText"))          $("#ctaText").value          = c.ctaText     || "";
    if ($("#ctaUrl"))           $("#ctaUrl").value           = c.ctaUrl      || "";
    updateSubjectCharCount();
    renderSpamBadge();
    toast(`↩ Campaña "${(c.subject||"sin asunto").slice(0,40)}" cargada en el compositor`, "success");
    $("#emailSubject")?.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch(e) {}
};

// =============================================================
// SPAM SCORE CHECKER
// =============================================================
const _SPAM_WORDS = [
  "gratis","free","oferta","urgente","gana dinero","100%","garantizado",
  "sin costo","haga clic","haga click","winner","ganaste","oro","gold",
  "forex","mlm","promocion","exclusivo","alerta","dinero facil",
  "clic aqui","click aqui","compra ya","actua ahora","no te pierdas",
  "casino","bitcoin","crypto","millonario","millones","dolar"
];

function checkSpamScore(subject, body) {
  const norm = s => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const text = norm(subject + " " + body);
  const hits = _SPAM_WORDS.filter(w => text.includes(norm(w)));
  return { score: Math.min(100, hits.length * 15), hits };
}

function renderSpamBadge() {
  const badge = $("#spamScoreBadge");
  if (!badge) return;
  const { score, hits } = checkSpamScore(
    $("#emailSubject")?.value || "",
    $("#emailBody")?.value    || ""
  );
  const color = score === 0 ? "var(--good)" : score < 30 ? "var(--warn)" : "var(--danger)";
  badge.textContent = score === 0 ? "✅ Sin spam" : score < 30 ? `⚠ Spam ${score}%` : `🚨 Spam ${score}%`;
  badge.style.color       = color;
  badge.style.borderColor = color;
  badge.title = hits.length ? "Palabras: " + hits.join(", ") : "Sin palabras de spam detectadas";
}

// =============================================================
// GALERÍA DE IMÁGENES (localStorage)
// =============================================================
function getImageGallery() {
  try { return JSON.parse(localStorage.getItem("crm_img_gallery") || "[]"); } catch(e) { return []; }
}
function saveImageToGallery(url) {
  if (!url) return;
  const name = url.split("/").pop().split("?")[0].slice(0, 30) || "imagen";
  const gallery = getImageGallery().filter(i => i.url !== url);
  gallery.unshift({ url, name, date: new Date().toISOString() });
  localStorage.setItem("crm_img_gallery", JSON.stringify(gallery.slice(0, 20)));
  renderImageGallery();
  toast("📷 Imagen guardada en galería", "success");
}
window.deleteImageFromGallery = function(url) {
  localStorage.setItem("crm_img_gallery", JSON.stringify(getImageGallery().filter(i => i.url !== url)));
  renderImageGallery();
};
window.pickGalleryImage = function(url) {
  const inp = $("#emailHeaderImage");
  if (inp) { inp.value = url; inp.dispatchEvent(new Event("input")); }
  renderImageGallery();
};
function renderImageGallery() {
  const container = $("#imgGalleryPicker");
  if (!container) return;
  const gallery = getImageGallery();
  if (!gallery.length) {
    container.innerHTML = '<span style="font-size:11px;color:var(--muted);font-style:italic">Sin imágenes guardadas</span>';
    return;
  }
  container.innerHTML = gallery.map(img => `
    <div style="position:relative;display:inline-flex">
      <img src="${esc(img.url)}" alt="${esc(img.name)}" title="Usar: ${esc(img.name)}"
        onclick="pickGalleryImage('${img.url.replace(/'/g,"\\'")}')"
        style="width:52px;height:36px;object-fit:cover;border-radius:4px;cursor:pointer;border:2px solid transparent;transition:.15s"
        onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='transparent'">
      <span onclick="deleteImageFromGallery('${img.url.replace(/'/g,"\\'")}');"
        style="position:absolute;top:-5px;right:-5px;background:var(--danger);color:#fff;border-radius:50%;width:15px;height:15px;font-size:9px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-weight:900">×</span>
    </div>`).join("");
}

// =============================================================
// TEXTO PLANO AUTO-GENERADO
// =============================================================
window.showPlainTextPreview = function() {
  const body    = $("#emailBody")?.value    || "";
  const ctaText = $("#ctaText")?.value      || "";
  const ctaUrl  = $("#ctaUrl")?.value       || "";
  const plain   = body.replace(/<[^>]+>/g, "").trim()
    + (ctaText && ctaUrl ? `\n\n▶ ${ctaText}: ${ctaUrl}` : "")
    + "\n\n---\nCursospirataspro.com | Para darte de baja responde a este correo.";
  const box = $("#plainTextPreviewBox");
  if (!box) return;
  const visible = box.style.display === "block";
  box.style.display = visible ? "none" : "block";
  if (!visible) box.querySelector("pre").textContent = plain;
};

// =============================================================
// PROGRAMAR ENVÍO
// =============================================================
function scheduleSend() {
  const dtInput = $("#scheduleSendAt");
  if (!dtInput?.value) { toast("⚠ Selecciona fecha y hora de envío", "warning"); return; }
  const sendAt  = new Date(dtInput.value);
  const msDelay = sendAt - Date.now();
  if (msDelay <= 0) { toast("⚠ La fecha programada ya pasó", "warning"); return; }
  const mins = Math.round(msDelay / 60000);
  if (!confirm(`¿Programar envío para ${sendAt.toLocaleString()}? (en ${mins} minuto${mins !== 1 ? "s" : ""})\n\n⚠ Esta pestaña debe permanecer abierta.`)) return;
  setTimeout(sendViaBrevo, msDelay);
  toast(`📅 Envío programado para ${sendAt.toLocaleTimeString()} — mantén esta pestaña abierta`, "success");
}

// =============================================================
// LISTA NEGRA (blacklist UI)
// =============================================================
function renderBlacklistPanel() {
  const container = $("#blacklistList");
  if (!container) return;
  const list = getUnsubscribeList();
  if (!list.length) {
    container.innerHTML = '<p style="color:var(--muted);font-size:12px;margin:0">Lista negra vacía — ningún email excluido.</p>';
    return;
  }
  container.innerHTML = `
    <div style="font-size:12px;color:var(--muted);margin-bottom:8px">${list.length} email(s) excluidos de todos los envíos:</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px">
      ${list.map(email => `
        <span style="background:var(--card2);border:1px solid #f8717166;border-radius:14px;padding:4px 10px;font-size:11px;display:inline-flex;align-items:center;gap:6px">
          ${esc(email)}
          <span onclick="removeFromBlacklist('${esc(email)}')" title="Eliminar" style="cursor:pointer;color:var(--danger);font-weight:900;font-size:13px;line-height:1">×</span>
        </span>`).join("")}
    </div>`;
}
window.removeFromBlacklist = function(email) {
  localStorage.setItem("crm_unsubscribe", JSON.stringify(getUnsubscribeList().filter(e => e !== email)));
  renderBlacklistPanel();
  updateEmailCountBadge();
  toast(`✅ "${email}" eliminado de lista negra`, "success");
};

// =============================================================
// DRIP CAMPAIGNS — secuencias de emails
// =============================================================
function getDripCampaigns() {
  try { return JSON.parse(localStorage.getItem("crm_drip_campaigns") || "[]"); } catch(e) { return []; }
}
function saveDripCampaign(name, steps) {
  if (!name || !steps.length) return;
  const all = getDripCampaigns().filter(c => c.name !== name);
  all.unshift({ name, steps, created: new Date().toISOString() });
  localStorage.setItem("crm_drip_campaigns", JSON.stringify(all.slice(0, 20)));
  renderDripPanel();
  toast(`💾 Secuencia "${name}" guardada`, "success");
}
window.deleteDripCampaign = function(name) {
  localStorage.setItem("crm_drip_campaigns", JSON.stringify(getDripCampaigns().filter(c => c.name !== name)));
  renderDripPanel();
  toast("🗑 Secuencia eliminada", "success");
};
function renderDripPanel() {
  const container = $("#dripCampaignsList");
  if (!container) return;
  const all = getDripCampaigns();
  if (!all.length) {
    container.innerHTML = '<p style="color:var(--muted);font-size:12px;margin:0">Sin secuencias guardadas.</p>';
    return;
  }
  container.innerHTML = all.map(c => `
    <div style="padding:10px 14px;background:var(--card2);border-radius:8px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">
      <div>
        <strong style="font-size:13px">${esc(c.name)}</strong>
        <span style="color:var(--muted);margin-left:8px;font-size:11px">${c.steps.length} paso${c.steps.length !== 1 ? "s" : ""}</span>
        ${c.steps.map((s, i) => `
          <div style="font-size:11px;color:var(--muted);margin-top:3px">
            ${i === 0 ? "📨 Inmediato" : `⏱ +${s.delayDays}d`}: ${esc((s.subject || "").slice(0, 50))}
          </div>`).join("")}
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button onclick="runDripCampaign('${esc(c.name)}')" style="font-size:11px;padding:5px 12px;background:var(--accent);color:#fff;border:none;border-radius:6px;cursor:pointer">▶ Ejecutar</button>
        <button onclick="deleteDripCampaign('${esc(c.name)}')" style="font-size:11px;padding:5px 10px;background:transparent;color:var(--danger);border:1px solid var(--danger);border-radius:6px;cursor:pointer">🗑</button>
      </div>
    </div>`).join("");
}
window.runDripCampaign = async function(name) {
  const campaign = getDripCampaigns().find(c => c.name === name);
  if (!campaign) return;
  const segment  = $("#emailSegment")?.value || "all";
  const excl     = $("#excludeConverted")?.checked ?? false;
  const recips   = getEmailRecipients(segment, excl).filter(r => !getUnsubscribeList().includes(r.email));
  if (!recips.length) { toast("⚠ No hay destinatarios para este segmento", "warning"); return; }
  const totalDays = campaign.steps.reduce((a, s, i) => a + (i === 0 ? 0 : (s.delayDays || 1)), 0);
  if (!confirm(`Ejecutar "${name}"\n${campaign.steps.length} emails → ${recips.length} destinatarios\nDuración: ~${totalDays} días\n\n⚠ La página debe quedar abierta.`)) return;
  let msAcc = 0;
  campaign.steps.forEach((step, idx) => {
    msAcc += idx === 0 ? 0 : (step.delayDays || 1) * 864e5;
    const snapMs = msAcc;
    setTimeout(async () => {
      toast(`📨 Drip paso ${idx + 1}/${campaign.steps.length}: "${(step.subject||"").slice(0,35)}"`, "success");
      const headerImage   = $("#emailHeaderImage")?.value || "";
      const ctaText       = $("#ctaText")?.value          || "";
      const ctaUrl        = $("#ctaUrl")?.value           || "";
      const includeFooter = $("#includeFooter")?.checked  ?? true;
      const delayMs       = parseInt($("#sendDelay")?.value || "400", 10) || 400;
      for (let i = 0; i < recips.length; i++) {
        const r = recips[i];
        const html = buildEmailHtml({ name: r.name, bodyText: step.body || "", headerImage, ctaText, ctaUrl, includeFooter });
        const subj = (step.subject || "").replace(/\{nombre\}/gi, r.name);
        try {
          await fetch(`${CONFIG.apiBaseUrl}/brevo/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-CPP-CRM-Dashboard-Token": CONFIG.apiToken },
            body: JSON.stringify({ to_email: r.email, to_name: r.name, subject: subj, html_content: html }),
          });
        } catch(e) {}
        if (delayMs > 0 && i < recips.length - 1) await new Promise(res => setTimeout(res, delayMs));
      }
      saveCampaignToHistory({ segment, subject: step.subject || "", body: step.body || "", total: recips.length, sent: recips.length, failed: 0, date: new Date().toISOString() });
      renderCampaignHistory();
    }, snapMs);
  });
  toast(`⏰ Secuencia "${name}" iniciada — ${campaign.steps.length} pasos programados`, "success");
};

// A/B: comparar diferencias inline
function showABDiff() {
  const a   = $("#emailSubject")?.value  || "";
  const b   = $("#emailSubjectB")?.value || "";
  const box = $("#abDiffResult");
  if (!box) return;
  if (!a && !b) { box.style.display = "none"; return; }
  const wA = a.split(" "), wB = b.split(" ");
  const max = Math.max(wA.length, wB.length);
  let dA = "", dB = "";
  for (let i = 0; i < max; i++) {
    const wa = wA[i] || "", wb = wB[i] || "";
    const same = wa.toLowerCase() === wb.toLowerCase();
    dA += same ? `${esc(wa)} ` : `<mark style="background:#ef444433;border-radius:3px;padding:1px 3px">${esc(wa)} </mark>`;
    dB += same ? `${esc(wb)} ` : `<mark style="background:#22c55e33;border-radius:3px;padding:1px 3px">${esc(wb)} </mark>`;
  }
  box.style.display = "block";
  box.innerHTML = `
    <div style="font-size:11px;color:var(--muted);margin-bottom:4px">Diferencias (🔴 A · 🟢 B):</div>
    <div style="margin-bottom:3px;font-size:12px"><strong>A:</strong> ${dA}</div>
    <div style="font-size:12px"><strong>B:</strong> ${dB}</div>`;
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
      const gross = document.getElementById("ppGross");
      if (!gross || gross.textContent === "—") loadPaypalData();
    }
  }
  if (id === "stripe")        renderStripeView();
  if (id === "suscripciones") renderSuscripciones();
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
  if (btn) { btn.textContent = "⏳ Generando PDF..."; btn.disabled = true; }

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
  { id: "command",      label: "🌐 Centro de mando" },
  { id: "crm",          label: "👥 CRM clientes" },
  { id: "oportunidades",label: "🎯 Oportunidades" },
  { id: "kanban",       label: "📌 Kanban leads" },
  { id: "analytics",    label: "📈 Análisis avanzado" },
  { id: "sales",        label: "💳 Ventas" },
  { id: "courses",      label: "🎓 Cursos" },
  { id: "geo",          label: "🗺 Geografía" },
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
  { id: "view-command",  label: "🌐 Centro de mando",      sub: "Globo + ventas + feed" },
  { id: "view-crm",      label: "👥 CRM clientes",         sub: "Segmentos, tabla, heatmap" },
  { id: "view-analytics",label: "📈 Análisis avanzado",    sub: "Forecast, RFM, abandono" },
  { id: "view-kanban",   label: "📌 Kanban de leads",      sub: "Pipeline drag & drop" },
  { id: "view-oportunidades",label: "🎯 Oportunidades",    sub: "Leads, upsell, email" },
  { id: "view-courses",  label: "🎓 Cursos",               sub: "Rendimiento y comparativa" },
  { id: "view-geo",      label: "🗺 Geografía",            sub: "Rankings de países y ciudades" },
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
  const seg  = $("#emailSegment")?.value || "all";
  const unsub = getUnsubscribeList();
  const excl  = $("#excludeConverted")?.checked ?? false;
  const list = getEmailRecipients(seg, excl).filter(r => !unsub.includes(r.email));
  const badge = $("#emailCountBadge");
  if (badge) badge.textContent = `${list.length} destinatarios`;
  populateAdvancedFilters();
  renderTemplateSelect();
  renderBestSendHour();
  updateSubjectCharCount();
}

function previewEmail() {
  renderEmailPreview();
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
    start_date:         from + "T00:00:00.000Z",
    end_date:           to   + "T23:59:59.000Z",
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

  // Filtrar solo pagos reales recibidos: event_code T00xx (payment received) con monto positivo
  // Excluye comisiones, reembolsos, ajustes internos, transferencias entre cuentas, etc.
  const payments = txnDetails.filter(t => {
    const info = t.transaction_info || {};
    const code = info.transaction_event_code || "";
    const amt  = parseFloat(info.transaction_amount?.value || 0);
    return code.startsWith("T00") && amt > 0;
  });

  let gross = 0, fees = 0, count = 0;
  const byCountry  = {};
  const byCustomer = {};
  const byDay      = {};

  payments.forEach(t => {
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
  if (badge) badge.textContent = `${payments.length} transacciones`;
  if (tbody) {
    if (!payments.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:24px">Sin transacciones en el periodo.</td></tr>`;
      return;
    }
    tbody.innerHTML = payments.map(t => {
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