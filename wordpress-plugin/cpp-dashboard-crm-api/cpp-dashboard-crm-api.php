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
add_action( 'rest_api_init', function () {
    remove_filter( 'rest_pre_serve_request', 'rest_send_cors_headers' );
    add_filter( 'rest_pre_serve_request', function ( $value ) {
        header( 'Access-Control-Allow-Origin: *' );
        header( 'Access-Control-Allow-Methods: GET, OPTIONS' );
        header( 'Access-Control-Allow-Headers: X-CPP-CRM-Dashboard-Token, Content-Type' );
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

    // Parámetros de fecha
    $from  = sanitize_text_field( $request->get_param( 'from' ) ?: gmdate( 'Y-m-d', strtotime( '-30 days' ) ) );
    $to    = sanitize_text_field( $request->get_param( 'to' )   ?: gmdate( 'Y-m-d' ) );
    $limit = $request->get_param( 'limit' ) ? min( absint( $request->get_param( 'limit' ) ), 1000 ) : 500;

    // Validar formato de fecha
    if ( ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $from ) ) $from = gmdate( 'Y-m-d', strtotime( '-30 days' ) );
    if ( ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $to ) )   $to   = gmdate( 'Y-m-d' );

    // Rango de fechas inclusivo (inicio del día "from" → final del día "to")
    $date_range = $from . 'T00:00:00' . '...' . $to . 'T23:59:59';

    $orders = wc_get_orders( [
        'limit'        => $limit,
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
        'orders'       => $normalized,
        'generated_at' => gmdate( 'c' ),
    ] );
}