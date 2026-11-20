<?php
declare(strict_types=1);

namespace App;

/** Deterministic demo data: 60 users, 40 cases (some closed), votes, arguments, upvotes. */
final class Seeder
{
    public const DEMO_USER = 'demo';
    public const DEMO_PASSWORD = 'password123'; // documented demo credential, local seed only

    public const TAKES = [
        ['Pineapple belongs on pizza.', 'Food'],
        ['Cereal is a soup.', 'Food'],
        ['Breakfast for dinner beats dinner for dinner.', 'Food'],
        ['Ketchup on eggs is completely fine.', 'Food'],
        ['A hot dog is a sandwich.', 'Food'],
        ['Cold pizza is better than hot pizza.', 'Food'],
        ['Brunch is just an expensive late breakfast.', 'Food'],
        ['Tabs are better than spaces.', 'Tech'],
        ['Dark mode is overrated.', 'Tech'],
        ['Nobody needs more than 10 browser tabs open.', 'Tech'],
        ['Most apps should just be websites.', 'Tech'],
        ['Smart homes make life dumber.', 'Tech'],
        ['AI art is real art.', 'Tech'],
        ['Vim is not worth learning in 2026.', 'Tech'],
        ['Mechanical keyboards are a personality, not a tool.', 'Tech'],
        ['Making your bed every morning is pointless.', 'Life'],
        ['Showering at night is superior.', 'Life'],
        ['Early birds are smug, not productive.', 'Life'],
        ['Socks with sandals is peak comfort.', 'Life'],
        ['Texting is better than calling. Always.', 'Life'],
        ['Cats make better roommates than most people.', 'Life'],
        ['Airport food is underrated.', 'Life'],
        ['The window seat is the only acceptable seat.', 'Life'],
        ['Sequels are usually better than the original.', 'Pop Culture'],
        ['The book is not always better than the movie.', 'Pop Culture'],
        ['Reality TV is the most honest TV.', 'Pop Culture'],
        ['Superhero movies peaked a decade ago.', 'Pop Culture'],
        ['Spoilers do not actually ruin anything.', 'Pop Culture'],
        ['Musicals are better on stage than on screen. Always.', 'Pop Culture'],
        ['Rewatching a show is better than starting a new one.', 'Pop Culture'],
        ['Video games are the best storytelling medium.', 'Pop Culture'],
        ['Meetings should be banned before 10am.', 'Work'],
        ['Open-plan offices should be illegal.', 'Work'],
        ['A four-day week would make no difference to output.', 'Work'],
        ['Cameras-on should be optional in every meeting.', 'Work'],
        ['Reply-all is never the right call.', 'Work'],
        ['Hustle culture is just unpaid overtime.', 'Work'],
        ['Office birthday cake is mandatory fun.', 'Work'],
        ['Every meeting could have been an email.', 'Work'],
        ['Working from cafes is just performative.', 'Work'],
    ];

    private const ARGS_GUILTY = [
        'The evidence is overwhelming and frankly disturbing.', 'My grandmother would weep.', 'No reasonable person could defend this.',
        'I have tried it. Never again.', 'This take should be locked up.', 'Objection: this is just wrong.',
        'Respectfully, absolutely not.', 'The prosecution rests. Look at it.',
    ];
    private const ARGS_ACQUIT = [
        'Finally someone said it.', 'Free this take, it did nothing wrong.', 'Not guilty, just ahead of its time.',
        'Science agrees with the defendant.', 'I have lived this truth for years.', 'The jury is jealous it did not think of it first.',
        'Correct and brave.', 'Case dismissed. Obviously true.',
    ];

    public function __construct(private readonly Db $db)
    {
    }

