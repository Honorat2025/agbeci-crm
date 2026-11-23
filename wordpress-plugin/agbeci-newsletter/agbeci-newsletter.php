<?php
/**
 * Plugin Name: Agbeci Newsletter
 * Description: Formulaire d'inscription à la newsletter, relié à l'application Agbeci CRM. Prévient aussi le CRM à chaque nouvel article publié et à chaque demande de document.
 * Version: 0.2.0
 * Author: Honorat Agbeci
 * Requires PHP: 8.0
 * Text Domain: agbeci-newsletter
 */

if (!defined('ABSPATH')) {
    exit;
}

const AGBECI_NL_VERSION = '0.2.0';
const AGBECI_NL_OPTION = 'agbeci_newsletter_settings';

/** Réglages avec valeurs par défaut. */
function agbeci_nl_settings(): array
{
    $defaults = [
        'api_url' => '',
        'shared_secret' => '',
        'after_posts' => '1',
        'notify_new_posts' => '1',
        'title' => 'Recevez mes prochains articles',
        'intro' => 'Une newsletter pour suivre mes réflexions, directement dans votre boîte mail.',
    ];
    $saved = get_option(AGBECI_NL_OPTION, []);
    return array_merge($defaults, is_array($saved) ? $saved : []);
}

/* -------------------------------------------------------------------------
 * Formulaire : code court [agbeci_newsletter]
 * ---------------------------------------------------------------------- */

function agbeci_nl_form(array $atts = []): string
{
    $s = agbeci_nl_settings();
    if (empty($s['api_url'])) {
        return current_user_can('manage_options')
            ? '<p><em>Agbeci Newsletter : renseignez l\'adresse du CRM dans Réglages &gt; Agbeci Newsletter.</em></p>'
            : '';
    }
    $atts = shortcode_atts(['title' => $s['title'], 'intro' => $s['intro']], $atts, 'agbeci_newsletter');

    wp_enqueue_style('agbeci-nl', plugins_url('assets/newsletter.css', __FILE__), [], AGBECI_NL_VERSION);
    wp_enqueue_script('agbeci-nl', plugins_url('assets/newsletter.js', __FILE__), [], AGBECI_NL_VERSION, true);

    $endpoint = esc_url(rtrim($s['api_url'], '/') . '/api/public/subscribe');
    $uid = wp_unique_id('agbeci-nl-');

    ob_start(); ?>
    <form class="agbeci-nl" data-endpoint="<?php echo $endpoint; ?>" novalidate>
        <?php if ($atts['title'] !== '') : ?>
            <p class="agbeci-nl__title"><?php echo esc_html($atts['title']); ?></p>
        <?php endif; ?>
        <?php if ($atts['intro'] !== '') : ?>
            <p class="agbeci-nl__intro"><?php echo esc_html($atts['intro']); ?></p>
        <?php endif; ?>
        <div class="agbeci-nl__fields">
            <label class="agbeci-nl__sr" for="<?php echo esc_attr($uid); ?>-prenom">Prénom</label>
            <input id="<?php echo esc_attr($uid); ?>-prenom" type="text" name="firstName" placeholder="Prénom" autocomplete="given-name">
            <label class="agbeci-nl__sr" for="<?php echo esc_attr($uid); ?>-email">Email</label>
            <input id="<?php echo esc_attr($uid); ?>-email" type="email" name="email" placeholder="Votre email" required autocomplete="email">
            <button type="submit">Je m'inscris</button>
        </div>
        <div class="agbeci-nl__hp" aria-hidden="true">
            <label>Site web <input type="text" name="website" tabindex="-1" autocomplete="off"></label>
        </div>
        <label class="agbeci-nl__consent">
            <input type="checkbox" name="consent" required>
            J'accepte de recevoir la newsletter. Je peux me désinscrire à tout moment.
        </label>
        <p class="agbeci-nl__msg" role="status" aria-live="polite"></p>
    </form>
    <?php
    return (string) ob_get_clean();
}
add_shortcode('agbeci_newsletter', 'agbeci_nl_form');

