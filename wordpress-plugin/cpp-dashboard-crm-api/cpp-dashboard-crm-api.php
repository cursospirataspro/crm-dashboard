<?php
/**
 * Plugin Name:  CPP CRM Dashboard API for WooCommerce
 * Description:  Endpoint seguro para el dashboard CRM global. Expone pedidos, clientes, país, ciudad, cursos y métricas de WooCommerce.
 * Version:      2.1.0
 * Author:       Cursos Dashboard
 * Requires PHP: 7.4
 * WC requires at least: 5.0
 * WC tested up to: 9.0
 */

if ( ! defined( 'ABSPATH' ) ) exit;

// ─────────────────────────────────────────────────────────────
// Compatibilidad con HPOS (High Performance Order Storage)
// ─────────────────────────────────────────────────────────────
add_action( 'before_woocommerce_init', function () {
    if ( class_exists( \Automattic\WooCommerce\Utilities\FeaturesUtil::class ) ) {
        \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility(
            'custom_order_tables',
            __FILE__,
            true
        );
    }
} );

// ─────────────────────────────────────────────────────────────
// Cabeceras CORS — permite peticiones desde cualquier origen
// (necesario para abrir el dashboard como archivo local)
// ─────────────────────────────────────────────────────────────
// Manejo preflight OPTIONS (debe ir ANTES de rest_api_init)
add_action( 'init', function () {
    if ( $_SERVER['REQUEST_METHOD'] === 'OPTIONS' ) {
        header( 'Access-Control-Allow-Origin: *' );
        header( 'Access-Control-Allow-Methods: GET, POST, OPTIONS' );
        header( 'Access-Control-Allow-Headers: X-CPP-CRM-Dashboard-Token, Content-Type, Authorization' );
        header( 'Access-Control-Max-Age: 86400' );
        status_header( 200 );
        exit;
    }
} );

add_action( 'rest_api_init', function () {
    remove_filter( 'rest_pre_serve_request', 'rest_send_cors_headers' );
    add_filter( 'rest_pre_serve_request', function ( $value ) {
        header( 'Access-Control-Allow-Origin: *' );
        header( 'Access-Control-Allow-Methods: GET, POST, OPTIONS' );
        header( 'Access-Control-Allow-Headers: X-CPP-CRM-Dashboard-Token, Content-Type, Authorization' );
        return $value;
    } );
}, 15 );

// ─────────────────────────────────────────────────────────────
// Registro de la ruta REST
// ─────────────────────────────────────────────────────────────
add_action( 'rest_api_init', function () {
    register_rest_route( 'cpp-crm-dashboard/v1', '/overview', [
        'methods'             => 'GET',
        'callback'            => 'cpp_crm_dashboard_overview',
        'permission_callback' => 'cpp_crm_dashboard_check_token',
        'args' => [
            'from'  => [ 'required' => false, 'sanitize_callback' => 'sanitize_text_field' ],
            'to'    => [ 'required' => false, 'sanitize_callback' => 'sanitize_text_field' ],
            'limit' => [ 'required' => false, 'sanitize_callback' => 'absint' ],
            'page'  => [ 'required' => false, 'sanitize_callback' => 'absint' ],
        ],
    ] );
} );

// ─────────────────────────────────────────────────────────────
// Verificación del token de acceso
// ─────────────────────────────────────────────────────────────
function cpp_crm_dashboard_check_token( WP_REST_Request $request ) {
    if ( ! defined( 'CPP_CRM_DASHBOARD_TOKEN' ) || ! CPP_CRM_DASHBOARD_TOKEN ) {
        return new WP_Error(
            'token_missing',
            'Define CPP_CRM_DASHBOARD_TOKEN en wp-config.php.',
            [ 'status' => 500 ]
        );
    }

    $incoming = $request->get_header( 'x-cpp-crm-dashboard-token' );
    if ( ! $incoming ) {
        $incoming = $request->get_param( 'token' );
    }

    if ( ! $incoming || ! hash_equals( (string) CPP_CRM_DASHBOARD_TOKEN, (string) $incoming ) ) {
        return new WP_Error( 'forbidden', 'Token inválido.', [ 'status' => 403 ] );
    }

    return true;
}

