<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Auth;
use App\Csrf;
use App\HttpException;
use App\Request;
use App\Response;
use App\Verdict;
use App\VerdictCard;
use App\VerdictCardPng;
use App\View;

final class CaseController extends Controller
{
    public function home(Request $req): Response
    {
        $sort = in_array($req->queryStr('sort'), ['trending', 'new', 'closing'], true) ? $req->queryStr('sort') : 'trending';
        $category = in_array($req->queryStr('category'), Verdict::CATEGORIES, true) ? $req->queryStr('category') : null;
        $page = max(1, min(1000, (int) $req->queryStr('page', '1')));
        $docket = $this->cases->docket($sort, $page, 10, $category);
        return View::render('home', ['title' => 'Hot Take Court · The internet is the jury', 'docket' => $docket]);
    }

    public function show(Request $req, array $p): Response
    {
        $case = $this->findOr404((int) $p['id']);
        $uid = Auth::id();
        $verdict = Verdict::of($case);
        return View::render('case', [
            'title' => Verdict::headline($case) . ' · Hot Take Court',
            'description' => "Case No. {$case['id']}: \"{$case['body']}\". Guilty {$verdict['guilty']}, not guilty {$verdict['acquit']}. Cast your vote.",
            'og' => ['image' => View::absoluteUrl("/cases/{$case['id']}/card.png"), 'url' => View::absoluteUrl("/cases/{$case['id']}")],
            'case' => $case,
            'verdict' => $verdict,
            'yourVote' => $uid ? $this->votes->find((int) $case['id'], $uid) : null,
            'isOwner' => $uid === (int) $case['user_id'],
            'top' => $this->arguments->top((int) $case['id']),
            'arguments' => $this->arguments->forCase((int) $case['id'], $uid),
            'shareUrl' => View::absoluteUrl("/cases/{$case['id']}"),
        ]);
    }

    public function card(Request $req, array $p): Response
    {
        $case = $this->findOr404((int) $p['id']);
        return Response::svg(VerdictCard::svg($case), Verdict::of($case)['open'] ? 60 : 86400);
    }

    /** PNG version for og:image; falls back to the static /assets/og.png if GD is missing. */
    public function cardPng(Request $req, array $p): Response
    {
        $case = $this->findOr404((int) $p['id']);
        if (!VerdictCardPng::available()) {
            return Response::redirect('/assets/og.png');
        }
        return Response::png(VerdictCardPng::png($case), Verdict::of($case)['open'] ? 60 : 86400);
    }

    public function newForm(Request $req): Response
    {
        if (!Auth::user()) {
            return Response::redirect('/login?next=' . rawurlencode('/new'));
        }
        return View::render('new', ['title' => 'File a case · Hot Take Court', 'errors' => [], 'old' => []]);
    }

    public function store(Request $req): Response
    {
        $user = Auth::require();
        Csrf::verify($req);
        $body = self::clean($req->str('body'));
        $category = $req->str('category');
        $errors = [];
        $len = mb_strlen($body);
        if ($len < 3 || $len > 140) {
            $errors['body'] = 'Your take must be 3-140 characters.';
        }
        if (!in_array($category, Verdict::CATEGORIES, true)) {
            $errors['category'] = 'Pick a category.';
        }
        if ($errors) {
            return View::render('new', ['title' => 'File a case · Hot Take Court', 'errors' => $errors, 'old' => ['body' => $body, 'category' => $category]], 422);
        }
        $this->limiter->hit('file_case', (string) $user['id'], 10, 3600);
        $r = $this->cases->create($user['id'], $body, $category);
        self::flash($r['created'] ? 'Case filed. The jury has 72 hours. Share it!' : 'You already filed that case. Here it is.');
        return Response::redirect("/cases/{$r['id']}");
    }

    public function profile(Request $req, array $p): Response
    {
        $user = $this->users->findByUsername($p['username']) ?? throw new HttpException(404, 'not_found', 'No such user');
        return View::render('profile', [
            'title' => '@' . $user['username'] . ' · Hot Take Court',
            'user' => $user,
            'cases' => $this->cases->byUser($user['id']),
            'record' => $this->cases->record($user['id']),
            'agreement' => $this->cases->agreement($user['id']),
        ]);
    }

    private function findOr404(int $id): array
    {
        return $this->cases->find($id) ?? throw new HttpException(404, 'case_not_found', 'No such case. It may have been dismissed.');
    }
}
