<?php
/**
 * Automatizaciones de Email Marketing para Brevo.
 *
 * Las automatizaciones se guardan pausadas por defecto. WP-Cron procesa solo
 * las que el usuario activa expresamente desde el dashboard.
 */

if ( ! defined( 'ABSPATH' ) ) exit;

const CPP_EMAIL_AUTOMATIONS_OPTION = 'cpp_crm_email_automations_v1';
const CPP_EMAIL_AUTOMATIONS_HOOK   = 'cpp_crm_email_automations_tick';

add_filter( 'cron_schedules', function ( $schedules ) {
    $schedules['cpp_every_five_minutes'] = [
        'interval' => 5 * MINUTE_IN_SECONDS,
        'display'  => 'Cada cinco minutos (CPP CRM)',
    ];
    return $schedules;
} );

function cpp_email_automations_activate() {
    if ( ! wp_next_scheduled( CPP_EMAIL_AUTOMATIONS_HOOK ) ) {
        wp_schedule_event( time() + MINUTE_IN_SECONDS, 'cpp_every_five_minutes', CPP_EMAIL_AUTOMATIONS_HOOK );
    }
}

function cpp_email_automations_deactivate() {
    wp_clear_scheduled_hook( CPP_EMAIL_AUTOMATIONS_HOOK );
}

add_action( 'init', function () {
    // Repara la agenda si WordPress eliminó el evento o el plugin se actualizó.
    if ( ! wp_next_scheduled( CPP_EMAIL_AUTOMATIONS_HOOK ) ) {
        wp_schedule_event( time() + MINUTE_IN_SECONDS, 'cpp_every_five_minutes', CPP_EMAIL_AUTOMATIONS_HOOK );
    }
} );

add_action( CPP_EMAIL_AUTOMATIONS_HOOK, 'cpp_email_automations_tick' );

add_action( 'rest_api_init', function () {
    $permission = 'cpp_crm_dashboard_check_token';
    register_rest_route( 'cpp-crm-dashboard/v1', '/email-automations', [
        'methods'             => 'GET',
        'callback'            => 'cpp_email_automations_rest_list',
        'permission_callback' => $permission,
    ] );
    register_rest_route( 'cpp-crm-dashboard/v1', '/email-automations/save', [
        'methods'             => 'POST',
        'callback'            => 'cpp_email_automations_rest_save',
        'permission_callback' => $permission,
    ] );
    register_rest_route( 'cpp-crm-dashboard/v1', '/email-automations/select-next', [
        'methods'             => 'POST',
        'callback'            => 'cpp_email_automations_rest_select_next',
        'permission_callback' => $permission,
    ] );
    register_rest_route( 'cpp-crm-dashboard/v1', '/email-automations/delete', [
        'methods'             => 'POST',
        'callback'            => 'cpp_email_automations_rest_delete',
        'permission_callback' => $permission,
    ] );
    register_rest_route( 'cpp-crm-dashboard/v1', '/email-automations/mark-sent', [
        'methods'             => 'POST',
        'callback'            => 'cpp_email_automations_rest_mark_sent',
        'permission_callback' => $permission,
    ] );
    register_rest_route( 'cpp-crm-dashboard/v1', '/email-automations/run', [
        'methods'             => 'POST',
        'callback'            => 'cpp_email_automations_rest_run',
        'permission_callback' => $permission,
    ] );
} );

function cpp_email_automations_get_all() {
    $items = get_option( CPP_EMAIL_AUTOMATIONS_OPTION, [] );
    return is_array( $items ) ? $items : [];
}

function cpp_email_automations_put_all( $items ) {
    return update_option( CPP_EMAIL_AUTOMATIONS_OPTION, array_values( $items ), false );
}

function cpp_email_automation_find_index( $items, $id ) {
    foreach ( $items as $index => $item ) {
        if ( isset( $item['id'] ) && hash_equals( (string) $item['id'], (string) $id ) ) return $index;
    }
    return -1;
}

function cpp_email_automation_interval_seconds( $automation ) {
    $cadence = $automation['cadence'] ?? 'daily';
    if ( 'two_days' === $cadence ) return 2 * DAY_IN_SECONDS;
    if ( 'custom' === $cadence ) {
        $hours = max( 1, min( 720, absint( $automation['interval_hours'] ?? 24 ) ) );
        return $hours * HOUR_IN_SECONDS;
    }
    return DAY_IN_SECONDS;
}