/** Formulaire ajouté automatiquement à la fin de chaque article. */
add_filter('the_content', function (string $content): string {
    $s = agbeci_nl_settings();
    if ($s['after_posts'] !== '1' || !is_singular('post') || !in_the_loop() || !is_main_query()) {
        return $content;
    }
    if (has_shortcode($content, 'agbeci_newsletter')) {
        return $content;
    }
    return $content . agbeci_nl_form();
});

/* -------------------------------------------------------------------------
 * Nouvel article publié : le CRM prépare un brouillon de newsletter
 * ---------------------------------------------------------------------- */

add_action('transition_post_status', function (string $new, string $old, WP_Post $post): void {
    if ($new !== 'publish' || $old === 'publish' || $post->post_type !== 'post') {
        return;
    }
    $s = agbeci_nl_settings();
    if ($s['notify_new_posts'] !== '1' || empty($s['api_url']) || empty($s['shared_secret'])) {
        return;
    }
    $excerpt = has_excerpt($post) ? get_the_excerpt($post) : wp_trim_words(wp_strip_all_tags($post->post_content), 40);
    wp_remote_post(rtrim($s['api_url'], '/') . '/api/wp/new-post', [
        'timeout' => 10,
        'blocking' => false,
        'headers' => [
            'Content-Type' => 'application/json',
            'X-Agbeci-Secret' => $s['shared_secret'],
        ],
        'body' => wp_json_encode([
            'title' => html_entity_decode(get_the_title($post), ENT_QUOTES, 'UTF-8'),
            'url' => get_permalink($post),
            'excerpt' => html_entity_decode($excerpt, ENT_QUOTES, 'UTF-8'),
        ]),
    ]);
}, 10, 3);

/* -------------------------------------------------------------------------
 * Demande de document (extension « Agbeci Document Gate ») : fiche dans le CRM
 * ---------------------------------------------------------------------- */

/**
 * La demande est enregistrée en plusieurs fois (article, puis email, puis document).
 * On attend la dernière information, puis on prévient le CRM une minute plus tard,
 * en tâche de fond, pour ne jamais ralentir le visiteur.
 */
add_action('added_post_meta', function ($meta_id, $post_id, $meta_key): void {
    if ($meta_key !== '_agbeci_document_id' || get_post_type($post_id) !== 'agbeci_doc_access') {
        return;
    }
    if (!wp_next_scheduled('agbeci_nl_push_doc_request', [(int) $post_id])) {
        wp_schedule_single_event(time() + 60, 'agbeci_nl_push_doc_request', [(int) $post_id]);
    }
}, 10, 3);

add_action('agbeci_nl_push_doc_request', 'agbeci_nl_push_doc_request');

function agbeci_nl_push_doc_request(int $post_id): void
{
    $s = agbeci_nl_settings();
    $post = get_post($post_id);
    if (!$post || empty($s['api_url']) || empty($s['shared_secret']) || get_post_meta($post_id, '_agbeci_crm_sent', true)) {
        return;
    }
    $email = (string) get_post_meta($post_id, '_agbeci_email', true);
    if (!is_email($email)) {
        return;
    }
    $doc = (string) get_post_meta($post_id, '_agbeci_document_title', true);
    $response = wp_remote_post(rtrim($s['api_url'], '/') . '/api/wp/contacts', [
        'timeout' => 15,
        'headers' => [
            'Content-Type' => 'application/json',
            'X-Agbeci-Secret' => $s['shared_secret'],
        ],
        'body' => wp_json_encode([
            'contacts' => [[
                'email' => $email,
                'name' => html_entity_decode($post->post_title, ENT_QUOTES, 'UTF-8'),
                'note' => sprintf('Demande du document « %s » sur le site, le %s', $doc ?: 'sans titre', mysql2date('d/m/Y', $post->post_date)),
                'tag' => 'document',
            ]],
        ]),
    ]);
    if (!is_wp_error($response) && wp_remote_retrieve_response_code($response) === 200) {
        update_post_meta($post_id, '_agbeci_crm_sent', current_time('mysql'));
    } else {
        // Nouvel essai dans une heure (le CRM était peut-être en cours de mise à jour).
        $tries = (int) get_post_meta($post_id, '_agbeci_crm_tries', true) + 1;
        update_post_meta($post_id, '_agbeci_crm_tries', $tries);
        if ($tries < 5) {
            wp_schedule_single_event(time() + HOUR_IN_SECONDS, 'agbeci_nl_push_doc_request', [$post_id]);
        }
    }
}