// ─────────────────────────────────────────────────────────────
// Helper: nombre de país desde código ISO
// ─────────────────────────────────────────────────────────────
function cpp_crm_country_name( $code ) {
    if ( ! $code ) return '';
    $countries = WC()->countries ? WC()->countries->get_countries() : [];
    return isset( $countries[ $code ] ) ? html_entity_decode( $countries[ $code ], ENT_QUOTES, 'UTF-8' ) : $code;
}

// ─────────────────────────────────────────────────────────────
// Helper: normalizar estado (quita prefijo wc-)
// ─────────────────────────────────────────────────────────────
function cpp_crm_normalize_status( $status ) {
    return preg_replace( '/^wc-/', '', (string) $status );
}

// ─────────────────────────────────────────────────────────────
// Endpoint principal
// ─────────────────────────────────────────────────────────────
function cpp_crm_dashboard_overview( WP_REST_Request $request ) {
    if ( ! class_exists( 'WooCommerce' ) ) {
        return new WP_Error( 'woocommerce_missing', 'WooCommerce no está activo.', [ 'status' => 500 ] );
    }

    // Parámetros de fecha y paginación
    $from     = sanitize_text_field( $request->get_param( 'from' ) ?: gmdate( 'Y-m-d', strtotime( '-30 days' ) ) );
    $to       = sanitize_text_field( $request->get_param( 'to' )   ?: gmdate( 'Y-m-d' ) );
    $limit    = $request->get_param( 'limit' ) ? min( absint( $request->get_param( 'limit' ) ), 500 ) : 500;
    $page     = $request->get_param( 'page' )  ? max( 1, absint( $request->get_param( 'page' ) ) ) : 1;

    // Validar formato de fecha
    if ( ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $from ) ) $from = gmdate( 'Y-m-d', strtotime( '-30 days' ) );
    if ( ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $to ) )   $to   = gmdate( 'Y-m-d' );

    // Rango de fechas inclusivo (inicio del día "from" → final del día "to")
    $date_range = $from . 'T00:00:00' . '...' . $to . 'T23:59:59';

    // Contar total de pedidos en el rango (para paginación)
    $total_count = wc_get_orders( [
        'limit'        => -1,
        'return'       => 'ids',
        'status'       => [ 'completed', 'processing', 'pending', 'cancelled', 'refunded', 'on-hold' ],
        'date_created' => $date_range,
        'count_total'  => true,
    ] );
    $total_orders = is_array( $total_count ) ? count( $total_count ) : 0;
    $total_pages  = $limit > 0 ? (int) ceil( $total_orders / $limit ) : 1;

    $orders = wc_get_orders( [
        'limit'        => $limit,
        'paged'        => $page,
        'orderby'      => 'date',
        'order'        => 'DESC',
        'status'       => [ 'completed', 'processing', 'pending', 'cancelled', 'refunded', 'on-hold' ],
        'date_created' => $date_range,
        'return'       => 'objects',
    ] );

    $normalized = [];

    foreach ( $orders as $order ) {
        if ( ! $order instanceof WC_Order ) continue; // skip WC_Order_Refund y otros

        $products      = [];
        foreach ( $order->get_items() as $item ) {
            $products[] = [
                'name'       => $item->get_name(),
                'quantity'   => (int) $item->get_quantity(),
                'total'      => (float) $item->get_total(),
                'product_id' => (int) $item->get_product_id(),
            ];
        }

        $country_code = (string) $order->get_billing_country();
        $city         = (string) $order->get_billing_city();
        $first        = (string) $order->get_billing_first_name();
        $last         = (string) $order->get_billing_last_name();
        $name         = trim( $first . ' ' . $last );
        if ( ! $name ) $name = 'Cliente #' . $order->get_customer_id();

        $normalized[] = [
            'id'             => $order->get_id(),
            'number'         => '#' . $order->get_order_number(),
            'date'           => $order->get_date_created() ? $order->get_date_created()->date( 'c' ) : '',
            'customer'       => $name,
            'customer_email' => (string) $order->get_billing_email(),
            'status'         => cpp_crm_normalize_status( $order->get_status() ),
            'total'          => (float) $order->get_total(),
            'net_total'      => (float) ( $order->get_subtotal() - $order->get_discount_total() ),
            'payment_method' => $order->get_payment_method_title() ?: (string) $order->get_payment_method(),
            'country_code'   => $country_code,
            'country'        => cpp_crm_country_name( $country_code ),
            'city'           => $city,
            'products'       => $products,
        ];
    }

    return rest_ensure_response( [
        'site'         => get_bloginfo( 'name' ),
        'from'         => $from,
        'to'           => $to,
        'total'        => count( $normalized ),
        'total_orders' => $total_orders,
        'total_pages'  => $total_pages,
        'current_page' => $page,
        'per_page'     => $limit,
        'orders'       => $normalized,
        'generated_at' => gmdate( 'c' ),
    ] );
}

