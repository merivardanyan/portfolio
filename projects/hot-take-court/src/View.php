<?php
declare(strict_types=1);

namespace App;

/** Plain-PHP templates with automatic layout wrapping. Templates must escape with e(). */
final class View
{
    public static function render(string $template, array $vars = [], int $status = 200): Response
    {
        $vars += ['title' => 'Hot Take Court', 'description' => 'Submit your hottest take. The internet is the jury.', 'og' => null];
        $content = self::partial($template, $vars);
        return Response::html(self::partial('layout', $vars + ['content' => $content]), $status);
    }

    public static function partial(string $template, array $vars = []): string
    {
        $file = Config::root() . '/templates/' . $template . '.php';
        if (!preg_match('/^[a-z_\/]+$/', $template) || !is_file($file)) {
            throw new \LogicException("Unknown template {$template}");
        }
        extract($vars, EXTR_SKIP);
        ob_start();
        try {
            require $file;
            return (string) ob_get_clean();
        } catch (\Throwable $e) {
            ob_end_clean();
            throw $e;
        }
    }

    /**
     * Absolute URL from the configured APP_URL. The Host header is NEVER used: it is
     * client-controlled, and a cached page could otherwise advertise an attacker's domain
     * in og:url / og:image. Without APP_URL the path stays relative (og:* tags that need an
     * absolute URL are then omitted by the layout; the share button resolves relative URLs).
     */
    public static function absoluteUrl(string $path): string
    {
        $base = (string) (Config::get('APP_URL') ?? '');
        if (!preg_match('~^https?://[^\s/?#]+$~i', rtrim($base, '/'))) {
            return $path;
        }
        return rtrim($base, '/') . $path;
    }

    public static function isAbsolute(string $url): bool
    {
        return (bool) preg_match('~^https?://~i', $url);
    }
}
