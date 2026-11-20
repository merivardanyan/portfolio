<?php
declare(strict_types=1);

namespace App\Repositories;

use App\Clock;
use App\Db;
use PDOException;

final class UserRepository
{
    public function __construct(private readonly Db $db)
    {
    }

    public function find(int $id): ?array
    {
        $u = $this->db->one('SELECT id, username, created_at FROM users WHERE id = ?', [$id]);
        return $u ? ['id' => (int) $u['id']] + $u : null;
    }

    /** Includes password_hash; only for the login flow. */
    public function findForLogin(string $username): ?array
    {
        return $this->db->one('SELECT id, username, password_hash, created_at FROM users WHERE username = ?', [$username]);
    }

    public function findByUsername(string $username): ?array
    {
        $u = $this->db->one('SELECT id, username, created_at FROM users WHERE username = ?', [$username]);
        return $u ? ['id' => (int) $u['id']] + $u : null;
    }

    /** @return int|null new id, or null if the username is taken */
    public function create(string $username, string $passwordHash): ?int
    {
        try {
            $this->db->run('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)', [$username, $passwordHash, Clock::nowStr()]);
            return $this->db->lastId();
        } catch (PDOException $e) {
            if (Db::isUniqueViolation($e)) {
                return null;
            }
            throw $e;
        }
    }

    public function updateHash(int $id, string $hash): void
    {
        $this->db->run('UPDATE users SET password_hash = ? WHERE id = ?', [$hash, $id]);
    }
}