// =============================================================
// PAYPAL API PROXY
// Endpoints: /paypal/summary  /paypal/transactions
// Define en wp-config.php:
//   define('CPP_PAYPAL_CLIENT_ID',     'TU_CLIENT_ID_LIVE');
//   define('CPP_PAYPAL_CLIENT_SECRET', 'TU_SECRET_LIVE');
// =============================================================

add_action( 'rest_api_init', function () {
    $base_args = [
        'methods'             => 'GET',
        'permission_callback' => 'cpp_crm_dashboard_check_token',
    ];

    register_rest_route( 'cpp-crm-dashboard/v1', '/paypal/summary', array_merge( $base_args, [
        'callback' => 'cpp_paypal_summary',
        'args'     => [
            'from' => [ 'required' => false, 'sanitize_callback' => 'sanitize_text_field' ],
            'to'   => [ 'required' => false, 'sanitize_callback' => 'sanitize_text_field' ],
        ],
    ] ) );

    register_rest_route( 'cpp-crm-dashboard/v1', '/paypal/transactions', array_merge( $base_args, [
        'callback' => 'cpp_paypal_transactions',
        'args'     => [
            'from' => [ 'required' => false, 'sanitize_callback' => 'sanitize_text_field' ],
            'to'   => [ 'required' => false, 'sanitize_callback' => 'sanitize_text_field' ],
            'page' => [ 'required' => false, 'sanitize_callback' => 'absint' ],
        ],
    ] ) );
} );

function cpp_paypal_get_token() {
    if ( ! defined('CPP_PAYPAL_CLIENT_ID') || ! defined('CPP_PAYPAL_CLIENT_SECRET') ) {
        return new WP_Error('paypal_no_config', 'Define CPP_PAYPAL_CLIENT_ID y CPP_PAYPAL_CLIENT_SECRET en wp-config.php');
    }

    $cached = get_transient('cpp_paypal_access_token');
    if ( $cached ) return $cached;

    $response = wp_remote_post( 'https://api-m.paypal.com/v1/oauth2/token', [
        'headers' => [
            'Authorization' => 'Basic ' . base64_encode( CPP_PAYPAL_CLIENT_ID . ':' . CPP_PAYPAL_CLIENT_SECRET ),
            'Content-Type'  => 'application/x-www-form-urlencoded',
        ],
        'body'    => 'grant_type=client_credentials',
        'timeout' => 15,
        'sslverify' => true,
    ] );

    if ( is_wp_error($response) ) return $response;

    $body = json_decode( wp_remote_retrieve_body($response), true );
    if ( empty($body['access_token']) ) {
        return new WP_Error('paypal_token_error', 'Error obteniendo token PayPal: ' . wp_remote_retrieve_body($response));
    }

    $expires = max(60, intval($body['expires_in'] ?? 3600) - 60);
    set_transient('cpp_paypal_access_token', $body['access_token'], $expires);
    return $body['access_token'];
}

function cpp_paypal_fetch_transactions( $from, $to, $page = 1 ) {
    $token = cpp_paypal_get_token();
    if ( is_wp_error($token) ) return $token;

    $url = add_query_arg( [
        'start_date'         => $from . 'T00:00:00-0000',
        'end_date'           => $to   . 'T23:59:59-0000',
        'transaction_status' => 'S',
        'page_size'          => 500,
        'page'               => $page,
        'fields'             => 'all',
    ], 'https://api-m.paypal.com/v1/reporting/transactions' );

    $response = wp_remote_get( $url, [
        'headers' => [
            'Authorization' => 'Bearer ' . $token,
            'Content-Type'  => 'application/json',
        ],
        'timeout'   => 20,
        'sslverify' => true,
    ] );

    if ( is_wp_error($response) ) return $response;
    return json_decode( wp_remote_retrieve_body($response), true );
}