function cpp_email_automation_next_run( $automation, $from = null ) {
    $from = $from ?: time();
    return gmdate( 'c', $from + cpp_email_automation_interval_seconds( $automation ) );
}

function cpp_email_automation_sanitize_recipients( $raw ) {
    $result = [];
    $seen   = [];
    if ( ! is_array( $raw ) ) return $result;
    foreach ( array_slice( $raw, 0, 5000 ) as $recipient ) {
        if ( ! is_array( $recipient ) ) continue;
        $email = strtolower( sanitize_email( $recipient['email'] ?? '' ) );
        if ( ! $email || isset( $seen[ $email ] ) ) continue;
        $seen[ $email ] = true;
        $result[] = [
            'email' => $email,
            'name'  => sanitize_text_field( $recipient['name'] ?? $email ),
        ];
    }
    return $result;
}

function cpp_email_automation_public( $automation, $include_recipients = false ) {
    $sent = is_array( $automation['sent'] ?? null ) ? $automation['sent'] : [];
    $recipients = is_array( $automation['recipients'] ?? null ) ? $automation['recipients'] : [];
    $public = [
        'id'                      => $automation['id'] ?? '',
        'name'                    => $automation['name'] ?? '',
        'course_name'             => $automation['course_name'] ?? '',
        'enabled'                 => ! empty( $automation['enabled'] ),
        'cadence'                 => $automation['cadence'] ?? 'daily',
        'interval_hours'          => absint( $automation['interval_hours'] ?? 24 ),
        'batch_size'              => absint( $automation['batch_size'] ?? 300 ),
        'include_previously_sent' => ! empty( $automation['include_previously_sent'] ),
        'recipient_count'         => count( $recipients ),
        'sent_count'              => count( $sent ),
        'pending_count'           => max( 0, count( $recipients ) - count( $sent ) ),
        'sent_emails'             => array_keys( $sent ),
        'next_run_at'             => $automation['next_run_at'] ?? null,
        'last_run_at'             => $automation['last_run_at'] ?? null,
        'last_status'             => $automation['last_status'] ?? 'Nunca ejecutada',
        'last_sent_count'         => absint( $automation['last_sent_count'] ?? 0 ),
        'created_at'              => $automation['created_at'] ?? null,
        'updated_at'              => $automation['updated_at'] ?? null,
        'subject_template'        => $automation['subject_template'] ?? '',
        'html_template'           => $automation['html_template'] ?? '',
        'text_template'           => $automation['text_template'] ?? '',
        'reply_to'                => $automation['reply_to'] ?? '',
        'tags'                    => $automation['tags'] ?? [],
    ];
    if ( $include_recipients ) $public['recipients'] = $recipients;
    return $public;
}

function cpp_email_automation_account_snapshot( $force = false ) {
    $cfg = cpp_brevo_get_config();
    if ( empty( $cfg['api_key'] ) ) {
        return new WP_Error( 'brevo_no_key', 'CPP_BREVO_API_KEY no definida en wp-config.php', [ 'status' => 500 ] );
    }
    if ( ! $force ) {
        $cached = get_transient( 'cpp_crm_brevo_account' );
        if ( false !== $cached && is_array( $cached ) ) return $cached;
    }
    $response = wp_remote_get( 'https://api.brevo.com/v3/account', [
        'headers' => [ 'api-key' => $cfg['api_key'], 'Accept' => 'application/json' ],
        'timeout' => 15,
    ] );
    if ( is_wp_error( $response ) ) return $response;
    $body = json_decode( wp_remote_retrieve_body( $response ), true );
    $code = wp_remote_retrieve_response_code( $response );
    if ( 200 !== $code ) {
        return new WP_Error( 'brevo_account_error', $body['message'] ?? 'No se pudo consultar la cuota de Brevo', [ 'status' => $code ] );
    }
    $plan = is_array( $body['plan'][0] ?? null ) ? $body['plan'][0] : [];
    $credits = max( 0, absint( $plan['credits'] ?? 0 ) );
    $used = max( 0, absint( $plan['creditsUsed'] ?? 0 ) );
    $data = [
        'success'     => true,
        'account'     => sanitize_email( $body['email'] ?? '' ),
        'plan'        => sanitize_text_field( $plan['type'] ?? '' ),
        'credits'     => $credits,
        'creditsUsed' => $used,
        'creditsLeft' => max( 0, $credits - $used ),
    ];
    set_transient( 'cpp_crm_brevo_account', $data, MINUTE_IN_SECONDS );
    return $data;
}

