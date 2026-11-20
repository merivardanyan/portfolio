<?php
declare(strict_types=1);

// PHPUnit-free test runner.  php tests/smoke.php
// Part 1: domain + repositories against in-memory SQLite.
// Part 2: full HTTP flow against `php -S` with a throwaway SQLite file (sessions, CSRF, rate limits, JSON API).

require dirname(__DIR__) . '/src/bootstrap.php';

use App\Clock;
use App\Config;
use App\Db;
use App\HttpException;
use App\RateLimiter;
use App\Repositories\ArgumentRepository;
use App\Repositories\CaseRepository;
use App\Repositories\UserRepository;
use App\Repositories\VoteRepository;
use App\Seeder;
use App\Verdict;
use App\VerdictCard;

$passed = 0;
$failed = [];
function check(string $name, callable $fn): void
{
    global $passed, $failed;
    try {
        $fn();
        $passed++;
        echo "  ok   {$name}\n";
    } catch (Throwable $e) {
        $failed[] = $name;
        echo "  FAIL {$name}\n       " . get_class($e) . ': ' . $e->getMessage() . ' @ ' . basename($e->getFile()) . ':' . $e->getLine() . "\n";
    }
}
function eq(mixed $actual, mixed $expected, string $msg = ''): void
{
    if ($actual !== $expected) {
        throw new RuntimeException(($msg ? "{$msg}: " : '') . 'expected ' . var_export($expected, true) . ', got ' . var_export($actual, true));
    }
}
function ok(bool $cond, string $msg): void
{
    if (!$cond) {
        throw new RuntimeException($msg);
    }
}
function throwsHttp(callable $fn, string $code): void
{
    try {
        $fn();
    } catch (HttpException $e) {
        eq($e->errorCode, $code, 'error code');
        return;
    }
    throw new RuntimeException("expected HttpException {$code}");
}
function freshDb(): Db
{
    $db = new Db(new PDO('sqlite::memory:'));
    $db->pdo->exec((string) file_get_contents(Config::root() . '/db/schema.sqlite.sql'));
    return $db;
}

echo "Part 1: domain and repositories\n";

check('Verdict rules: open, guilty, acquitted, hung', function () {
    $now = Clock::parse('2026-11-19 12:00:00');
    $open = ['guilty_count' => 3, 'acquit_count' => 1, 'closes_at' => '2026-11-20 00:00:00', 'body' => 'X'];
    $closed = ['closes_at' => '2026-11-18 00:00:00', 'body' => 'Pineapple belongs on pizza'];
    eq(Verdict::of($open, $now)['label'], 'DELIBERATING');
    eq(Verdict::of($open, $now)['lean'], 'guilty');
    eq(Verdict::of($closed + ['guilty_count' => 61, 'acquit_count' => 39], $now)['label'], 'GUILTY');
    eq(Verdict::of($closed + ['guilty_count' => 39, 'acquit_count' => 61], $now)['label'], 'ACQUITTED');
    eq(Verdict::of($closed + ['guilty_count' => 5, 'acquit_count' => 5], $now)['label'], 'HUNG JURY');
    eq(Verdict::of($closed + ['guilty_count' => 0, 'acquit_count' => 0], $now)['guiltyPct'], 50);
    eq(Verdict::headline($closed + ['guilty_count' => 39, 'acquit_count' => 61], $now), 'Pineapple belongs on pizza: ACQUITTED 61-39');
    eq(Verdict::headline($closed + ['guilty_count' => 61, 'acquit_count' => 39], $now), 'Pineapple belongs on pizza: GUILTY 61-39');
});

check('Trending score decays with vote age and case age', function () {
    $now = 1_000_000;
    $fresh = Verdict::trendingScore([$now, $now], $now - 3600, $now);
    $stale = Verdict::trendingScore([$now - 12 * 3600, $now - 12 * 3600], $now - 3600, $now);
    $old = Verdict::trendingScore([$now - 25 * 3600], $now - 30 * 3600, $now);
    ok($fresh > $stale, 'fresh votes should beat 12h-old votes');
    eq($old, 0.0, 'votes older than 24h ignored');
    ok(Verdict::trendingScore([$now], $now, $now) > Verdict::trendingScore([$now], $now - 60 * 3600, $now), 'newer case wins');
});

