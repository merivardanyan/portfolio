<?php
declare(strict_types=1);

namespace App;

/** Single source of "now" so tests can freeze time. Datetimes are UTC 'Y-m-d H:i:s'. */
final class Clock
{
    private static ?int $frozen = null;

    public static function now(): int
    {
        return self::$frozen ?? time();
    }

    public static function freeze(?int $ts): void
    {
        self::$frozen = $ts;
    }

    public static function fmt(int $ts): string
    {
        return gmdate('Y-m-d H:i:s', $ts);
    }

    public static function nowStr(): string
    {
        return self::fmt(self::now());
    }

    public static function parse(string $dt): int
    {
        return (int) strtotime($dt . ' UTC');
    }

    /** "3h left", "closed 2d ago" style relative time. */
    public static function relative(string $dt): string
    {
        $diff = self::parse($dt) - self::now();
        $abs = abs($diff);
        $txt = match (true) {
            $abs < 60 => 'moments',
            $abs < 3600 => intdiv($abs, 60) . 'm',
            $abs < 86400 => intdiv($abs, 3600) . 'h',
            default => intdiv($abs, 86400) . 'd',
        };
        return $diff >= 0 ? "{$txt} left" : "{$txt} ago";
    }
}
