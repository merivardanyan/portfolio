<?php
declare(strict_types=1);

// Usage:
//   php db/seed.php            create schema (SQLite) if missing and seed if empty
//   php db/seed.php --fresh    SQLite only: delete the database file and rebuild it
// MySQL: apply db/schema.mysql.sql first, then run this with DB_DSN pointing at MySQL.

require dirname(__DIR__) . '/src/bootstrap.php';

use App\Config;
use App\Db;
use App\Seeder;

$dsn = Config::get('DB_DSN', 'sqlite:' . Config::root() . '/data/hot-take-court.sqlite');
if (in_array('--fresh', $argv, true)) {
    if (!str_starts_with($dsn, 'sqlite:')) {
        fwrite(STDERR, "--fresh only supports SQLite. Drop and recreate the MySQL database manually.\n");
        exit(1);
    }
    $path = substr($dsn, 7);
    if (!preg_match('~^([A-Za-z]:)?[/\\\\]~', $path)) {
        $path = Config::root() . '/' . $path;
    }
    foreach ([$path, "{$path}-wal", "{$path}-shm"] as $f) {
        if (is_file($f)) {
            unlink($f);
        }
    }
    echo "Removed {$path}\n";
}

$db = Db::fromConfig();
if ($db->ensureSchema(false)) {
    echo "Created schema from db/schema.sqlite.sql\n";
}
if ((int) $db->value('SELECT COUNT(*) FROM users') > 0) {
    echo "Database already has data; nothing to seed. Use --fresh to rebuild.\n";
    exit(0);
}
$counts = (new Seeder($db))->run();
printf("Seeded %d cases, %d votes, %d arguments, %d upvotes.\nDemo login: %s / %s\n",
    $counts['cases'], $counts['votes'], $counts['arguments'], $counts['upvotes'], Seeder::DEMO_USER, Seeder::DEMO_PASSWORD);
