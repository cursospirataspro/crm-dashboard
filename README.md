# Dashboard CRM Global con Globo Interactivo para WooCommerce

Versión mejorada del dashboard para una empresa que vende cursos digitales.

## Incluye

- Globo terráqueo interactivo giratorio.
- Zoom con rueda del mouse.
- Clic en país para filtrar datos.
- Métricas CRM: ingresos, pedidos, ticket promedio, clientes únicos, recurrentes y tasa de reembolso.
- Segmentos: VIP, recurrentes, nuevos e inactivos.
- Embudo comercial.
- Alertas operativas.
- Ranking de países y ciudades.
- Ranking de clientes.
- Rendimiento por curso.
- Exportación CSV.
- Mini plugin WordPress para conectar WooCommerce sin exponer llaves privadas.

## Probar

Abre `index.html` en Chrome. Está en modo demo por defecto.

## Conectar WooCommerce

1. Sube `wordpress-plugin/cpp-dashboard-crm-api` a `wp-content/plugins/`.
2. Activa el plugin en WordPress.
3. En `wp-config.php` agrega:

```php
define('CPP_CRM_DASHBOARD_TOKEN', 'TOKEN_LARGO_Y_SEGURO');
define('CPP_CRM_DASHBOARD_ALLOWED_ORIGINS', 'https://crm.tudominio.com');
```

Puedes autorizar varios orígenes separándolos por comas. Para la conexión real,
sirve el dashboard mediante HTTPS desde el origen configurado. Abrir `index.html`
como `file://` queda reservado al modo demo; no uses `*` en producción.

4. En `assets/app.js` cambia:

```js
const CONFIG = {
  mode: "api",
  apiBaseUrl: "https://tudominio.com/wp-json/cpp-crm-dashboard/v1",
  apiToken: "TOKEN_LARGO_Y_SEGURO",
  currency: "USD"
};
```

Si quieres soles peruanos, usa `currency: "PEN"`.

El plugin acepta el token únicamente mediante la cabecera
`X-CPP-CRM-Dashboard-Token`; no lo agregues a la URL. El endpoint de pedidos usa
páginas de hasta 100 registros, caché de 60 segundos e invalida la caché cuando
cambia un pedido. La actualización automática está desactivada inicialmente y,
si se activa, utiliza un intervalo mínimo de 5 minutos.

## Email Marketing profesional

El módulo incluye compositor visual/HTML, vista previa en escritorio y móvil,
código fuente descargable, texto plano, plantillas, variables personalizadas,
segmentos, A/B, blacklist, autoguardado, envío de prueba, programación y envío
mediante Brevo.

Para usar Brevo de forma segura, actualiza el plugin incluido en
`wordpress-plugin/cpp-dashboard-crm-api` y agrega en `wp-config.php`:

```php
define('CPP_BREVO_API_KEY', 'TU_API_KEY_DE_BREVO');
define('CPP_BREVO_SENDER_NAME', 'Tu empresa');
define('CPP_BREVO_SENDER_EMAIL', 'correo-verificado@tudominio.com');
```

El dashboard enviará la clave únicamente desde WordPress; no es necesario
publicarla en el JavaScript del sitio.

## Nota sobre el globo

WooCommerce normalmente guarda país y ciudad de facturación, pero no latitud/longitud exacta. Esta versión usa coordenadas por país. Si luego quieres precisión por ciudad, se puede ampliar con geocoding o una tabla de coordenadas.
