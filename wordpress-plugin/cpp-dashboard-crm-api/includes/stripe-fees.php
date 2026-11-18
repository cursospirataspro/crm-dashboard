<?php
/**
 * Comisión real de Stripe para los pedidos que no la tienen guardada.
 *
 * El plugin de pagos guarda la comisión en el pedido (`_stripe_fee`), pero algunos
 * cobros no la traen. Con una clave RESTRINGIDA de sólo lectura se consulta a Stripe
 * la comisión del cobro y se guarda en el pedido (`_cpp_crm_stripe_fee`), para no
 * volver a preguntar. Nunca se modifica el importe, el estado ni nada visible al cliente.
 */

if ( ! defined( 'ABSPATH' ) ) exit;

/** Máximo de consultas a Stripe por petición del dashboard (el resto se resuelve en la siguiente). */
const CPP_CRM_STRIPE_LOOKUPS_PER_REQUEST = 12;
/** Tiempo total máximo dedicado a Stripe en una petición, en segundos. */
const CPP_CRM_STRIPE_TIME_BUDGET = 10;
/** Tras un fallo no se reintenta ese pedido hasta pasadas estas horas. */
const CPP_CRM_STRIPE_RETRY_HOURS = 12;

/** Clave restringida de Stripe: constante de wp-config.php o el ajuste guardado. */
function cpp_crm_stripe_key() {
    if ( defined( 'CPP_STRIPE_RESTRICTED_KEY' ) && CPP_STRIPE_RESTRICTED_KEY ) {
        return (string) CPP_STRIPE_RESTRICTED_KEY;
    }
    return (string) get_option( 'cpp_crm_stripe_key', '' );
}

/** Sólo se aceptan claves restringidas (rk_…): una clave secreta completa (sk_…) daría acceso de escritura. */
function cpp_crm_stripe_key_is_valid( $key ) {
    return 1 === preg_match( '/^rk_(live|test)_[A-Za-z0-9]{20,250}$/', (string) $key );
}

/**
 * Identificador del cobro en Stripe guardado en el pedido: PaymentIntent (pi_…) o
 * cargo (ch_… / py_…). Cadena vacía si el pedido no guarda ninguno.
 */
function cpp_crm_stripe_order_reference( $order ) {
    $candidates = [ (string) $order->get_transaction_id() ];
    foreach ( [ '_stripe_charge_id', '_stripe_intent_id', '_payment_intent_id', '_transaction_id',
                '_cpp_hist_stripe_charge_id', '_cpp_hist_stripe_intent_id', '_cpp_hist_transaction_id' ] as $key ) {
        $candidates[] = (string) $order->get_meta( $key, true );
    }
    // Se prefiere el cargo: una sola llamada basta para llegar a su comisión.
    foreach ( [ '/^(ch|py)_[A-Za-z0-9]{8,}$/', '/^pi_[A-Za-z0-9]{8,}$/' ] as $pattern ) {
        foreach ( $candidates as $candidate ) {
            $candidate = trim( $candidate );
            if ( 1 === preg_match( $pattern, $candidate ) ) {
                return $candidate;
            }
        }
    }
    return '';
}

/**
 * Pregunta a Stripe la comisión de un cobro.
 *
 * @return array{fee:float,net:float,currency:string}|WP_Error
 */
function cpp_crm_stripe_fetch_fee( $reference, $key ) {
    if ( 0 === strpos( $reference, 'pi_' ) ) {
        $url = 'https://api.stripe.com/v1/payment_intents/' . rawurlencode( $reference )
            . '?expand[]=latest_charge.balance_transaction';
    } else {
        $url = 'https://api.stripe.com/v1/charges/' . rawurlencode( $reference )
            . '?expand[]=balance_transaction';
    }
    $response = wp_remote_get( $url, [
        'timeout' => 8,
        'headers' => [ 'Authorization' => 'Bearer ' . $key ],
    ] );
    if ( is_wp_error( $response ) ) {
        return new WP_Error( 'stripe_network', 'No se pudo contactar con Stripe.' );
    }
    $status = (int) wp_remote_retrieve_response_code( $response );
    $body   = json_decode( (string) wp_remote_retrieve_body( $response ), true );
    if ( 200 !== $status || ! is_array( $body ) ) {
        // Mensaje de Stripe sin datos sensibles: indica, por ejemplo, qué permiso falta.
        $message = is_array( $body ) && isset( $body['error']['message'] ) ? (string) $body['error']['message'] : '';
        return new WP_Error( 'stripe_http_' . $status, 'Stripe respondió ' . $status . ( '' !== $message ? ': ' . $message : '' ) );
    }
    $charge = 0 === strpos( $reference, 'pi_' ) ? ( $body['latest_charge'] ?? null ) : $body;
    $txn    = is_array( $charge ) ? ( $charge['balance_transaction'] ?? null ) : null;
    if ( ! is_array( $txn ) || ! isset( $txn['fee'], $txn['net'], $txn['currency'] ) ) {
        return new WP_Error( 'stripe_no_balance', 'El cobro aún no tiene movimiento de saldo en Stripe.' );
    }
    $currency = strtoupper( (string) $txn['currency'] );
    // Las monedas sin decimales (JPY, KRW…) no vienen en céntimos.
    $zero_decimal = in_array( $currency, [ 'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF' ], true );
    $divisor      = $zero_decimal ? 1 : 100;
    return [
        'fee'      => round( (float) $txn['fee'] / $divisor, 2 ),
        'net'      => round( (float) $txn['net'] / $divisor, 2 ),
        'currency' => $currency,
    ];
}