check('VerdictCard: valid SVG, escapes user text, wraps long takes', function () {
    $case = ['id' => 7, 'body' => 'Tabs > spaces & "quotes" <script>alert(1)</script> with averyveryveryveryverylongwordthatneedsbreaking',
        'category' => 'Tech', 'username' => 'dev', 'guilty_count' => 2, 'acquit_count' => 1, 'closes_at' => '2000-01-01 00:00:00'];
    $svg = VerdictCard::svg($case);
    $dom = new DOMDocument();
    ok($dom->loadXML($svg) === true, 'SVG must be well-formed XML');
    ok(!str_contains($svg, '<script>'), 'user text must be escaped');
    ok(str_contains($svg, 'GUILTY'), 'stamp');
    ok(str_contains($svg, 'CASE No. 0007'), 'case number');
    $lines = VerdictCard::wrap(str_repeat('word ', 60), 30, 4);
    eq(count($lines), 4);
    ok(str_ends_with($lines[3], '…'), 'ellipsis on overflow');
    foreach (VerdictCard::wrap('ünïcödé ' . str_repeat('x', 70), 30, 4) as $l) {
        ok(mb_strlen($l) <= 30, 'line width');
    }
});

check('Users: unique (case-insensitive) usernames', function () {
    $db = freshDb();
    $users = new UserRepository($db);
    ok($users->create('alice', password_hash('pw', PASSWORD_DEFAULT)) !== null, 'create');
    eq($users->create('ALICE', 'x'), null, 'duplicate username rejected by DB');
    eq($users->findByUsername('Alice')['username'], 'alice');
    ok(!isset($users->find(1)['password_hash']), 'find() never returns the hash');
});

check('Votes: one per user per case is enforced by the database', function () {
    $db = freshDb();
    $u = new UserRepository($db);
    $a = $u->create('owner', 'x');
    $b = $u->create('juror', 'x');
    $cases = new CaseRepository($db);
    $votes = new VoteRepository($db);
    $id = $cases->create($a, 'Cereal is soup', 'Food')['id'];
    $r = $votes->cast($id, $b, 'guilty');
    eq($r, ['guilty' => 1, 'acquit' => 0, 'yourVote' => 'guilty']);
    throwsHttp(fn () => $votes->cast($id, $b, 'acquit'), 'already_voted');
    // Even bypassing the repository, the PK rejects a second row:
    $raised = false;
    try {
        $db->run("INSERT INTO votes (case_id, user_id, verdict, created_at) VALUES (?, ?, 'acquit', ?)", [$id, $b, Clock::nowStr()]);
    } catch (PDOException $e) {
        $raised = Db::isUniqueViolation($e);
    }
    ok($raised, 'raw duplicate insert must violate the primary key');
    eq((int) $cases->find($id)['guilty_count'], 1, 'counter not double-incremented after failed vote');
    eq((int) $cases->find($id)['acquit_count'], 0);
    throwsHttp(fn () => $votes->cast($id, $a, 'guilty'), 'own_case');
    throwsHttp(fn () => $votes->cast($id, $b, 'maybe'), 'invalid_verdict');
    throwsHttp(fn () => $votes->cast(999, $b, 'guilty'), 'case_not_found');
    eq($votes->find($id, $b), 'guilty');
});

check('Closed cases reject votes, arguments and upvotes', function () {
    $db = freshDb();
    $u = new UserRepository($db);
    [$a, $b, $c] = [$u->create('a1x', 'x'), $u->create('b1x', 'x'), $u->create('c1x', 'x')];
    $cases = new CaseRepository($db);
    $votes = new VoteRepository($db);
    $args = new ArgumentRepository($db);
    $id = $cases->create($a, 'Time travel', 'Life')['id'];
    $votes->cast($id, $b, 'acquit');
    $arg = $args->create($id, $b, 'It is fine');
    Clock::freeze(Clock::now() + 73 * 3600);
    try {
        throwsHttp(fn () => $votes->cast($id, $c, 'guilty'), 'case_closed');
        throwsHttp(fn () => $args->create($id, $c, 'late'), 'case_closed');
        throwsHttp(fn () => $args->upvote($arg['id'], $c), 'case_closed');
        eq(Verdict::of($cases->find($id))['label'], 'ACQUITTED');
    } finally {
        Clock::freeze(null);
    }
});

