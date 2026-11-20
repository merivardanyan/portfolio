<?php
declare(strict_types=1);

namespace App;

/** Reads `.env` (if present) and real environment variables. Real env wins. */
final class Config
{
    private static array $values = [];
    private static string $root = '';

    public static function load(string $root): void
    {
        self::$root = $root;
        self::$values = [];
        $file = $root . '/.env';
        if (is_file($file)) {
            foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
                $line = trim($line);
                if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) {
                    continue;
                }
                [$k, $v] = array_map('trim', explode('=', $line, 2));
                self::$values[$k] = trim($v, "\"'");
            }
        }
    }

    public static function get(string $key, ?string $default = null): ?string
    {
        $env = getenv($key);
        if ($env !== false) {
            return $env;
        }
        return self::$values[$key] ?? $default;
    }

    public static function root(): string
    {
        return self::$root;
    }

    public static function isProduction(): bool
    {
        return self::get('APP_ENV', 'local') === 'production';
    }
}