function cpp_email_automation_eligible( $automation, $limit, $quota ) {
    $recipients = is_array( $automation['recipients'] ?? null ) ? $automation['recipients'] : [];
    $sent       = is_array( $automation['sent'] ?? null ) ? $automation['sent'] : [];
    $include    = ! empty( $automation['include_previously_sent'] );
    $maximum    = max( 0, min( 1000, absint( $limit ), absint( $quota ) ) );
    if ( 0 === $maximum ) return [];
    $eligible = array_values( array_filter( $recipients, function ( $recipient ) use ( $sent, $include ) {
        return $include || ! isset( $sent[ strtolower( $recipient['email'] ) ] );
    } ) );
    return array_slice( $eligible, 0, $maximum );
}

function cpp_email_automations_rest_list( WP_REST_Request $request ) {
    $quota = cpp_email_automation_account_snapshot( false );
    return rest_ensure_response( [
        'success'     => true,
        'automations' => array_map( function ( $item ) { return cpp_email_automation_public( $item, true ); }, cpp_email_automations_get_all() ),
        'quota'       => is_wp_error( $quota ) ? null : $quota,
        'cron'        => [
            'scheduled' => (bool) wp_next_scheduled( CPP_EMAIL_AUTOMATIONS_HOOK ),
            'next_tick' => wp_next_scheduled( CPP_EMAIL_AUTOMATIONS_HOOK ) ?: null,
        ],
    ] );
}

function cpp_email_automations_rest_save( WP_REST_Request $request ) {
    $raw = $request->get_json_params();
    if ( ! is_array( $raw ) ) $raw = [];
    $items = cpp_email_automations_get_all();
    $id = sanitize_key( $raw['id'] ?? '' );
    $index = $id ? cpp_email_automation_find_index( $items, $id ) : -1;
    $existing = $index >= 0 ? $items[ $index ] : [];
    if ( ! $id ) $id = 'auto_' . strtolower( wp_generate_password( 12, false, false ) );

    $subject = sanitize_text_field( $raw['subject_template'] ?? '' );
    $html = cpp_brevo_sanitize_email_html( $raw['html_template'] ?? '' );
    $recipients = cpp_email_automation_sanitize_recipients( $raw['recipients'] ?? [] );
    if ( ! $subject || ! $html || ! $recipients ) {
        return new WP_Error( 'automation_missing', 'Completa asunto, contenido y al menos un destinatario.', [ 'status' => 400 ] );
    }

    $now = gmdate( 'c' );
    $enabled = ! empty( $raw['enabled'] );
    $automation = [
        'id'                      => $id,
        'name'                    => sanitize_text_field( $raw['name'] ?? 'Automatización de curso' ),
        'course_name'             => sanitize_text_field( $raw['course_name'] ?? '' ),
        'enabled'                 => $enabled,
        'cadence'                 => in_array( $raw['cadence'] ?? '', [ 'daily', 'two_days', 'custom' ], true ) ? $raw['cadence'] : 'daily',
        'interval_hours'          => max( 1, min( 720, absint( $raw['interval_hours'] ?? 24 ) ) ),
        'batch_size'              => max( 1, min( 1000, absint( $raw['batch_size'] ?? 300 ) ) ),
        'include_previously_sent' => ! empty( $raw['include_previously_sent'] ),
        'subject_template'        => $subject,
        'html_template'           => $html,
        'text_template'           => sanitize_textarea_field( $raw['text_template'] ?? '' ),
        'reply_to'                => sanitize_email( $raw['reply_to'] ?? '' ),
        'tags'                    => array_slice( array_values( array_filter( array_map( 'sanitize_key', (array) ( $raw['tags'] ?? [] ) ) ) ), 0, 10 ),
        'recipients'              => $recipients,
        'sent'                    => is_array( $existing['sent'] ?? null ) ? $existing['sent'] : [],
        'pending_run'             => is_array( $existing['pending_run'] ?? null ) ? $existing['pending_run'] : null,
        'last_run_at'             => $existing['last_run_at'] ?? null,
        'last_status'             => $existing['last_status'] ?? 'Nunca ejecutada',
        'last_sent_count'         => absint( $existing['last_sent_count'] ?? 0 ),
        'created_at'              => $existing['created_at'] ?? $now,
        'updated_at'              => $now,
    ];
    $requested_next = sanitize_text_field( $raw['next_run_at'] ?? '' );
    $requested_ts = $requested_next ? strtotime( $requested_next ) : false;
    $automation['next_run_at'] = $enabled
        ? ( $requested_ts && $requested_ts > time() ? gmdate( 'c', $requested_ts ) : cpp_email_automation_next_run( $automation ) )
        : null;

    if ( $index >= 0 ) $items[ $index ] = $automation;
    else $items[] = $automation;
    cpp_email_automations_put_all( $items );
    return rest_ensure_response( [ 'success' => true, 'automation' => cpp_email_automation_public( $automation, true ) ] );
}