    public function run(): array
    {
        mt_srand(20261119);
        $now = Clock::now();
        return $this->db->transaction(function () use ($now): array {
            // password_hash is deliberately slow; hash once and reuse for juror bots.
            $demoHash = password_hash(self::DEMO_PASSWORD, PASSWORD_DEFAULT);
            $botHash = password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT); // unknowable password
            $names = ['demo', 'judge_judy', 'objection', 'gavel_guy', 'hotsauce', 'ctrl_alt_defeat', 'snack_court', 'devils_advocate'];
            for ($i = count($names); $i < 60; $i++) {
                $names[] = sprintf('juror_%02d', $i);
            }
            $userIds = [];
            foreach ($names as $i => $n) {
                $this->db->run('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)',
                    [$n, $i === 0 ? $demoHash : $botHash, Clock::fmt($now - 14 * 86400 + $i * 600)]);
                $userIds[] = $this->db->lastId();
            }
            $demoId = $userIds[0];

            $counts = ['cases' => 0, 'votes' => 0, 'arguments' => 0, 'upvotes' => 0];
            foreach (self::TAKES as $i => [$body, $cat]) {
                // ~1/3 closed (older than 72h), the rest open at various ages
                $ageH = $i % 3 === 0 ? mt_rand(80, 200) : mt_rand(1, 70);
                $created = $now - $ageH * 3600 - mt_rand(0, 3599);
                $closes = $created + Verdict::OPEN_HOURS * 3600;
                $owner = $i < 5 ? $demoId : $userIds[1 + ($i % 59)]; // demo user owns a few cases for the profile page
                $this->db->run('INSERT INTO cases (user_id, body, category, created_at, closes_at) VALUES (?, ?, ?, ?, ?)',
                    [$owner, $body, $cat, Clock::fmt($created), Clock::fmt($closes)]);
                $caseId = $this->db->lastId();
                $counts['cases']++;

                $pGuilty = mt_rand(15, 85) / 100;
                $voters = array_values(array_filter($userIds, static fn ($u) => $u !== $owner && $u !== $demoId));
                shuffle($voters);
                $voters = array_slice($voters, 0, mt_rand(6, 55));
                if ($owner !== $demoId && $i % 2 === 1) {
                    $voters[] = $demoId; // demo user has a voting record
                }
                $end = min($now, $closes);
                $g = $a = 0;
                $voted = [];
                foreach ($voters as $u) {
                    $verdict = (mt_rand() / mt_getrandmax()) < $pGuilty ? 'guilty' : 'acquit';
                    // votes skew towards the start of the trial
                    $t = $created + (int) (($end - $created) * (mt_rand() / mt_getrandmax()) ** 2);
                    $this->db->run('INSERT INTO votes (case_id, user_id, verdict, created_at) VALUES (?, ?, ?, ?)',
                        [$caseId, $u, $verdict, Clock::fmt($t)]);
                    $verdict === 'guilty' ? $g++ : $a++;
                    $voted[] = [$u, $verdict, $t];
                    $counts['votes']++;
                }
                $this->db->run('UPDATE cases SET guilty_count = ?, acquit_count = ? WHERE id = ?', [$g, $a, $caseId]);

                // a few arguments, then upvotes from other voters
                $argIds = [];
                foreach (array_slice($voted, 0, mt_rand(2, 5)) as [$u, $side, $t]) {
                    $pool = $side === 'guilty' ? self::ARGS_GUILTY : self::ARGS_ACQUIT;
                    $this->db->run('INSERT INTO arguments (case_id, user_id, side, body, upvotes, created_at) VALUES (?, ?, ?, ?, 0, ?)',
                        [$caseId, $u, $side, $pool[mt_rand(0, count($pool) - 1)], Clock::fmt($t)]);
                    $argIds[] = [$this->db->lastId(), $u];
                    $counts['arguments']++;
                }
                foreach ($argIds as [$argId, $author]) {
                    $n = 0;
                    foreach ($voted as [$u]) {
                        if ($u !== $author && mt_rand(0, 3) === 0) {
                            $this->db->run('INSERT INTO argument_upvotes (argument_id, user_id) VALUES (?, ?)', [$argId, $u]);
                            $n++;
                        }
                    }
                    $this->db->run('UPDATE arguments SET upvotes = ? WHERE id = ?', [$n, $argId]);
                    $counts['upvotes'] += $n;
                }
            }
            return $counts;
        });
    }
}
