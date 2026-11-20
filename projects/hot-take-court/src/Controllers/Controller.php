<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Db;
use App\RateLimiter;
use App\Repositories\ArgumentRepository;
use App\Repositories\CaseRepository;
use App\Repositories\UserRepository;
use App\Repositories\VoteRepository;

abstract class Controller
{
    protected CaseRepository $cases;
    protected UserRepository $users;
    protected VoteRepository $votes;
    protected ArgumentRepository $arguments;
    protected RateLimiter $limiter;

    public function __construct(protected readonly Db $db)
    {
        $this->cases = new CaseRepository($db);
        $this->users = new UserRepository($db);
        $this->votes = new VoteRepository($db);
        $this->arguments = new ArgumentRepository($db);
        $this->limiter = new RateLimiter($db);
    }

    protected static function flash(string $message, string $type = 'info'): void
    {
        $_SESSION['flash'] = ['message' => $message, 'type' => $type];
    }

    /** Normalise user text: strip control chars, collapse whitespace, trim. */
    protected static function clean(string $s): string
    {
        $s = preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $s) ?? '';
        return trim(preg_replace('/\s+/u', ' ', $s) ?? '');
    }

    /** Only same-site relative paths are allowed as post-login redirects. */
    protected static function safeNext(string $next): string
    {
        return preg_match('~^/(?![/\\\\])[\w\-./?=&%]*$~', $next) ? $next : '/';
    }
}
