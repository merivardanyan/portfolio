<?php
declare(strict_types=1);

namespace App;

use App\Repositories\UserRepository;

/** Session-based authentication. */
final class Auth
{
    private static ?array $user = null;
    private static bool $loaded = false;

    public static function startSession(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return;
        }
        $secure = (($_SERVER['HTTPS'] ?? '') !== '' && $_SERVER['HTTPS'] !== 'off') || Config::get('SESSION_SECURE') === '1';
        ini_set('session.use_strict_mode', '1');
        ini_set('session.use_only_cookies', '1');
        session_name('htc_session');
        session_set_cookie_params([
            'lifetime' => 0,
            'path' => '/',
            'secure' => $secure,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        session_start();
    }

    public static function user(): ?array
    {
        if (!self::$loaded) {
            self::$loaded = true;
            $id = $_SESSION['uid'] ?? null;
            self::$user = is_int($id) ? (new UserRepository(Db::fromConfig()))->find($id) : null;
        }
        return self::$user;
    }

    public static function id(): ?int
    {
        return self::user()['id'] ?? null;
    }

    public static function require(): array
    {
        $u = self::user();
        if (!$u) {
            throw new HttpException(401, 'unauthenticated', 'You need to log in first.');
        }
        return $u;
    }

    public static function login(array $user): void
    {
        session_regenerate_id(true); // prevent session fixation
        $_SESSION['uid'] = (int) $user['id'];
        Csrf::rotate();
        self::$user = $user;
        self::$loaded = true;
    }

    public static function logout(): void
    {
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $p = session_get_cookie_params();
            setcookie(session_name(), '', ['expires' => time() - 42000, 'path' => $p['path'], 'secure' => $p['secure'], 'httponly' => true, 'samesite' => 'Lax']);
        }
        session_destroy();
        self::$user = null;
    }
}
