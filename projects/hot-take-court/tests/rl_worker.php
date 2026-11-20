<?php
declare(strict_types=1);

// Helper for tests/smoke.php: hammers one rate-limit key from a separate process.
// Usage: php tests/rl_worker.php <sqlite file> <attempts> <limit>
// Prints "<allowed> <errors>".

require dirname(__DIR__) . '/src/bootstrap.php';

use App\Db;
use App\RateLimiter;

[, $file, $attempts, $limit] = $argv;
$pdo = new PDO('sqlite:' . $file, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 20]);
$pdo->exec('PRAGMA journal_mode = WAL');
$rl = new RateLimiter(new Db($pdo));
$allowed = 0;
$errors = 0;
for ($i = 0; $i < (int) $attempts; $i++) {
    try {
        if ($rl->attempt('race', 'same-ip', (int) $limit, 600) === null) {
            $allowed++;
        }
    } catch (Throwable) {
        $errors++;
    }
}
echo "{$allowed} {$errors}\n";