function cpp_email_automations_rest_select_next( WP_REST_Request $request ) {
    $id = sanitize_key( $request->get_param( 'id' ) );
    $items = cpp_email_automations_get_all();
    $index = cpp_email_automation_find_index( $items, $id );
    if ( $index < 0 ) return new WP_Error( 'automation_not_found', 'Automatización no encontrada.', [ 'status' => 404 ] );
    $quota = cpp_email_automation_account_snapshot( true );
    if ( is_wp_error( $quota ) ) return $quota;
    $requested = absint( $request->get_param( 'amount' ) ?: $items[ $index ]['batch_size'] );
    $selected = cpp_email_automation_eligible( $items[ $index ], $requested, $quota['creditsLeft'] );
    return rest_ensure_response( [
        'success'       => true,
        'selected'      => $selected,
        'selectedCount' => count( $selected ),
        'requested'     => $requested,
        'quota'         => $quota,
        'available'     => max( 0, count( $items[ $index ]['recipients'] ) - count( $items[ $index ]['sent'] ?? [] ) ),
    ] );
}

function cpp_email_automations_rest_delete( WP_REST_Request $request ) {
    $id = sanitize_key( $request->get_param( 'id' ) );
    $items = cpp_email_automations_get_all();
    $index = cpp_email_automation_find_index( $items, $id );
    if ( $index < 0 ) return new WP_Error( 'automation_not_found', 'Automatización no encontrada.', [ 'status' => 404 ] );
    array_splice( $items, $index, 1 );
    cpp_email_automations_put_all( $items );
    return rest_ensure_response( [ 'success' => true ] );
}

function cpp_email_automations_rest_mark_sent( WP_REST_Request $request ) {
    $id = sanitize_key( $request->get_param( 'id' ) );
    $raw_emails = $request->get_param( 'emails' );
    $emails = [];
    foreach ( (array) $raw_emails as $raw_email ) {
        $email = strtolower( sanitize_email( $raw_email ) );
        if ( $email ) $emails[ $email ] = true;
    }
    if ( ! $emails ) return new WP_Error( 'emails_missing', 'No se recibieron correos enviados.', [ 'status' => 400 ] );
    $items = cpp_email_automations_get_all();
    $index = cpp_email_automation_find_index( $items, $id );
    if ( $index < 0 ) return new WP_Error( 'automation_not_found', 'Automatización no encontrada.', [ 'status' => 404 ] );
    if ( ! isset( $items[ $index ]['sent'] ) || ! is_array( $items[ $index ]['sent'] ) ) $items[ $index ]['sent'] = [];
    $timestamp = gmdate( 'c' );
    foreach ( array_keys( $emails ) as $email ) $items[ $index ]['sent'][ $email ] = $timestamp;
    $items[ $index ]['last_run_at'] = $timestamp;
    $items[ $index ]['last_sent_count'] = count( $emails );
    $items[ $index ]['last_status'] = sprintf( '%d enviados manualmente', count( $emails ) );
    $items[ $index ]['pending_run'] = null;
    cpp_email_automations_put_all( $items );
    delete_transient( 'cpp_crm_brevo_account' );
    return rest_ensure_response( [
        'success' => true,
        'automation' => cpp_email_automation_public( $items[ $index ], true ),
    ] );
}