/* -------------------------------------------------------------------------
 * Page de réglages
 * ---------------------------------------------------------------------- */

add_action('admin_menu', function (): void {
    add_options_page('Agbeci Newsletter', 'Agbeci Newsletter', 'manage_options', 'agbeci-newsletter', 'agbeci_nl_settings_page');
});

add_action('admin_init', function (): void {
    register_setting('agbeci_nl', AGBECI_NL_OPTION, [
        'type' => 'array',
        'sanitize_callback' => function ($input): array {
            $input = is_array($input) ? $input : [];
            return [
                'api_url' => esc_url_raw(trim($input['api_url'] ?? '')),
                'shared_secret' => sanitize_text_field($input['shared_secret'] ?? ''),
                'after_posts' => empty($input['after_posts']) ? '0' : '1',
                'notify_new_posts' => empty($input['notify_new_posts']) ? '0' : '1',
                'title' => sanitize_text_field($input['title'] ?? ''),
                'intro' => sanitize_text_field($input['intro'] ?? ''),
            ];
        },
    ]);
});

function agbeci_nl_settings_page(): void
{
    if (!current_user_can('manage_options')) {
        return;
    }
    $s = agbeci_nl_settings();
    $o = AGBECI_NL_OPTION; ?>
    <div class="wrap">
        <h1>Agbeci Newsletter</h1>
        <p>Relie votre site à votre CRM. Pour afficher le formulaire ailleurs (barre latérale, page, Elementor), utilisez le code court <code>[agbeci_newsletter]</code>.</p>
        <form method="post" action="options.php">
            <?php settings_fields('agbeci_nl'); ?>
            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row"><label for="api_url">Adresse du CRM</label></th>
                    <td><input id="api_url" type="url" class="regular-text" name="<?php echo esc_attr($o); ?>[api_url]" value="<?php echo esc_attr($s['api_url']); ?>" placeholder="https://crm.honoratagbeci.com"></td>
                </tr>
                <tr>
                    <th scope="row"><label for="shared_secret">Clé secrète</label></th>
                    <td><input id="shared_secret" type="password" class="regular-text" name="<?php echo esc_attr($o); ?>[shared_secret]" value="<?php echo esc_attr($s['shared_secret']); ?>" autocomplete="off">
                        <p class="description">La même valeur que WP_SHARED_SECRET dans le CRM.</p></td>
                </tr>
                <tr>
                    <th scope="row">Options</th>
                    <td>
                        <label><input type="checkbox" name="<?php echo esc_attr($o); ?>[after_posts]" value="1" <?php checked($s['after_posts'], '1'); ?>> Afficher le formulaire à la fin de chaque article</label><br>
                        <label><input type="checkbox" name="<?php echo esc_attr($o); ?>[notify_new_posts]" value="1" <?php checked($s['notify_new_posts'], '1'); ?>> Préparer un brouillon de newsletter dans le CRM à chaque nouvel article</label>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="title">Titre du formulaire</label></th>
                    <td><input id="title" type="text" class="regular-text" name="<?php echo esc_attr($o); ?>[title]" value="<?php echo esc_attr($s['title']); ?>"></td>
                </tr>
                <tr>
                    <th scope="row"><label for="intro">Phrase d'introduction</label></th>
                    <td><input id="intro" type="text" class="large-text" name="<?php echo esc_attr($o); ?>[intro]" value="<?php echo esc_attr($s['intro']); ?>"></td>
                </tr>
            </table>
            <?php submit_button(); ?>
        </form>
    </div>
    <?php
}