function cpp_paypal_transactions( WP_REST_Request $request ) {
    $from = $request->get_param('from') ?: date('Y-m-d', strtotime('-30 days'));
    $to   = $request->get_param('to')   ?: date('Y-m-d');
    $page = max(1, intval($request->get_param('page') ?: 1));

    $data = cpp_paypal_fetch_transactions( $from, $to, $page );
    if ( is_wp_error($data) ) return $data;

    $txns = $data['transaction_details'] ?? [];

    $result = array_map( function($t) {
        $info  = $t['transaction_info'] ?? [];
        $payer = $t['payer_info']       ?? [];
        $name  = $payer['payer_name']['alternate_full_name'] ?? ($payer['email_address'] ?? 'Desconocido');
        $amt   = floatval($info['transaction_amount']['value'] ?? 0);
        $fee   = floatval($info['fee_amount']['value']         ?? 0);
        return [
            'id'          => $info['transaction_id']                          ?? '',
            'date'        => $info['transaction_initiation_date']             ?? '',
            'amount'      => $amt,
            'fee'         => abs($fee),
            'net'         => $amt - abs($fee),
            'currency'    => $info['transaction_amount']['currency_code']     ?? 'USD',
            'status'      => $info['transaction_status']                      ?? '',
            'subject'     => $info['transaction_subject']                     ?? '',
            'payer_name'  => $name,
            'payer_email' => $payer['email_address']                          ?? '',
            'country'     => $payer['address']['country_code']                ?? '',
        ];
    }, $txns );

    return rest_ensure_response( [
        'transactions' => $result,
        'total_items'  => intval($data['total_items']  ?? count($result)),
        'total_pages'  => intval($data['total_pages']  ?? 1),
        'page'         => $page,
    ] );
}

function cpp_paypal_summary( WP_REST_Request $request ) {
    $from = $request->get_param('from') ?: date('Y-m-d', strtotime('-30 days'));
    $to   = $request->get_param('to')   ?: date('Y-m-d');

    $data = cpp_paypal_fetch_transactions( $from, $to, 1 );
    if ( is_wp_error($data) ) return $data;

    $txns = $data['transaction_details'] ?? [];

    $total_gross = 0;
    $total_fees  = 0;
    $count       = 0;
    $by_country  = [];
    $by_customer = [];
    $by_day      = [];

    foreach ($txns as $t) {
        $info    = $t['transaction_info'] ?? [];
        $payer   = $t['payer_info']       ?? [];
        $amt     = floatval($info['transaction_amount']['value'] ?? 0);
        $fee     = floatval($info['fee_amount']['value']         ?? 0);
        $date    = substr($info['transaction_initiation_date'] ?? '', 0, 10);
        $country = $payer['address']['country_code']  ?? 'XX';
        $email   = $payer['email_address']            ?? 'desconocido';
        $name    = $payer['payer_name']['alternate_full_name'] ?? $email;

        $total_gross += $amt;
        $total_fees  += abs($fee);
        $count++;

        $by_country[$country] = round(($by_country[$country] ?? 0) + $amt, 2);

        if ( ! isset($by_customer[$email]) ) {
            $by_customer[$email] = [ 'name' => $name, 'email' => $email, 'total' => 0, 'orders' => 0 ];
        }
        $by_customer[$email]['total']  = round($by_customer[$email]['total'] + $amt, 2);
        $by_customer[$email]['orders'] += 1;

        $by_day[$date] = round(($by_day[$date] ?? 0) + $amt, 2);
    }

    arsort($by_country);
    uasort($by_customer, function($a, $b) { return $b['total'] <=> $a['total']; });
    ksort($by_day);

    return rest_ensure_response( [
        'total_gross'   => round($total_gross, 2),
        'total_fees'    => round($total_fees,  2),
        'total_net'     => round($total_gross - $total_fees, 2),
        'count'         => $count,
        'avg_order'     => $count ? round($total_gross / $count, 2) : 0,
        'by_country'    => $by_country,
        'top_customers' => array_values(array_slice($by_customer, 0, 20)),
        'by_day'        => $by_day,
        'period'        => [ 'from' => $from, 'to' => $to ],
    ] );
}

