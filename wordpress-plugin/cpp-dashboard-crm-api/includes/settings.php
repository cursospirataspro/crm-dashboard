<?php
/**
 * Ajustes del plugin dentro de WordPress (Ajustes → CPP CRM Dashboard).
 *
 * Permite definir el token y los orígenes autorizados sin editar wp-config.php.
 * Las constantes de wp-config.php, si existen, siguen teniendo prioridad.
 */

if ( ! defined( 'ABSPATH' ) ) exit;

const CPP_CRM_DASHBOARD_TOKEN_OPTION   = 'cpp_crm_dashboard_token';
const CPP_CRM_DASHBOARD_ORIGINS_OPTION = 'cpp_crm_dashboard_allowed_origins';
const CPP_CRM_DASHBOARD_URL_OPTION     = 'cpp_crm_dashboard_url';
const CPP_CRM_DASHBOARD_MIN_TOKEN      = 32;

/** Dirección HTTPS completa del dashboard (p. ej. https://usuario.github.io/crm-dashboard/) o ''. */
function cpp_crm_dashboard_sanitize_dashboard_url( $raw ) {
    $url   = esc_url_raw( trim( (string) $raw ), [ 'https' ] );
    $parts = $url ? wp_parse_url( $url ) : false;
    if ( ! $parts || empty( $parts['host'] ) || ! empty( $parts['query'] ) || ! empty( $parts['fragment'] )
        || ! empty( $parts['user'] ) || ! empty( $parts['pass'] ) ) {
        return '';
    }
    return $url;
}

/** Origen (esquema + host + puerto) de una URL ya validada. */
function cpp_crm_dashboard_origin_of( $url ) {
    $parts = wp_parse_url( (string) $url );
    if ( empty( $parts['scheme'] ) || empty( $parts['host'] ) ) {
        return '';
    }
    $origin = $parts['scheme'] . '://' . strtolower( $parts['host'] );
    return empty( $parts['port'] ) ? $origin : $origin . ':' . (int) $parts['port'];
}

/** Token vigente: constante de wp-config.php o, si no existe, el ajuste guardado. */
function cpp_crm_dashboard_token() {
    if ( defined( 'CPP_CRM_DASHBOARD_TOKEN' ) && CPP_CRM_DASHBOARD_TOKEN ) {
        return (string) CPP_CRM_DASHBOARD_TOKEN;
    }
    return (string) get_option( CPP_CRM_DASHBOARD_TOKEN_OPTION, '' );
}

/** Orígenes configurados (cadena separada por comas o arreglo), sin normalizar. */
function cpp_crm_dashboard_configured_origins() {
    if ( defined( 'CPP_CRM_DASHBOARD_ALLOWED_ORIGINS' ) ) {
        return CPP_CRM_DASHBOARD_ALLOWED_ORIGINS;
    }
    $stored = (string) get_option( CPP_CRM_DASHBOARD_ORIGINS_OPTION, '' );
    return '' !== $stored ? $stored : home_url();
}

/** Deja sólo orígenes http(s) válidos, sin ruta ni barra final. No admite "*". */
function cpp_crm_dashboard_sanitize_origins( $raw ) {
    $clean = [];
    foreach ( preg_split( '/[\s,]+/', (string) $raw ) as $item ) {
        $item = trim( $item );
        if ( '' === $item ) {
            continue;
        }
        $parts = wp_parse_url( $item );
        if ( empty( $parts['scheme'] ) || empty( $parts['host'] )
            || ! in_array( $parts['scheme'], [ 'http', 'https' ], true ) ) {
            continue;
        }
        $origin = $parts['scheme'] . '://' . strtolower( $parts['host'] );
        if ( ! empty( $parts['port'] ) ) {
            $origin .= ':' . (int) $parts['port'];
        }
        $clean[ $origin ] = true;
    }
    return implode( ',', array_keys( $clean ) );
}

add_action( 'admin_menu', function () {
    add_options_page(
        'CPP CRM Dashboard',
        'CPP CRM Dashboard',
        'manage_options',
        'cpp-crm-dashboard',
        'cpp_crm_dashboard_render_settings'
    );
} );

