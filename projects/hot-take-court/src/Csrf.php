<?php
declare(strict_types=1);

namespace App;

/** Synchronizer-token CSRF protection, one token per session. */
final class Csrf
{
    public static function token(): string
    {
        if (empty($_SESSION['csrf'])) {
            $_SESSION['csrf'] = bin2hex(random_bytes(32));
        }
        return $_SESSION['csrf'];
    }

    /** Accepts the token from the X-CSRF-Token header, a JSON `csrf` field or a form `_csrf` field. */
    public static function verify(Request $req): void
    {
        $sent = $req->header('x-csrf-token') ?? $req->str('csrf');
        if ($sent === '') {
            $sent = $req->str('_csrf');
        }
        $expected = $_SESSION['csrf'] ?? '';
        if ($expected === '' || !is_string($sent) || !hash_equals($expected, $sent)) {
            throw new HttpException(419, 'csrf_mismatch', 'Your session expired or the form is stale. Reload and try again.');
        }
    }

    public static function rotate(): void
    {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
}