// =============================================================
// BREVO EMAIL PROXY
// =============================================================
add_action( 'rest_api_init', function () {
    register_rest_route( 'cpp-crm-dashboard/v1', '/brevo/test', [
        'methods'             => 'GET',
        'callback'            => 'cpp_brevo_test',
        'permission_callback' => 'cpp_crm_dashboard_check_token',
    ] );
    register_rest_route( 'cpp-crm-dashboard/v1', '/brevo/send', [
        'methods'             => 'POST',
        'callback'            => 'cpp_brevo_send',
        'permission_callback' => 'cpp_crm_dashboard_check_token',
    ] );
} );

function cpp_brevo_get_config() {
    return [
        'api_key'      => defined('CPP_BREVO_API_KEY')      ? CPP_BREVO_API_KEY      : '',
        'sender_name'  => defined('CPP_BREVO_SENDER_NAME')  ? CPP_BREVO_SENDER_NAME  : 'CRM Dashboard',
        'sender_email' => defined('CPP_BREVO_SENDER_EMAIL') ? CPP_BREVO_SENDER_EMAIL : '',
    ];
}

function cpp_brevo_test( WP_REST_Request $request ) {
    $cfg = cpp_brevo_get_config();
    if ( empty($cfg['api_key']) ) {
        return new WP_Error( 'brevo_no_key', 'CPP_BREVO_API_KEY no definida en wp-config.php', [ 'status' => 500 ] );
    }
    $response = wp_remote_get( 'https://api.brevo.com/v3/account', [
        'headers' => [
            'api-key' => $cfg['api_key'],
            'Accept'  => 'application/json',
        ],
        'timeout' => 15,
    ] );
    if ( is_wp_error($response) ) {
        return new WP_Error( 'brevo_error', $response->get_error_message(), [ 'status' => 502 ] );
    }
    $body = json_decode( wp_remote_retrieve_body($response), true );
    $code = wp_remote_retrieve_response_code($response);
    if ( $code !== 200 ) {
        return new WP_Error( 'brevo_error', $body['message'] ?? 'Error desconocido', [ 'status' => $code ] );
    }
    return rest_ensure_response( [
        'success' => true,
        'account' => $body['email'] ?? '',
        'plan'    => $body['plan'][0]['type'] ?? '',
    ] );
}

function cpp_brevo_send( WP_REST_Request $request ) {
    $cfg = cpp_brevo_get_config();
    if ( empty($cfg['api_key']) ) {
        return new WP_Error( 'brevo_no_key', 'CPP_BREVO_API_KEY no definida en wp-config.php', [ 'status' => 500 ] );
    }
    $to_email    = sanitize_email( $request->get_param('to_email') );
    $to_name     = sanitize_text_field( $request->get_param('to_name') );
    $subject     = sanitize_text_field( $request->get_param('subject') );
    $html        = wp_kses_post( $request->get_param('html_content') );

    if ( ! $to_email || ! $subject || ! $html ) {
        return new WP_Error( 'brevo_missing', 'Faltan campos: to_email, subject, html_content', [ 'status' => 400 ] );
    }

    $payload = [
        'sender'      => [ 'name' => $cfg['sender_name'], 'email' => $cfg['sender_email'] ],
        'to'          => [ [ 'email' => $to_email, 'name' => $to_name ?: $to_email ] ],
        'subject'     => $subject,
        'htmlContent' => $html,
    ];

    $response = wp_remote_post( 'https://api.brevo.com/v3/smtp/email', [
        'headers' => [
            'api-key'      => $cfg['api_key'],
            'Content-Type' => 'application/json',
            'Accept'       => 'application/json',
        ],
        'body'    => wp_json_encode($payload),
        'timeout' => 20,
    ] );

    if ( is_wp_error($response) ) {
        return new WP_Error( 'brevo_error', $response->get_error_message(), [ 'status' => 502 ] );
    }
    $body = json_decode( wp_remote_retrieve_body($response), true );
    $code = wp_remote_retrieve_response_code($response);
    if ( $code >= 400 ) {
        return new WP_Error( 'brevo_send_error', $body['message'] ?? 'Error al enviar', [ 'status' => $code ] );
    }
    return rest_ensure_response( [ 'success' => true, 'messageId' => $body['messageId'] ?? '' ] );
}