add_action( 'admin_post_cpp_crm_dashboard_save', function () {
    if ( ! current_user_can( 'manage_options' ) ) {
        wp_die( 'No tienes permiso para cambiar estos ajustes.', '', [ 'response' => 403 ] );
    }
    check_admin_referer( 'cpp_crm_dashboard_save' );

    $status = 'saved';

    // Token: vacío = conservar el actual.
    $token = isset( $_POST['cpp_crm_token'] ) ? trim( (string) wp_unslash( $_POST['cpp_crm_token'] ) ) : '';
    if ( '' !== $token ) {
        if ( strlen( $token ) < CPP_CRM_DASHBOARD_MIN_TOKEN || ! preg_match( '/^[A-Za-z0-9_\-\.]+$/', $token ) ) {
            $status = 'bad_token';
        } else {
            update_option( CPP_CRM_DASHBOARD_TOKEN_OPTION, $token, false );
        }
    }

    if ( 'saved' === $status ) {
        $dashboard = isset( $_POST['cpp_crm_dashboard_url'] )
            ? cpp_crm_dashboard_sanitize_dashboard_url( wp_unslash( $_POST['cpp_crm_dashboard_url'] ) )
            : (string) get_option( CPP_CRM_DASHBOARD_URL_OPTION, '' );
        if ( isset( $_POST['cpp_crm_dashboard_url'] ) ) {
            update_option( CPP_CRM_DASHBOARD_URL_OPTION, $dashboard, false );
        }
        if ( isset( $_POST['cpp_crm_origins'] ) ) {
            // El origen del dashboard configurado queda siempre autorizado.
            $origins = cpp_crm_dashboard_sanitize_origins(
                wp_unslash( $_POST['cpp_crm_origins'] ) . ',' . cpp_crm_dashboard_origin_of( $dashboard )
            );
            update_option( CPP_CRM_DASHBOARD_ORIGINS_OPTION, $origins, false );
        }
    }

    wp_safe_redirect( add_query_arg(
        [ 'page' => 'cpp-crm-dashboard', 'cpp_status' => $status ],
        admin_url( 'options-general.php' )
    ) );
    exit;
} );

/**
 * Conexión en un clic: genera el token si aún no existe y abre el dashboard
 * con los datos de conexión en el fragmento (#) de la URL. El fragmento no se
 * envía a ningún servidor; el dashboard lo guarda en su navegador y lo borra
 * de la barra de direcciones. El token nunca se escribe en el HTML del panel.
 */
add_action( 'admin_post_cpp_crm_dashboard_connect', function () {
    if ( ! current_user_can( 'manage_options' ) ) {
        wp_die( 'No tienes permiso para conectar el dashboard.', '', [ 'response' => 403 ] );
    }
    check_admin_referer( 'cpp_crm_dashboard_connect' );

    $back      = add_query_arg( [ 'page' => 'cpp-crm-dashboard' ], admin_url( 'options-general.php' ) );
    $dashboard = cpp_crm_dashboard_sanitize_dashboard_url( get_option( CPP_CRM_DASHBOARD_URL_OPTION, '' ) );
    if ( '' === $dashboard ) {
        wp_safe_redirect( add_query_arg( 'cpp_status', 'no_dashboard', $back ) );
        exit;
    }

    $from_config = defined( 'CPP_CRM_DASHBOARD_TOKEN' ) && CPP_CRM_DASHBOARD_TOKEN;
    $renew       = ! empty( $_POST['cpp_crm_renew'] ) && ! $from_config;
    $token       = cpp_crm_dashboard_token();
    if ( '' === $token || $renew ) {
        $token = wp_generate_password( 64, false, false );
        update_option( CPP_CRM_DASHBOARD_TOKEN_OPTION, $token, false );
    }

    $payload = wp_json_encode( [
        'url'   => untrailingslashit( rest_url( 'cpp-crm-dashboard/v1' ) ),
        'token' => $token,
    ] );
    $encoded = rtrim( strtr( base64_encode( $payload ), '+/', '-_' ), '=' );

    nocache_headers();
    header( 'Referrer-Policy: no-referrer' );
    // Destino externo fijado por un administrador en los ajustes; wp_safe_redirect lo rechazaría.
    wp_redirect( $dashboard . '#cpp_connect=' . $encoded, 303 );
    exit;
} );

