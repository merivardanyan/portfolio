<?php
declare(strict_types=1);

namespace App;

use PDO;
use PDOException;

/**
 * PDO wrapper. SQLite locally, MySQL 8 in production; only DSN differs.
 * Every query goes through prepared statements with bound parameters.
 */
final class Db
{
    private static ?Db $instance = null;
    private int $depth = 0;

    public function __construct(public readonly PDO $pdo)
    {
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        $pdo->setAttribute(PDO::ATTR_EMULATE_PREPARES, false);
        if ($this->driver() === 'sqlite') {
            $pdo->exec('PRAGMA foreign_keys = ON');
            $pdo->exec('PRAGMA busy_timeout = 3000');
        }
    }

    public static function fromConfig(): self
    {
        if (self::$instance) {
            return self::$instance;
        }
        $dsn = Config::get('DB_DSN', 'sqlite:' . Config::root() . '/data/hot-take-court.sqlite');
        if (str_starts_with($dsn, 'sqlite:') && !str_contains($dsn, ':memory:')) {
            $path = substr($dsn, 7);
            if (!preg_match('~^([A-Za-z]:)?[/\\\\]~', $path)) {
                $path = Config::root() . '/' . $path; // relative to project root
                $dsn = 'sqlite:' . $path;
            }
            if (!is_dir(dirname($path))) {
                mkdir(dirname($path), 0775, true);
            }
        }
        $options = [];
        if (str_starts_with($dsn, 'mysql:')) {
            // PHP 8.4+ exposes driver constants on Pdo\Mysql; PDO::MYSQL_* is deprecated in 8.5.
            $initCmd = class_exists(\Pdo\Mysql::class) ? \Pdo\Mysql::ATTR_INIT_COMMAND : 1002;
            $options[$initCmd] = "SET NAMES utf8mb4, time_zone = '+00:00'";
        }
        $pdo = new PDO($dsn, Config::get('DB_USER'), Config::get('DB_PASS'), $options);
        return self::$instance = new self($pdo);
    }

    public static function reset(): void
    {
        self::$instance = null;
    }

    public function driver(): string
    {
        return (string) $this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
    }

    /** Prepare and bind; ints as PARAM_INT (needed for LIMIT/OFFSET with native prepares). */
    private function prepare(string $sql, array $params): \PDOStatement
    {
        $st = $this->pdo->prepare($sql);
        $i = 1;
        foreach ($params as $v) {
            $st->bindValue($i++, $v, match (true) {
                is_int($v) => PDO::PARAM_INT,
                is_bool($v) => PDO::PARAM_BOOL,
                $v === null => PDO::PARAM_NULL,
                default => PDO::PARAM_STR,
            });
        }
        return $st;
    }

    /** @return array<int, array<string, mixed>> */
    public function all(string $sql, array $params = []): array
    {
        $st = $this->prepare($sql, $params);
        $st->execute();
        return $st->fetchAll();
    }

    /** @return array<string, mixed>|null */
    public function one(string $sql, array $params = []): ?array
    {
        $st = $this->prepare($sql, $params);
        $st->execute();
        $row = $st->fetch();
        return $row === false ? null : $row;
    }

    public function value(string $sql, array $params = []): mixed
    {
        $st = $this->prepare($sql, $params);
        $st->execute();
        $v = $st->fetchColumn();
        return $v === false ? null : $v;
    }

    public function run(string $sql, array $params = []): int
    {
        $st = $this->prepare($sql, $params);
        $st->execute();
        return $st->rowCount();
    }

    public function lastId(): int
    {
        return (int) $this->pdo->lastInsertId();
    }

    /**
     * @template T
     * @param callable(): T $fn
     * @return T
     */
    public function transaction(callable $fn): mixed
    {
        // Nested calls join the outer transaction, so repositories can be composed into
        // one unit of work (e.g. vote + argument) without savepoints.
        if ($this->depth > 0) {
            $this->depth++;
            try {
                return $fn();
            } finally {
                $this->depth--;
            }
        }
        // SQLite: BEGIN IMMEDIATE takes the write lock up front. A DEFERRED transaction that
        // reads and then writes can deadlock with another writer and fail with SQLITE_BUSY
        // without ever waiting on busy_timeout. MySQL/InnoDB: a normal transaction; write
        // paths use atomic UPDATE/UPSERT statements or the PK so no read-modify-write races.
        if ($this->driver() === 'sqlite') {
            $this->pdo->exec('BEGIN IMMEDIATE');
        } else {
            $this->pdo->beginTransaction();
        }
        $this->depth = 1;
        try {
            $result = $fn();
            $this->driver() === 'sqlite' ? $this->pdo->exec('COMMIT') : $this->pdo->commit();
            return $result;
        } catch (\Throwable $e) {
            $this->driver() === 'sqlite' ? $this->pdo->exec('ROLLBACK') : $this->pdo->rollBack();
            throw $e;
        } finally {
            $this->depth = 0;
        }
    }

    public function inTransaction(): bool
    {
        return $this->depth > 0;
    }

    /**
     * True only for UNIQUE / PRIMARY KEY violations. SQLSTATE 23000 alone also covers
     * FOREIGN KEY, NOT NULL and CHECK failures, which must not be reported as "duplicate".
     */
    public static function isUniqueViolation(PDOException $e): bool
    {
        $driverCode = (int) ($e->errorInfo[1] ?? 0);
        if ($driverCode === 1062) { // MySQL ER_DUP_ENTRY (PK and unique keys)
            return true;
        }
        // SQLite reports both PK and UNIQUE as "UNIQUE constraint failed: table.col"
        return str_contains($e->getMessage(), 'UNIQUE constraint failed');
    }

    /** Create tables (and seed) on first run against an empty SQLite database. */
    public function ensureSchema(bool $seed = true): bool
    {
        if ($this->driver() !== 'sqlite') {
            return false; // MySQL: apply db/schema.mysql.sql via your migration process
        }
        $exists = $this->value("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'");
        if ($exists) {
            return false;
        }
        $this->pdo->exec((string) file_get_contents(Config::root() . '/db/schema.sqlite.sql'));
        if ($seed) {
            (new Seeder($this))->run();
        }
        return true;
    }
}
