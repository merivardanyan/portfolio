<?php
declare(strict_types=1);

namespace App;

/** Pure verdict rules for a case row. */
final class Verdict
{
    public const CATEGORIES = ['Food', 'Tech', 'Life', 'Pop Culture', 'Work'];
    public const OPEN_HOURS = 72;

    /**
     * @param array{guilty_count:int|string, acquit_count:int|string, closes_at:string} $case
     * @return array{open:bool, label:string, guilty:int, acquit:int, total:int, guiltyPct:int, acquitPct:int, lean:string}
     */
    public static function of(array $case, ?int $now = null): array
    {
        $now ??= Clock::now();
        $g = (int) $case['guilty_count'];
        $a = (int) $case['acquit_count'];
        $total = $g + $a;
        $gp = $total ? (int) round($g * 100 / $total) : 50;
        $open = Clock::parse($case['closes_at']) > $now;
        $lean = $g === $a ? 'split' : ($g > $a ? 'guilty' : 'acquit');
        $label = match (true) {
            $open => 'DELIBERATING',
            $total === 0, $g === $a => 'HUNG JURY',
            $g > $a => 'GUILTY',
            default => 'ACQUITTED',
        };
        return ['open' => $open, 'label' => $label, 'guilty' => $g, 'acquit' => $a, 'total' => $total,
            'guiltyPct' => $gp, 'acquitPct' => 100 - $gp, 'lean' => $lean];
    }

    /** "Pineapple belongs on pizza: ACQUITTED 61-39" */
    public static function headline(array $case, ?int $now = null): string
    {
        $v = self::of($case, $now);
        $score = $v['total'] ? " {$v['acquitPct']}-{$v['guiltyPct']}" : '';
        if ($v['label'] === 'GUILTY') {
            $score = $v['total'] ? " {$v['guiltyPct']}-{$v['acquitPct']}" : '';
        }
        return rtrim($case['body'], '. ') . ': ' . $v['label'] . ($v['open'] ? '' : $score);
    }

    /**
     * Trending score: votes from the last 24h, each decayed by its age (half-life 6h),
     * with a mild penalty for older cases so fresh takes can surface.
     * @param list<int> $voteTimestamps
     */
    public static function trendingScore(array $voteTimestamps, int $createdAt, int $now): float
    {
        $score = 0.0;
        foreach ($voteTimestamps as $t) {
            $ageH = max(0, $now - $t) / 3600;
            if ($ageH <= 24) {
                $score += 0.5 ** ($ageH / 6);
            }
        }
        $caseAgeH = max(0, $now - $createdAt) / 3600;
        return $score / (1 + $caseAgeH / 72);
    }
}