function cpp_crm_dashboard_render_settings() {
    if ( ! current_user_can( 'manage_options' ) ) {
        return;
    }

    $token_in_config   = defined( 'CPP_CRM_DASHBOARD_TOKEN' ) && CPP_CRM_DASHBOARD_TOKEN;
    $origins_in_config = defined( 'CPP_CRM_DASHBOARD_ALLOWED_ORIGINS' );
    $has_token         = '' !== cpp_crm_dashboard_token();
    $stored_origins    = (string) get_option( CPP_CRM_DASHBOARD_ORIGINS_OPTION, '' );
    $dashboard_url     = (string) get_option( CPP_CRM_DASHBOARD_URL_OPTION, '' );
    $status            = isset( $_GET['cpp_status'] ) ? sanitize_key( wp_unslash( $_GET['cpp_status'] ) ) : '';
    $api_url           = rest_url( 'cpp-crm-dashboard/v1' );
    ?>
    <div class="wrap">
        <h1>CPP CRM Dashboard</h1>

        <?php if ( 'saved' === $status ) : ?>
            <div class="notice notice-success is-dismissible"><p>Ajustes guardados.</p></div>
        <?php elseif ( 'bad_token' === $status ) : ?>
            <div class="notice notice-error"><p>
                El token debe tener al menos <?php echo (int) CPP_CRM_DASHBOARD_MIN_TOKEN; ?> caracteres
                y sólo letras, números, guion, guion bajo o punto. No se guardó ningún cambio.
            </p></div>
        <?php elseif ( 'no_dashboard' === $status ) : ?>
            <div class="notice notice-error"><p>
                Guarda primero la <strong>Dirección del dashboard</strong> para poder conectarlo.
            </p></div>
        <?php endif; ?>

        <p>Estos datos conectan el dashboard CRM con esta tienda.</p>

        <h2>Conexión en un clic</h2>
        <p>Abre el dashboard ya conectado con esta tienda. Si aún no hay token, se genera uno automáticamente;
           no hace falta copiarlo ni escribirlo.</p>
        <form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
            <input type="hidden" name="action" value="cpp_crm_dashboard_connect">
            <?php wp_nonce_field( 'cpp_crm_dashboard_connect' ); ?>
            <?php if ( ! $token_in_config ) : ?>
                <p><label>
                    <input type="checkbox" name="cpp_crm_renew" value="1">
                    Generar un token nuevo (desconecta los dashboards que ya estaban conectados)
                </label></p>
            <?php endif; ?>
            <?php submit_button( 'Conectar el dashboard', 'primary', 'cpp_crm_connect', false,
                '' === $dashboard_url ? [ 'disabled' => 'disabled' ] : [] ); ?>
            <?php if ( '' === $dashboard_url ) : ?>
                <span class="description">Guarda antes la dirección del dashboard, más abajo.</span>
            <?php endif; ?>
        </form>

        <h2>Ajustes</h2>

        <table class="form-table" role="presentation">
            <tr>
                <th scope="row">Dirección del API</th>
                <td><code><?php echo esc_html( untrailingslashit( $api_url ) ); ?></code></td>
            </tr>
            <tr>
                <th scope="row">Estado del token</th>
                <td>
                    <?php if ( $token_in_config ) : ?>
                        Definido en <code>wp-config.php</code> (tiene prioridad sobre este formulario).
                    <?php elseif ( $has_token ) : ?>
                        Definido en estos ajustes.
                    <?php else : ?>
                        <strong>Sin definir.</strong> El dashboard no podrá leer datos hasta que guardes uno.
                    <?php endif; ?>
                </td>
            </tr>
        </table>

        <form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" autocomplete="off">
            <input type="hidden" name="action" value="cpp_crm_dashboard_save">
            <?php wp_nonce_field( 'cpp_crm_dashboard_save' ); ?>

            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row"><label for="cpp_crm_dashboard_url">Dirección del dashboard</label></th>
                    <td>
                        <input type="url" id="cpp_crm_dashboard_url" name="cpp_crm_dashboard_url" class="large-text"
                               value="<?php echo esc_attr( $dashboard_url ); ?>"
                               placeholder="https://cursospirataspro.github.io/crm-dashboard/">
                        <p class="description">
                            Dirección HTTPS completa donde abres el dashboard. Su origen queda autorizado automáticamente.
                        </p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="cpp_crm_token">Token de acceso</label></th>
                    <td>
                        <input type="password" id="cpp_crm_token" name="cpp_crm_token" class="regular-text"
                               value="" autocomplete="new-password"
                               <?php disabled( $token_in_config ); ?>>
                        <p class="description">
                            Mínimo <?php echo (int) CPP_CRM_DASHBOARD_MIN_TOKEN; ?> caracteres. Es la contraseña del API:
                            no lo compartas. Déjalo vacío para conservar el actual; nunca se muestra el guardado.
                        </p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="cpp_crm_origins">Orígenes autorizados</label></th>
                    <td>
                        <input type="text" id="cpp_crm_origins" name="cpp_crm_origins" class="large-text"
                               value="<?php echo esc_attr( $stored_origins ); ?>"
                               placeholder="https://cursospirataspro.github.io"
                               <?php disabled( $origins_in_config ); ?>>
                        <p class="description">
                            Dirección desde la que se abre el dashboard, sin ruta. Varias separadas por coma.
                            Vacío = sólo esta misma tienda.
                            <?php if ( $origins_in_config ) : ?>
                                Ahora mismo se usa el valor de <code>wp-config.php</code>.
                            <?php endif; ?>
                        </p>
                    </td>
                </tr>
            </table>

            <?php submit_button( 'Guardar ajustes' ); ?>
        </form>
    </div>
    <?php
}
