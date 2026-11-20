<?php
declare(strict_types=1);

namespace App\Repositories;

use App\Clock;
use App\Db;
use App\Verdict;

final class CaseRepository
{
    private const SELECT = 'SELECT c.id, c.user_id, c.body, c.category, c.created_at, c.closes_at, c.guilty_count, c.acquit_count, u.username
        FROM cases c JOIN users u ON u.id = c.user_id';

    public function __construct(private readonly Db $db)
    {
    }

    /**
     * File a case unless the same user already has an OPEN case with the same text
     * (case-insensitive): a double-submitted form must not create two cases.
     * Serialised per user: SQLite BEGIN IMMEDIATE holds the write lock; on MySQL the
     * `FOR UPDATE` on the user's row makes concurrent filings by the same user wait.
     * @return array{id:int, created:bool}
     */
    public function create(int $userId, string $body, string $category): array
    {
        return $this->db->transaction(function () use ($userId, $body, $category): array {
            $lock = $this->db->driver() === 'mysql' ? ' FOR UPDATE' : '';
            $this->db->value('SELECT id FROM users WHERE id = ?' . $lock, [$userId]);
            $now = Clock::now();
            $existing = $this->db->value('SELECT id FROM cases WHERE user_id = ? AND LOWER(body) = LOWER(?) AND closes_at > ? ORDER BY id DESC LIMIT 1',
                [$userId, $body, Clock::fmt($now)]);
            if ($existing !== null) {
                return ['id' => (int) $existing, 'created' => false];
            }
            $this->db->run('INSERT INTO cases (user_id, body, category, created_at, closes_at) VALUES (?, ?, ?, ?, ?)',
                [$userId, $body, $category, Clock::fmt($now), Clock::fmt($now + Verdict::OPEN_HOURS * 3600)]);
            return ['id' => $this->db->lastId(), 'created' => true];
        });
    }

    public function find(int $id): ?array
    {
        return $this->db->one(self::SELECT . ' WHERE c.id = ?', [$id]);
    }

    /**
     * Paginated docket.
     * @param 'trending'|'new'|'closing' $sort
     * @return array{items: list<array>, page:int, pages:int, total:int, perPage:int, sort:string, category:?string}
     */
    public function docket(string $sort, int $page, int $perPage = 10, ?string $category = null): array
    {
        $now = Clock::now();
        $nowStr = Clock::fmt($now);
        $page = max(1, $page);
        $catSql = $category ? ' AND c.category = ?' : '';
        $catArg = $category ? [$category] : [];

        if ($sort === 'trending') {
            // Rank open cases in PHP (portable; no POW()/EXP() dependency in SQLite builds).
            $open = $this->db->all('SELECT c.id, c.created_at FROM cases c WHERE c.closes_at > ?' . $catSql, [$nowStr, ...$catArg]);
            $votes = $this->db->all('SELECT v.case_id, v.created_at FROM votes v JOIN cases c ON c.id = v.case_id
                WHERE v.created_at > ? AND c.closes_at > ?' . $catSql, [Clock::fmt($now - 86400), $nowStr, ...$catArg]);
            $byCase = [];
            foreach ($votes as $v) {
                $byCase[(int) $v['case_id']][] = Clock::parse($v['created_at']);
            }
            $scored = [];
            foreach ($open as $c) {
                $id = (int) $c['id'];
                $scored[$id] = [Verdict::trendingScore($byCase[$id] ?? [], Clock::parse($c['created_at']), $now), $c['created_at']];
            }
            uksort($scored, static fn ($a, $b) => [$scored[$b][0], $scored[$b][1], $b] <=> [$scored[$a][0], $scored[$a][1], $a]);
            $total = count($scored);
            $ids = array_slice(array_keys($scored), ($page - 1) * $perPage, $perPage);
            $items = [];
            if ($ids) {
                $rows = $this->db->all(self::SELECT . ' WHERE c.id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')', $ids);
                $byId = array_column($rows, null, 'id');
                foreach ($ids as $id) {
                    $items[] = $byId[$id] + ['trending' => round($scored[$id][0], 3)];
                }
            }
        } elseif ($sort === 'closing') {
            $total = (int) $this->db->value('SELECT COUNT(*) FROM cases c WHERE c.closes_at > ?' . $catSql, [$nowStr, ...$catArg]);
            $items = $this->db->all(self::SELECT . ' WHERE c.closes_at > ?' . $catSql . ' ORDER BY c.closes_at ASC, c.id ASC LIMIT ? OFFSET ?',
                [$nowStr, ...$catArg, $perPage, ($page - 1) * $perPage]);
        } else {
            $sort = 'new';
            $total = (int) $this->db->value('SELECT COUNT(*) FROM cases c WHERE 1 = 1' . $catSql, $catArg);
            $items = $this->db->all(self::SELECT . ' WHERE 1 = 1' . $catSql . ' ORDER BY c.created_at DESC, c.id DESC LIMIT ? OFFSET ?',
                [...$catArg, $perPage, ($page - 1) * $perPage]);
        }
        return ['items' => $items, 'page' => $page, 'pages' => max(1, (int) ceil($total / $perPage)), 'total' => $total,
            'perPage' => $perPage, 'sort' => $sort, 'category' => $category];
    }

    public function byUser(int $userId, int $limit = 50): array
    {
        return $this->db->all(self::SELECT . ' WHERE c.user_id = ? ORDER BY c.created_at DESC LIMIT ?', [$userId, $limit]);
    }

    /** "Defended 12 takes, 8 acquitted" (closed cases only, except `filed`). */
    public function record(int $userId): array
    {
        $now = Clock::nowStr();
        $r = $this->db->one('SELECT COUNT(*) AS filed,
              SUM(CASE WHEN closes_at <= ? THEN 1 ELSE 0 END) AS closed,
              SUM(CASE WHEN closes_at <= ? AND acquit_count > guilty_count THEN 1 ELSE 0 END) AS acquitted,
              SUM(CASE WHEN closes_at <= ? AND guilty_count > acquit_count THEN 1 ELSE 0 END) AS guilty
            FROM cases WHERE user_id = ?', [$now, $now, $now, $userId]);
        return array_map('intval', $r ?? []);
    }

    /** % of the user's votes on closed, decided cases that matched the jury majority. */
    public function agreement(int $userId): array
    {
        $r = $this->db->one("SELECT COUNT(*) AS decided,
              SUM(CASE WHEN (v.verdict = 'guilty' AND c.guilty_count > c.acquit_count)
                         OR (v.verdict = 'acquit' AND c.acquit_count > c.guilty_count) THEN 1 ELSE 0 END) AS agreed
            FROM votes v JOIN cases c ON c.id = v.case_id
            WHERE v.user_id = ? AND c.closes_at <= ? AND c.guilty_count <> c.acquit_count", [$userId, Clock::nowStr()]);
        $decided = (int) ($r['decided'] ?? 0);
        $agreed = (int) ($r['agreed'] ?? 0);
        $votes = (int) $this->db->value('SELECT COUNT(*) FROM votes WHERE user_id = ?', [$userId]);
        return ['votes' => $votes, 'decided' => $decided, 'agreed' => $agreed, 'rate' => $decided ? (int) round($agreed * 100 / $decided) : null];
    }
}
