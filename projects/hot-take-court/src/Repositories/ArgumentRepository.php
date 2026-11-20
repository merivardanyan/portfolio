<?php
declare(strict_types=1);

namespace App\Repositories;

use App\Clock;
use App\Db;
use App\HttpException;
use PDOException;

final class ArgumentRepository
{
    public function __construct(private readonly Db $db)
    {
    }

    /** Side is taken from the user's vote: you argue for the verdict you cast. */
    public function create(int $caseId, int $userId, string $body): array
    {
        return $this->db->transaction(function () use ($caseId, $userId, $body): array {
            $case = $this->db->one('SELECT closes_at FROM cases WHERE id = ?', [$caseId]);
            if (!$case) {
                throw new HttpException(404, 'case_not_found', 'No such case');
            }
            if (Clock::parse($case['closes_at']) <= Clock::now()) {
                throw new HttpException(409, 'case_closed', 'This case is closed');
            }
            $side = $this->db->value('SELECT verdict FROM votes WHERE case_id = ? AND user_id = ?', [$caseId, $userId]);
            if ($side === null) {
                throw new HttpException(403, 'vote_first', 'Vote before you argue');
            }
            try {
                $this->db->run('INSERT INTO arguments (case_id, user_id, side, body, created_at) VALUES (?, ?, ?, ?, ?)',
                    [$caseId, $userId, $side, $body, Clock::nowStr()]);
            } catch (PDOException $e) {
                if (Db::isUniqueViolation($e)) {
                    throw new HttpException(409, 'already_argued', 'You already made your argument on this case');
                }
                throw $e;
            }
            return $this->find($this->db->lastId());
        });
    }

    public function find(int $id): ?array
    {
        $a = $this->db->one('SELECT a.id, a.case_id, a.side, a.body, a.upvotes, a.created_at, u.username
            FROM arguments a JOIN users u ON u.id = a.user_id WHERE a.id = ?', [$id]);
        return $a ? self::shape($a) : null;
    }

    /** @return array{guilty: ?array, acquit: ?array} */
    public function top(int $caseId): array
    {
        $out = ['guilty' => null, 'acquit' => null];
        foreach (['guilty', 'acquit'] as $side) {
            $a = $this->db->one('SELECT a.id, a.case_id, a.side, a.body, a.upvotes, a.created_at, u.username
                FROM arguments a JOIN users u ON u.id = a.user_id
                WHERE a.case_id = ? AND a.side = ? ORDER BY a.upvotes DESC, a.created_at ASC, a.id ASC LIMIT 1', [$caseId, $side]);
            $out[$side] = $a ? self::shape($a) : null;
        }
        return $out;
    }

    public function forCase(int $caseId, ?int $viewerId, int $limit = 50): array
    {
        $rows = $this->db->all('SELECT a.id, a.case_id, a.side, a.body, a.upvotes, a.created_at, u.username, a.user_id,
                CASE WHEN au.user_id IS NULL THEN 0 ELSE 1 END AS mine_upvoted
            FROM arguments a JOIN users u ON u.id = a.user_id
            LEFT JOIN argument_upvotes au ON au.argument_id = a.id AND au.user_id = ?
            WHERE a.case_id = ? ORDER BY a.upvotes DESC, a.created_at ASC, a.id ASC LIMIT ?', [$viewerId ?? 0, $caseId, $limit]);
        return array_map(static fn ($r) => self::shape($r) + [
            'upvotedByMe' => (bool) $r['mine_upvoted'],
            'isMine' => $viewerId !== null && (int) $r['user_id'] === $viewerId,
        ], $rows);
    }

    /** @return array{id:int, upvotes:int} */
    public function upvote(int $argumentId, int $userId): array
    {
        return $this->db->transaction(function () use ($argumentId, $userId): array {
            $a = $this->db->one('SELECT a.user_id, c.closes_at FROM arguments a JOIN cases c ON c.id = a.case_id WHERE a.id = ?', [$argumentId]);
            if (!$a) {
                throw new HttpException(404, 'argument_not_found', 'No such argument');
            }
            if ((int) $a['user_id'] === $userId) {
                throw new HttpException(403, 'own_argument', "You can't upvote your own argument");
            }
            if (Clock::parse($a['closes_at']) <= Clock::now()) {
                throw new HttpException(409, 'case_closed', 'This case is closed');
            }
            try {
                $this->db->run('INSERT INTO argument_upvotes (argument_id, user_id) VALUES (?, ?)', [$argumentId, $userId]);
            } catch (PDOException $e) {
                if (Db::isUniqueViolation($e)) {
                    throw new HttpException(409, 'already_upvoted', 'You already upvoted this argument');
                }
                throw $e;
            }
            $this->db->run('UPDATE arguments SET upvotes = upvotes + 1 WHERE id = ?', [$argumentId]);
            return ['id' => $argumentId, 'upvotes' => (int) $this->db->value('SELECT upvotes FROM arguments WHERE id = ?', [$argumentId])];
        });
    }

    private static function shape(array $a): array
    {
        return ['id' => (int) $a['id'], 'caseId' => (int) $a['case_id'], 'side' => $a['side'], 'body' => $a['body'],
            'upvotes' => (int) $a['upvotes'], 'createdAt' => $a['created_at'], 'username' => $a['username']];
    }
}