function cpp_email_automation_replace_vars( $value, $recipient, $automation, $escape = false ) {
    $replace = [
        '{{nombre}}' => $recipient['name'] ?: $recipient['email'],
        '{{curso}}'  => $automation['course_name'] ?? '',
        '{{fecha}}'  => wp_date( get_option( 'date_format' ) ),
        '{{monto}}'  => '',
    ];
    if ( $escape ) $replace = array_map( 'esc_html', $replace );
    return strtr( (string) $value, $replace );
}

function cpp_email_automation_brevo_template( $value ) {
    return strtr( (string) $value, [
        '{{nombre}}' => '{{params.nombre}}',
        '{{curso}}'  => '{{params.curso}}',
        '{{fecha}}'  => '{{params.fecha}}',
        '{{monto}}'  => '{{params.monto}}',
    ] );
}

function cpp_email_automation_send_batch( $automation, $recipients, $idempotency_key ) {
    $cfg = cpp_brevo_get_config();
    if ( empty( $cfg['api_key'] ) ) return new WP_Error( 'brevo_no_key', 'CPP_BREVO_API_KEY no definida.', [ 'status' => 500 ] );
    $versions = [];
    foreach ( $recipients as $recipient ) {
        $versions[] = [
            'to'     => [ [ 'email' => $recipient['email'], 'name' => $recipient['name'] ?: $recipient['email'] ] ],
            'params' => [
                'nombre' => $recipient['name'] ?: $recipient['email'],
                'curso'  => $automation['course_name'] ?? '',
                'fecha'  => wp_date( get_option( 'date_format' ) ),
                'monto'  => '',
            ],
        ];
    }
    $payload = [
        'sender'          => [ 'name' => $cfg['sender_name'], 'email' => $cfg['sender_email'] ],
        'subject'         => cpp_email_automation_brevo_template( $automation['subject_template'] ),
        'htmlContent'     => cpp_email_automation_brevo_template( $automation['html_template'] ),
        'headers'         => [ 'idempotencyKey' => $idempotency_key ],
        'messageVersions' => $versions,
    ];
    if ( ! empty( $automation['text_template'] ) ) {
        $payload['textContent'] = cpp_email_automation_brevo_template( $automation['text_template'] );
    }
    if ( ! empty( $automation['reply_to'] ) ) {
        $payload['replyTo'] = [ 'email' => $automation['reply_to'], 'name' => $cfg['sender_name'] ];
    }
    if ( ! empty( $automation['tags'] ) ) $payload['tags'] = $automation['tags'];
    $response = wp_remote_post( 'https://api.brevo.com/v3/smtp/email', [
        'headers' => [
            'api-key'        => $cfg['api_key'],
            'Content-Type'   => 'application/json',
            'Accept'         => 'application/json',
        ],
        'body'    => wp_json_encode( $payload ),
        'timeout' => 45,
    ] );
    if ( is_wp_error( $response ) ) return $response;
    $body = json_decode( wp_remote_retrieve_body( $response ), true );
    $code = wp_remote_retrieve_response_code( $response );
    if ( $code >= 400 ) {
        if ( 'duplicate_parameter' === ( $body['code'] ?? '' ) ) {
            return [ 'success' => true, 'duplicate' => true, 'messageIds' => [] ];
        }
        return new WP_Error( 'brevo_batch_error', $body['message'] ?? 'Brevo rechazó el lote.', [ 'status' => $code ] );
    }
    return [ 'success' => true, 'messageIds' => $body['messageIds'] ?? [], 'messageId' => $body['messageId'] ?? '' ];
}