check('Arguments: vote first, side follows your vote, one each, upvotes', function () {
    $db = freshDb();
    $u = new UserRepository($db);
    [$a, $b, $c] = [$u->create('a2x', 'x'), $u->create('b2x', 'x'), $u->create('c2x', 'x')];
    $cases = new CaseRepository($db);
    $votes = new VoteRepository($db);
    $args = new ArgumentRepository($db);
    $id = $cases->create($a, 'Spoilers are fine', 'Pop Culture')['id'];
    throwsHttp(fn () => $args->create($id, $b, 'too early'), 'vote_first');
    $votes->cast($id, $b, 'guilty');
    $votes->cast($id, $c, 'acquit');
    $g = $args->create($id, $b, 'Spoilers ruin everything');
    eq($g['side'], 'guilty');
    throwsHttp(fn () => $args->create($id, $b, 'second'), 'already_argued');
    $x = $args->create($id, $c, 'They do not');
    eq($args->upvote($g['id'], $c)['upvotes'], 1);
    throwsHttp(fn () => $args->upvote($g['id'], $c), 'already_upvoted');
    throwsHttp(fn () => $args->upvote($g['id'], $b), 'own_argument');
    throwsHttp(fn () => $args->upvote(999, $b), 'argument_not_found');
    $top = $args->top($id);
    eq($top['guilty']['id'], $g['id']);
    eq($top['acquit']['id'], $x['id']);
    $list = $args->forCase($id, $c);
    eq($list[0]['upvotedByMe'], true);
    eq($list[1]['isMine'], true);
});

check('Profile record and agreement rate', function () {
    $db = freshDb();
    $u = new UserRepository($db);
    [$a, $b, $c] = [$u->create('a3x', 'x'), $u->create('b3x', 'x'), $u->create('c3x', 'x')];
    $cases = new CaseRepository($db);
    $votes = new VoteRepository($db);
    $c1 = $cases->create($a, 'Take one', 'Work')['id'];
    $c2 = $cases->create($a, 'Take two', 'Work')['id'];
    $votes->cast($c1, $b, 'acquit');
    $votes->cast($c1, $c, 'acquit');
    $votes->cast($c2, $b, 'acquit');
    $votes->cast($c2, $c, 'guilty');
    $c3 = $cases->create($b, 'Take three', 'Work')['id'];
    $votes->cast($c3, $c, 'guilty');
    Clock::freeze(Clock::now() + 80 * 3600);
    try {
        eq($cases->record($a), ['filed' => 2, 'closed' => 2, 'acquitted' => 1, 'guilty' => 0]);
        $ag = $cases->agreement($c); // c1 acquit (agreed), c2 hung (excluded), c3 guilty (agreed)
        eq([$ag['votes'], $ag['decided'], $ag['agreed'], $ag['rate']], [3, 2, 2, 100]);
        eq($cases->agreement($a)['rate'], null);
    } finally {
        Clock::freeze(null);
    }
});

