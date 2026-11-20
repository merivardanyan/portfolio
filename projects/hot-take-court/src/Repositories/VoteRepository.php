<?php
declare(strict_types=1);

namespace App\Repositories;

use App\Clock;
use App\Db;
use App\HttpException;
use PDOException;

final class VoteRepository
{
    public function __construct(private readonly Db $db)
    {
    }

    public function find(int $caseId, int $userId): ?string
    {
        $v = $this->db->value('SELECT verdict FROM votes WHERE case_id = ? AND user_id = ?', [$caseId, $userId]);
        return $v === null ? null : (string) $v;
    }

    /**
     * Cast a vote. The (case_id, user_id) primary key is the real guard against double
     * votes (two concurrent requests cannot both insert); the counter update runs in the
     * same transaction so counts never drift from the votes table.
     * @return array{guilty:int, acquit:int, yourVote:string}
     */
    public function cast(int $caseId, int $userId, string $verdict): array
    {
        if (!in_array($verdict, ['guilty', 'acquit'], true)) {
            throw new HttpException(422, 'invalid_verdict', "verdict must be 'guilty' or 'acquit'");
        }
        return $this->db->transaction(function () use ($caseId, $userId, $verdict): array {
            $case = $this->db->one('SELECT user_id, closes_at FROM cases WHERE id = ?', [$caseId]);
            if (!$case) {
                throw new HttpException(404, 'case_not_found', 'No such case');
            }
            if ((int) $case['user_id'] === $userId) {
                throw new HttpException(403, 'own_case', "You can't sit on the jury of your own case");
            }
            if (Clock::parse($case['closes_at']) <= Clock::now()) {
                throw new HttpException(409, 'case_closed', 'This case is closed; the verdict is in');
            }
            try {
                $this->db->run('INSERT INTO votes (case_id, user_id, verdict, created_at) VALUES (?, ?, ?, ?)',
                    [$caseId, $userId, $verdict, Clock::nowStr()]);
            } catch (PDOException $e) {
                if (Db::isUniqueViolation($e)) {
                    throw new HttpException(409, 'already_voted', 'You already voted on this case');
                }
                throw $e;
            }
            $col = $verdict === 'guilty' ? 'guilty_count' : 'acquit_count'; // whitelisted above, never user text
            $this->db->run("UPDATE cases SET {$col} = {$col} + 1 WHERE id = ?", [$caseId]);
            $c = $this->db->one('SELECT guilty_count, acquit_count FROM cases WHERE id = ?', [$caseId]);
            return ['guilty' => (int) $c['guilty_count'], 'acquit' => (int) $c['acquit_count'], 'yourVote' => $verdict];
        });
    }
}