function cpp_email_automation_run_by_id( $id, $source = 'cron' ) {
    $lock_key = 'cpp_email_auto_lock_' . md5( $id );
    if ( get_transient( $lock_key ) ) return new WP_Error( 'automation_locked', 'La automatización ya se está ejecutando.' );
    set_transient( $lock_key, 1, 10 * MINUTE_IN_SECONDS );
    try {
        $items = cpp_email_automations_get_all();
        $index = cpp_email_automation_find_index( $items, $id );
        if ( $index < 0 ) return new WP_Error( 'automation_not_found', 'Automatización no encontrada.' );
        $automation = $items[ $index ];
        $quota = cpp_email_automation_account_snapshot( true );
        if ( is_wp_error( $quota ) ) return $quota;
        $recipients = cpp_email_automation_eligible( $automation, $automation['batch_size'], $quota['creditsLeft'] );
        if ( ! $recipients ) {
            $automation['last_run_at'] = gmdate( 'c' );
            $automation['last_sent_count'] = 0;
            $automation['last_status'] = $quota['creditsLeft'] <= 0 ? 'Sin cuota disponible en Brevo' : 'No quedan destinatarios nuevos';
            $automation['next_run_at'] = cpp_email_automation_next_run( $automation );
            $items[ $index ] = $automation;
            cpp_email_automations_put_all( $items );
            return [ 'success' => true, 'sent' => 0, 'status' => $automation['last_status'] ];
        }

        $pending = is_array( $automation['pending_run'] ?? null ) ? $automation['pending_run'] : null;
        $emails = array_column( $recipients, 'email' );
        if ( ! $pending || ( $pending['emails'] ?? [] ) !== $emails ) {
            $pending = [ 'key' => wp_generate_uuid4(), 'emails' => $emails, 'created_at' => gmdate( 'c' ) ];
            $automation['pending_run'] = $pending;
            $items[ $index ] = $automation;
            cpp_email_automations_put_all( $items );
        }

        $result = cpp_email_automation_send_batch( $automation, $recipients, $pending['key'] );
        if ( is_wp_error( $result ) ) {
            $automation['last_run_at'] = gmdate( 'c' );
            $automation['last_sent_count'] = 0;
            $ambiguous = 'brevo_batch_error' !== $result->get_error_code();
            $automation['last_status'] = $ambiguous
                ? 'Pausada por seguridad: Brevo pudo recibir el lote, revisa el historial antes de reactivar.'
                : 'Error: ' . $result->get_error_message();
            $automation['enabled'] = $ambiguous ? false : $automation['enabled'];
            $automation['next_run_at'] = $ambiguous ? null : gmdate( 'c', time() + HOUR_IN_SECONDS );
            $items[ $index ] = $automation;
            cpp_email_automations_put_all( $items );
            return $result;
        }

        if ( ! isset( $automation['sent'] ) || ! is_array( $automation['sent'] ) ) $automation['sent'] = [];
        $timestamp = gmdate( 'c' );
        foreach ( $recipients as $recipient ) $automation['sent'][ strtolower( $recipient['email'] ) ] = $timestamp;
        $automation['pending_run'] = null;
        $automation['last_run_at'] = $timestamp;
        $automation['last_sent_count'] = count( $recipients );
        $automation['last_status'] = sprintf( '%d enviados por %s', count( $recipients ), $source );
        $automation['next_run_at'] = cpp_email_automation_next_run( $automation );
        $items[ $index ] = $automation;
        cpp_email_automations_put_all( $items );
        delete_transient( 'cpp_crm_brevo_account' );
        return [ 'success' => true, 'sent' => count( $recipients ), 'status' => $automation['last_status'] ];
    } finally {
        delete_transient( $lock_key );
    }
}

function cpp_email_automations_rest_run( WP_REST_Request $request ) {
    if ( 'SEND' !== $request->get_param( 'confirm' ) ) {
        return new WP_Error( 'confirmation_required', 'Confirma explícitamente el envío.', [ 'status' => 400 ] );
    }
    $result = cpp_email_automation_run_by_id( sanitize_key( $request->get_param( 'id' ) ), 'manual' );
    if ( is_wp_error( $result ) ) return $result;
    return rest_ensure_response( $result );
}

function cpp_email_automations_tick() {
    $items = cpp_email_automations_get_all();
    foreach ( $items as $automation ) {
        if ( empty( $automation['enabled'] ) || empty( $automation['next_run_at'] ) ) continue;
        $next = strtotime( $automation['next_run_at'] );
        if ( $next && $next <= time() ) cpp_email_automation_run_by_id( $automation['id'], 'automático' );
    }
}