check('Docket: sorts, category filter, pagination', function () {
    $db = freshDb();
    (new Seeder($db))->run();
    $cases = new CaseRepository($db);
    $new = $cases->docket('new', 1, 10);
    eq($new['total'], 40);
    eq($new['pages'], 4);
    eq(count($new['items']), 10);
    ok($new['items'][0]['created_at'] >= $new['items'][9]['created_at'], 'newest first');
    $p4 = $cases->docket('new', 4, 10);
    eq(count($p4['items']), 10);
    eq(count($cases->docket('new', 5, 10)['items']), 0);
    $closing = $cases->docket('closing', 1, 50);
    ok($closing['total'] > 0 && $closing['total'] < 40, 'only open cases');
    for ($i = 1; $i < count($closing['items']); $i++) {
        ok($closing['items'][$i - 1]['closes_at'] <= $closing['items'][$i]['closes_at'], 'soonest first');
    }
    $tr = $cases->docket('trending', 1, 50);
    eq($tr['total'], $closing['total'], 'trending covers open cases');
    for ($i = 1; $i < count($tr['items']); $i++) {
        ok($tr['items'][$i - 1]['trending'] >= $tr['items'][$i]['trending'], 'trending desc');
    }
    $food = $cases->docket('new', 1, 50, 'Food');
    ok($food['total'] === 7 && array_unique(array_column($food['items'], 'category')) === ['Food'], 'category filter');
    eq($cases->docket('bogus', 1)['sort'], 'new');
    // seeded counters must match the votes table exactly
    $drift = $db->value("SELECT COUNT(*) FROM cases c WHERE guilty_count <> (SELECT COUNT(*) FROM votes v WHERE v.case_id = c.id AND verdict = 'guilty')
        OR acquit_count <> (SELECT COUNT(*) FROM votes v WHERE v.case_id = c.id AND verdict = 'acquit')");
    eq((int) $drift, 0, 'counter drift');
});

check('Rate limiter: fixed window per bucket+subject', function () {
    $db = freshDb();
    $t = 1000;
    $rl = new RateLimiter($db, function () use (&$t) { return $t; });
    for ($i = 0; $i < 3; $i++) {
        eq($rl->attempt('login', '1.2.3.4', 3, 60), null);
    }
    eq($rl->attempt('login', '1.2.3.4', 3, 60), 60);
    eq($rl->attempt('login', '5.6.7.8', 3, 60), null, 'other subject');
    eq($rl->attempt('other', '1.2.3.4', 3, 60), null, 'other bucket');
    $t += 30;
    eq($rl->attempt('login', '1.2.3.4', 3, 60), 30);
    $t += 30;
    eq($rl->attempt('login', '1.2.3.4', 3, 60), null, 'window reset');
    $rl->clear('login', '1.2.3.4');
    throwsHttp(function () use ($rl) {
        for ($i = 0; $i < 10; $i++) {
            $rl->hit('x', 'y', 2, 60);
        }
    }, 'rate_limited');
    ok(!$db->value("SELECT COUNT(*) FROM rate_limits WHERE subject = '1.2.3.4'"), 'subjects are hashed at rest');
});

// ---------------------------------------------------------------- HTTP
echo "\nPart 2: HTTP flow against php -S\n";

final class Client
{
    private CurlHandle $ch;
    public array $headers = [];
    public int $status = 0;
    public string $body = '';

    public function __construct(private readonly string $base)
    {
        $this->ch = curl_init();
        curl_setopt_array($this->ch, [CURLOPT_COOKIEFILE => '', CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => false, CURLOPT_TIMEOUT => 20]);
    }

    public function request(string $method, string $path, ?array $form = null, ?array $json = null, array $headers = []): self
    {
        $this->headers = [];
        $opts = [
            CURLOPT_URL => $this->base . $path, CURLOPT_CUSTOMREQUEST => $method, CURLOPT_POSTFIELDS => null, CURLOPT_HTTPGET => $method === 'GET',
            CURLOPT_HEADERFUNCTION => function ($ch, $line) {
                if (str_contains($line, ':')) {
                    [$k, $v] = explode(':', $line, 2);
                    $this->headers[strtolower(trim($k))][] = trim($v);
                }
                return strlen($line);
            },
        ];
        if ($form !== null) {
            $opts[CURLOPT_POSTFIELDS] = http_build_query($form);
            $headers[] = 'Content-Type: application/x-www-form-urlencoded';
        }
        if ($json !== null) {
            $opts[CURLOPT_POSTFIELDS] = json_encode($json);
            $headers[] = 'Content-Type: application/json';
            $headers[] = 'Accept: application/json';
        }
        $opts[CURLOPT_HTTPHEADER] = $headers;
        curl_setopt_array($this->ch, $opts);
        $this->body = (string) curl_exec($this->ch);
        $this->status = (int) curl_getinfo($this->ch, CURLINFO_RESPONSE_CODE);
        return $this;
    }

    public function get(string $path): self { return $this->request('GET', $path); }
    public function form(string $path, array $data): self { return $this->request('POST', $path, $data); }
    public function json(string $path, array $data, array $headers = []): self { return $this->request('POST', $path, null, $data, $headers); }
    public function header(string $k): ?string { return $this->headers[strtolower($k)][0] ?? null; }
    public function data(): array { return json_decode($this->body, true) ?? []; }

    public function csrf(): string
    {
        preg_match('/name="csrf-token" content="([a-f0-9]{64})"/', $this->get('/')->body, $m);
        return $m[1] ?? '';
    }

    public function cookie(string $name): ?string
    {
        foreach (curl_getinfo($this->ch, CURLINFO_COOKIELIST) as $line) {
            $parts = explode("\t", $line);
            if (($parts[5] ?? '') === $name) {
                return $parts[6] ?? null;
            }
        }
        return null;
    }
}

$tmp = sys_get_temp_dir() . '/htc-smoke-' . bin2hex(random_bytes(4));
mkdir($tmp);
$port = random_int(20000, 45000);
$env = array_merge(getenv(), ['DB_DSN' => "sqlite:{$tmp}/test.sqlite", 'AUTO_SEED' => '1', 'REGISTER_LIMIT_PER_HOUR' => '100', 'APP_URL' => "http://127.0.0.1:{$port}"]);
$root = Config::root();
$proc = proc_open([PHP_BINARY, '-S', "127.0.0.1:{$port}", '-t', "{$root}/public", "{$root}/public/index.php"],
    [0 => ['pipe', 'r'], 1 => ['file', "{$tmp}/server.log", 'a'], 2 => ['file', "{$tmp}/server.log", 'a']], $pipes, $root, $env);
$base = "http://127.0.0.1:{$port}";
$up = false;
for ($i = 0; $i < 50 && !$up; $i++) {
    usleep(100_000);
    $up = @file_get_contents("{$base}/assets/favicon.svg") !== false;
}
ok($up, 'php -S did not start');

try {
    check('First request creates schema and seeds; docket renders with security headers', function () use ($base) {
        $c = new Client($base);
        $c->get('/');
        eq($c->status, 200);
        ok(str_contains($c->body, 'Put your opinion on trial'), 'hero');
        ok(substr_count($c->body, 'class="case-row"') === 10, '10 per page');
        ok(str_contains((string) $c->header('content-security-policy'), "script-src 'self'"), 'CSP');
        eq($c->header('x-frame-options'), 'DENY');
        eq($c->header('x-content-type-options'), 'nosniff');
        $cookie = implode(' ', $c->headers['set-cookie'] ?? []);
        ok(str_contains($cookie, 'htc_session=') && stripos($cookie, 'HttpOnly') !== false && stripos($cookie, 'SameSite=Lax') !== false, 'session cookie flags');
    });

    check('JSON API: list, pagination and validation errors', function () use ($base) {
        $c = new Client($base);
        $d = $c->get('/api/cases?sort=new&page=2')->data();
        eq($c->status, 200);
        eq([$d['page'], $d['pages'], $d['total'], count($d['items'])], [2, 4, 40, 10]);
        ok(isset($d['items'][0]['verdict'], $d['items'][0]['card']), 'shape');
        $c->get('/api/cases?sort=hot');
        eq($c->status, 400);
        eq($c->data()['error']['code'], 'invalid_sort');
        $c->get('/api/cases?page=-1');
        eq($c->data()['error']['code'], 'invalid_page');
        $c->get('/api/cases?category=Sports');
        eq($c->data()['error']['code'], 'invalid_category');
        $c->get('/api/nope');
        eq([$c->status, $c->data()['error']['code']], [404, 'not_found']);
        $c->get('/api/cases/1/vote');
        eq([$c->status, $c->header('allow')], [405, 'POST']);
    });

    check('Register: CSRF required, validation, session regenerated', function () use ($base) {
        $c = new Client($base);
        $c->form('/register', ['username' => 'smoketest', 'password' => 'hunter22hunter', 'password_confirm' => 'hunter22hunter']);
        eq($c->status, 419, 'missing CSRF');
        $token = $c->csrf();
        $before = $c->cookie('htc_session');
        $c->form('/register', ['_csrf' => $token, 'username' => 'x', 'password' => 'short', 'password_confirm' => 'short']);
        eq($c->status, 422);
        ok(str_contains($c->body, '3-32 letters') && str_contains($c->body, '8-72 characters'), 'field errors');
        $c->form('/register', ['_csrf' => $token, 'username' => 'smoketest', 'password' => 'hunter22hunter', 'password_confirm' => 'hunter22hunter']);
        eq($c->status, 303);
        ok($c->cookie('htc_session') !== $before, 'session id must change on login');
        ok(str_contains($c->get('/')->body, '@smoketest'), 'logged in');
        $d = new Client($base);
        $d->form('/register', ['_csrf' => $d->csrf(), 'username' => 'SmokeTest', 'password' => 'hunter22hunter', 'password_confirm' => 'hunter22hunter']);
        ok($d->status === 422 && str_contains($d->body, 'taken'), 'duplicate username');
    });

    check('Login: demo login works, generic error, rate limited per IP+username', function () use ($base) {
        $demo = new Client($base);
        $before = $demo->csrf() ? $demo->cookie('htc_session') : null;
        $demo->form('/login', ['_csrf' => $demo->csrf(), 'username' => Seeder::DEMO_USER, 'password' => Seeder::DEMO_PASSWORD, 'next' => '/u/demo']);
        eq([$demo->status, $demo->header('location')], [303, '/u/demo']);
        ok($demo->cookie('htc_session') !== $before, 'session regenerated on login');
        ok(str_contains($demo->get('/u/demo')->body, 'Log out'), 'logged in as demo');

        $c = new Client($base);
        $t = $c->csrf();
        $c->form('/login', ['_csrf' => $t, 'username' => 'demo', 'password' => 'wrong']);
        ok($c->status === 422 && str_contains($c->body, 'Invalid username or password'), 'generic error');
        $c->form('/login', ['_csrf' => $t, 'username' => 'nobody_here', 'password' => 'wrong']);
        ok(str_contains($c->body, 'Invalid username or password'), 'same error for unknown user');
        for ($i = 0; $i < 4; $i++) {
            $c->form('/login', ['_csrf' => $t, 'username' => 'demo', 'password' => 'wrong']);
        }
        $c->form('/login', ['_csrf' => $t, 'username' => 'demo', 'password' => Seeder::DEMO_PASSWORD]);
        eq($c->status, 429, 'locked after 5 failures');
        ok($c->header('retry-after') !== null, 'Retry-After');
        $ok = new Client($base);
        $ok->form('/login', ['_csrf' => $ok->csrf(), 'username' => 'judge_judy', 'password' => 'wrong']);
        eq($ok->status, 422, 'other usernames are not locked by the demo lockout');
    });

    check('File a case, vote via JSON (CSRF header), one vote per user, argue, upvote, card', function () use ($base) {
        $owner = new Client($base);
        $owner->form('/register', ['_csrf' => $owner->csrf(), 'username' => 'plaintiff', 'password' => 'password1234', 'password_confirm' => 'password1234']);
        $t = $owner->csrf();
        $owner->form('/cases', ['_csrf' => $t, 'body' => 'x', 'category' => 'Food']);
        eq($owner->status, 422);
        $owner->form('/cases', ['_csrf' => $t, 'body' => '  Soup is   a drink.  ', 'category' => 'Food']);
        eq($owner->status, 303);
        $loc = (string) $owner->header('location');
        ok((bool) preg_match('~^/cases/(\d+)$~', $loc, $m), 'redirect to case');
        $id = (int) $m[1];
        ok(str_contains($owner->get($loc)->body, '&ldquo;Soup is a drink.&rdquo;'), 'whitespace normalised + escaped');
        $owner->json("/api/cases/{$id}/vote", ['verdict' => 'guilty'], ['X-CSRF-Token: ' . $t]);
        eq([$owner->status, $owner->data()['error']['code']], [403, 'own_case']);

        $j = new Client($base);
        $j->json("/api/cases/{$id}/vote", ['verdict' => 'guilty']);
        eq([$j->status, $j->data()['error']['code']], [401, 'unauthenticated']);
        $j->form('/register', ['_csrf' => $j->csrf(), 'username' => 'juror_x', 'password' => 'password1234', 'password_confirm' => 'password1234']);
        $jt = $j->csrf();
        $j->json("/api/cases/{$id}/vote", ['verdict' => 'guilty'], ['X-CSRF-Token: bad']);
        eq([$j->status, $j->data()['error']['code']], [419, 'csrf_mismatch']);
        $j->json("/api/cases/{$id}/vote", ['verdict' => 'guilty', 'argument' => 'Drinks do not need spoons.'], ['X-CSRF-Token: ' . $jt]);
        eq($j->status, 200);
        $d = $j->data();
        eq([$d['guilty'], $d['acquit'], $d['yourVote'], $d['argument']['side']], [1, 0, 'guilty', 'guilty']);
        $j->json("/api/cases/{$id}/vote", ['verdict' => 'acquit', 'csrf' => $jt]); // token in body works too
        eq([$j->status, $j->data()['error']['code']], [409, 'already_voted']);
        $j->json("/api/cases/{$id}/arguments", ['body' => 'Another one'], ['X-CSRF-Token: ' . $jt]);
        eq($j->data()['error']['code'], 'already_argued');

        $k = new Client($base);
        $k->form('/register', ['_csrf' => $k->csrf(), 'username' => 'juror_y', 'password' => 'password1234', 'password_confirm' => 'password1234']);
        $kt = $k->csrf();
        $k->json("/api/cases/{$id}/arguments", ['body' => 'Soup is food'], ['X-CSRF-Token: ' . $kt]);
        eq($k->data()['error']['code'], 'vote_first');
        // no-JS form fallback: redirect back with a flash
        $k->form("/api/cases/{$id}/vote", ['_csrf' => $kt, 'verdict' => 'acquit']);
        eq([$k->status, $k->header('location')], [303, "/cases/{$id}"]);
        ok(str_contains($k->get("/cases/{$id}")->body, 'Your vote is in.'), 'flash');
        $k->form("/api/cases/{$id}/vote", ['_csrf' => $kt, 'verdict' => 'acquit']);
        ok($k->status === 409 && str_contains($k->body, 'Objection!'), 'HTML error page for no-JS duplicate vote');
        $k->json("/api/cases/{$id}/arguments", ['body' => 'Soup is food.'], ['X-CSRF-Token: ' . $kt]);
        eq([$k->status, $k->data()['argument']['side']], [201, 'acquit']);
        $argId = $d['argument']['id'];
        $k->json("/api/arguments/{$argId}/upvote", [], ['X-CSRF-Token: ' . $kt]);
        eq([$k->status, $k->data()['upvotes']], [200, 1]);
        $k->json("/api/arguments/{$argId}/upvote", [], ['X-CSRF-Token: ' . $kt]);
        eq($k->data()['error']['code'], 'already_upvoted');

        $svg = $k->get("/cases/{$id}/card.svg");
        eq($svg->status, 200);
        ok(str_starts_with((string) $svg->header('content-type'), 'image/svg+xml'), 'svg content type');
        $dom = new DOMDocument();
        ok($dom->loadXML($svg->body) === true, 'card is valid XML');
        ok(str_contains($svg->body, 'DELIBERATING') && str_contains($svg->body, 'GUILTY 50%'), 'card content');
        $page = $k->get("/cases/{$id}")->body;
        ok(str_contains($page, "property=\"og:image\" content=\"{$base}/cases/{$id}/card.svg\""), 'og:image');
        ok(str_contains($page, 'Drinks do not need spoons.'), 'top argument shown');
        $prof = $k->get('/u/plaintiff')->body;
        ok(str_contains($prof, 'Soup is a drink.') && str_contains($prof, 'Cases filed'), 'profile');
    });

    check('Logout requires POST + CSRF and ends the session', function () use ($base) {
        $c = new Client($base);
        $c->form('/register', ['_csrf' => $c->csrf(), 'username' => 'leaver', 'password' => 'password1234', 'password_confirm' => 'password1234']);
        $c->get('/logout');
        eq($c->status, 405);
        $c->form('/logout', []);
        eq($c->status, 419);
        $c->form('/logout', ['_csrf' => $c->csrf()]);
        eq($c->status, 303);
        ok(!str_contains($c->get('/')->body, '@leaver'), 'logged out');
        $c->get('/new');
        eq([$c->status, $c->header('location')], [303, '/login?next=%2Fnew']);
    });

    check('Open redirect is blocked on login', function () use ($base) {
        $c = new Client($base);
        $c->form('/register', ['_csrf' => $c->csrf(), 'username' => 'redirectme', 'password' => 'password1234', 'password_confirm' => 'password1234']);
        $c->form('/logout', ['_csrf' => $c->csrf()]);
        $c->form('/login', ['_csrf' => $c->csrf(), 'username' => 'redirectme', 'password' => 'password1234', 'next' => '//evil.example/x']);
        eq([$c->status, $c->header('location')], [303, '/']);
    });

    check('Unknown pages: HTML 404 and not-found case', function () use ($base) {
        $c = new Client($base);
        eq($c->get('/nope')->status, 404);
        eq($c->get('/cases/99999')->status, 404);
        eq($c->get('/cases/abc')->status, 404);
        eq($c->get('/u/no_such_user')->status, 404);
    });
} finally {
    proc_terminate($proc);
    proc_close($proc);
    $log = @file_get_contents("{$tmp}/server.log") ?: '';
    if (preg_match('/(Fatal|Warning|Deprecated|Notice)/', $log)) {
        echo "\nServer log had PHP diagnostics:\n" . implode("\n", array_filter(explode("\n", $log), fn ($l) => preg_match('/(Fatal|Warning|Deprecated|Notice)/', $l))) . "\n";
        $failed[] = 'server log clean';
    }
    array_map('unlink', glob("{$tmp}/*") ?: []);
    @rmdir($tmp);
}

printf("\n%d passed, %d failed\n", $passed, count($failed));
exit($failed ? 1 : 0);