/**
 * Si el pedido se pagó con Stripe y no tiene comisión guardada, la consulta y la guarda.
 * Respeta un tope de consultas y de tiempo por petición.
 *
 * @return array{fee:float,net:float,currency:string}|null
 */
function cpp_crm_stripe_resolve_missing_fee( $order ) {
    static $lookups = 0;
    static $started = null;

    $key = cpp_crm_stripe_key();
    if ( ! cpp_crm_stripe_key_is_valid( $key ) ) {
        return null;
    }
    if ( ! in_array( $order->get_status(), [ 'completed', 'processing', 'refunded' ], true ) || (float) $order->get_total() <= 0 ) {
        return null;
    }
    $checked = (int) $order->get_meta( '_cpp_crm_stripe_fee_checked', true );
    if ( $checked && ( time() - $checked ) < CPP_CRM_STRIPE_RETRY_HOURS * HOUR_IN_SECONDS ) {
        return null;
    }
    $reference = cpp_crm_stripe_order_reference( $order );
    if ( '' === $reference ) {
        return null;
    }
    if ( null === $started ) {
        $started = microtime( true );
    }
    if ( $lookups >= CPP_CRM_STRIPE_LOOKUPS_PER_REQUEST || ( microtime( true ) - $started ) > CPP_CRM_STRIPE_TIME_BUDGET ) {
        return null;
    }
    $lookups++;

    $result = cpp_crm_stripe_fetch_fee( $reference, $key );
    if ( is_wp_error( $result ) ) {
        $order->update_meta_data( '_cpp_crm_stripe_fee_checked', time() );
        $order->save_meta_data();
        update_option( 'cpp_crm_stripe_last_error', $result->get_error_message(), false );
        return null;
    }
    $order->update_meta_data( '_cpp_crm_stripe_fee', $result['fee'] );
    $order->update_meta_data( '_cpp_crm_stripe_net', $result['net'] );
    $order->update_meta_data( '_cpp_crm_stripe_currency', $result['currency'] );
    $order->delete_meta_data( '_cpp_crm_stripe_fee_checked' );
    $order->save_meta_data();
    delete_option( 'cpp_crm_stripe_last_error' );
    return $result;
}

/**
 * Resumen para la pantalla de ajustes: pedidos de Stripe de los últimos 90 días
 * sin comisión guardada y cuántos traen el identificador del cobro.
 *
 * @return array{total:int,missing:int,with_reference:int,resolved:int}
 */
function cpp_crm_stripe_diagnostics() {
    $summary = [ 'total' => 0, 'missing' => 0, 'with_reference' => 0, 'resolved' => 0 ];
    if ( ! function_exists( 'wc_get_orders' ) ) {
        return $summary;
    }
    $orders = wc_get_orders( [
        'limit'        => 600,
        'status'       => [ 'wc-completed', 'wc-processing', 'wc-refunded' ],
        'date_created' => '>' . ( time() - 90 * DAY_IN_SECONDS ),
        'orderby'      => 'date',
        'order'        => 'DESC',
    ] );
    foreach ( $orders as $order ) {
        if ( 0 !== strpos( strtolower( (string) $order->get_payment_method() ), 'stripe' ) ) {
            continue;
        }
        $summary['total']++;
        if ( '' !== (string) $order->get_meta( '_cpp_crm_stripe_fee', true ) ) {
            $summary['resolved']++;
            continue;
        }
        if ( '' !== (string) $order->get_meta( '_stripe_fee', true ) || '' !== (string) $order->get_meta( '_cpp_hist_stripe_fee', true ) ) {
            continue;
        }
        $summary['missing']++;
        if ( '' !== cpp_crm_stripe_order_reference( $order ) ) {
            $summary['with_reference']++;
        }
    }
    return $summary;
}
