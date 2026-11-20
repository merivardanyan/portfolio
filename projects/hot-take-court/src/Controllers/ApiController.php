<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Auth;
use App\Csrf;
use App\HttpException;
use App\Request;
use App\Response;
use App\Verdict;

/**
 * JSON API. Writes require a session + CSRF token (header X-CSRF-Token or `csrf` field).
 * Plain HTML form posts (no JS) to the same endpoints are redirected back to the case page,
 * so voting works without JavaScript.
 */
final class ApiController extends Controller
{
    public function cases(Request $req): Response
    {
        $sort = $req->queryStr('sort', 'trending');
        if (!in_array($sort, ['trending', 'new', 'closing'], true)) {
            throw new HttpException(400, 'invalid_sort', 'sort must be trending, new or closing');
        }
        $category = $req->queryStr('category') ?: null;
        if ($category !== null && !in_array($category, Verdict::CATEGORIES, true)) {
            throw new HttpException(400, 'invalid_category', 'Unknown category', ['allowed' => Verdict::CATEGORIES]);
        }
        $pageRaw = $req->queryStr('page', '1');
        if (!ctype_digit($pageRaw) || (int) $pageRaw < 1 || (int) $pageRaw > 1000) {
            throw new HttpException(400, 'invalid_page', 'page must be an integer 1-1000');
        }
        $d = $this->cases->docket($sort, (int) $pageRaw, 10, $category);
        return Response::json([
            'items' => array_map([self::class, 'shapeCase'], $d['items']),
            'page' => $d['page'], 'pages' => $d['pages'], 'total' => $d['total'], 'sort' => $d['sort'], 'category' => $d['category'],
        ]);
    }

    public function vote(Request $req, array $p): Response
    {
        $user = Auth::require();
        Csrf::verify($req);
        $this->limiter->hit('vote', (string) $user['id'], 60, 60);
        $caseId = (int) $p['id'];
        $verdict = $req->str('verdict');
        $argument = self::clean($req->str('argument'));
        if ($argument !== '') {
            self::validateArgument($argument); // same 3-120 rule as /argue, checked before anything is written
        }
        // Vote and optional argument are one unit of work: if the argument insert fails, the vote
        // (and its counter bump) roll back too, so a retry doesn't hit "already voted".
        $result = $this->db->transaction(function () use ($caseId, $user, $verdict, $argument): array {
            $r = $this->votes->cast($caseId, $user['id'], $verdict);
            if ($argument !== '') {
                $r['argument'] = $this->arguments->create($caseId, $user['id'], $argument);
            }
            return $r;
        });
        return $this->respond($req, $result, "/cases/{$caseId}", 'Your vote is in.');
    }

    public function argue(Request $req, array $p): Response
    {
        $user = Auth::require();
        Csrf::verify($req);
        $this->limiter->hit('argue', (string) $user['id'], 20, 3600);
        $body = self::clean($req->str('body'));
        self::validateArgument($body);
        $arg = $this->arguments->create((int) $p['id'], $user['id'], $body);
        return $this->respond($req, ['argument' => $arg], "/cases/{$p['id']}#arguments", 'Argument entered into the record.', 201);
    }

    private static function validateArgument(string $body): void
    {
        $len = mb_strlen($body);
        if ($len < 3 || $len > 120) {
            throw new HttpException(422, 'invalid_argument', 'Arguments must be 3-120 characters');
        }
    }

    public function upvote(Request $req, array $p): Response
    {
        $user = Auth::require();
        Csrf::verify($req);
        $this->limiter->hit('upvote', (string) $user['id'], 120, 3600);
        $r = $this->arguments->upvote((int) $p['id'], $user['id']);
        $caseId = (int) $this->db->value('SELECT case_id FROM arguments WHERE id = ?', [(int) $p['id']]);
        return $this->respond($req, $r, "/cases/{$caseId}#arguments", 'Upvoted.');
    }

    private function respond(Request $req, array $data, string $back, string $flash, int $status = 200): Response
    {
        if (!$req->isJson() && !str_contains((string) $req->header('accept'), 'application/json')) {
            self::flash($flash);
            return Response::redirect($back);
        }
        return Response::json($data, $status);
    }

    public static function shapeCase(array $c): array
    {
        $v = Verdict::of($c);
        return [
            'id' => (int) $c['id'], 'body' => $c['body'], 'category' => $c['category'], 'username' => $c['username'],
            'createdAt' => $c['created_at'], 'closesAt' => $c['closes_at'], 'guilty' => $v['guilty'], 'acquit' => $v['acquit'],
            'open' => $v['open'], 'verdict' => $v['label'], 'url' => "/cases/{$c['id']}", 'card' => "/cases/{$c['id']}/card.svg",
        ];
    }
}
