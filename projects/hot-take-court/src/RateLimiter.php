<?php
declare(strict_types=1);

namespace App;

/**
 * Fixed-window limiter stored in the `rate_limits` table.
 *
 * Each hit is ONE atomic upsert-and-increment statement (SQLite `ON CONFLICT DO UPDATE`,
 * MySQL `ON DUPLICATE KEY UPDATE`), so concurrent requests can't both read "4 hits" and
 * both be let through. The follow-up read happens in the same transaction (SQLite
 * BEGIN IMMEDIATE / InnoDB row lock taken by the upsert), so it sees our own increment.
 */
final class RateLimiter
{
    public function __construct(private readonly Db $db, private readonly ?\Closure $clock = null)
    {
    }

    private function now(): int
    {
        return $this->clock ? ($this->clock)() : time();
    }

    /** Fixed length, no raw IPs/usernames at rest. */
    private static function key(string $subject): string
    {
        return hash('sha256', $subject);
    }

    /** Count a hit; throws 429 when over the limit. */
    public function hit(string $bucket, string $subject, int $limit, int $windowSec): void
    {
        $retry = $this->attempt($bucket, $subject, $limit, $windowSec);
        if ($retry !== null) {
            throw new HttpException(429, 'rate_limited', 'Too many attempts. Try again in ' . $retry . ' s.',
                ['retryAfterSec' => $retry], ['Retry-After' => (string) $retry]);
        }
    }

    /** @return int|null seconds to wait, or null if allowed */
    public function attempt(string $bucket, string $subject, int $limit, int $windowSec): ?int
    {
        $now = $this->now();
        $key = self::key($subject);
        return $this->db->transaction(function () use ($bucket, $key, $limit, $windowSec, $now): ?int {
            if ($this->db->driver() === 'mysql') {
                // MySQL evaluates SET left to right: `hits` must be assigned while window_start is still the old value.
                $this->db->run('INSERT INTO rate_limits (bucket, subject, window_start, hits) VALUES (?, ?, ?, 1) AS n
                    ON DUPLICATE KEY UPDATE
                      hits = IF(rate_limits.window_start + ? <= n.window_start, 1, rate_limits.hits + 1),
                      window_start = IF(rate_limits.window_start + ? <= n.window_start, n.window_start, rate_limits.window_start)',
                    [$bucket, $key, $now, $windowSec, $windowSec]);
            } else {
                // SQLite evaluates every SET expression against the old row.
                $this->db->run('INSERT INTO rate_limits (bucket, subject, window_start, hits) VALUES (?, ?, ?, 1)
                    ON CONFLICT (bucket, subject) DO UPDATE SET
                      hits = CASE WHEN window_start + ? <= excluded.window_start THEN 1 ELSE hits + 1 END,
                      window_start = CASE WHEN window_start + ? <= excluded.window_start THEN excluded.window_start ELSE window_start END',
                    [$bucket, $key, $now, $windowSec, $windowSec]);
            }
            $row = $this->db->one('SELECT window_start, hits FROM rate_limits WHERE bucket = ? AND subject = ?', [$bucket, $key]);
            if ((int) $row['hits'] > $limit) {
                return max(1, (int) $row['window_start'] + $windowSec - $now);
            }
            return null;
        });
    }

    /** Give back one hit (e.g. the login succeeded, or the registration form was invalid). Atomic. */
    public function refund(string $bucket, string $subject): void
    {
        $this->db->run('UPDATE rate_limits SET hits = hits - 1 WHERE bucket = ? AND subject = ? AND hits > 0', [$bucket, self::key($subject)]);
    }

    public function clear(string $bucket, string $subject): void
    {
        $this->db->run('DELETE FROM rate_limits WHERE bucket = ? AND subject = ?', [$bucket, self::key($subject)]);
    }
}
