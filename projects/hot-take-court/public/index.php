<?php
declare(strict_types=1);

// Front controller. Dev: php -S localhost:8080 -t public public/index.php

if (PHP_SAPI === 'cli-server') {
    $file = __DIR__ . parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    if ($file !== __FILE__ && is_file($file) && !str_ends_with($file, '.php')) {
        return false; // let the built-in server serve static assets
    }
}

require dirname(__DIR__) . '/src/bootstrap.php';

use App\Auth;
use App\Config;
use App\Controllers\ApiController;
use App\Controllers\AuthController;
use App\Controllers\CaseController;
use App\Db;
use App\HttpException;
use App\Request;
use App\Response;
use App\Router;
use App\View;

$req = Request::fromGlobals();

try {
    if ($req->malformedPath) {
        throw new HttpException(400, 'bad_request', 'Malformed URL encoding');
    }
    $db = Db::fromConfig();
    if ($db->ensureSchema(Config::get('AUTO_SEED', '1') === '1')) {
        error_log('Hot Take Court: created SQLite schema and seeded demo data');
    }
    Auth::startSession();

    $cases = new CaseController($db);
    $auth = new AuthController($db);
    $api = new ApiController($db);

    $r = new Router();
    $r->get('/', $cases->home(...));
    $r->get('/new', $cases->newForm(...));
    $r->post('/cases', $cases->store(...));
    $r->get('/cases/{id}', $cases->show(...));
    $r->get('/cases/{id}/card.svg', $cases->card(...));
    $r->get('/cases/{id}/card.png', $cases->cardPng(...));
    $r->get('/u/{username}', $cases->profile(...));
    $r->get('/login', $auth->loginForm(...));
    $r->post('/login', $auth->login(...));
    $r->get('/register', $auth->registerForm(...));
    $r->post('/register', $auth->register(...));
    $r->post('/logout', $auth->logout(...));

    $r->get('/api/cases', $api->cases(...));
    $r->post('/api/cases/{id}/vote', $api->vote(...));
    $r->post('/api/cases/{id}/arguments', $api->argue(...));
    $r->post('/api/arguments/{id}/upvote', $api->upvote(...));

    $response = $r->dispatch($req);
} catch (HttpException $e) {
    if ($req->wantsJson()) {
        $error = ['code' => $e->errorCode, 'message' => $e->getMessage()];
        if ($e->details) {
            $error['details'] = $e->details;
        }
        $response = Response::json(['error' => $error], $e->status, $e->headers);
    } elseif ($e->status === 401) {
        $response = Response::redirect('/login?next=' . rawurlencode($req->method === 'GET' ? $req->path : '/'));
    } else {
        $response = View::render('error', ['title' => 'Objection! · Hot Take Court', 'status' => $e->status, 'message' => $e->getMessage()], $e->status);
        $response->headers += $e->headers;
    }
} catch (Throwable $e) {
    error_log((string) $e);
    $msg = Config::isProduction() ? 'Something broke in the courtroom.' : $e->getMessage();
    $response = $req->wantsJson()
        ? Response::json(['error' => ['code' => 'internal', 'message' => $msg]], 500)
        : Response::html('<!doctype html><title>Server error</title><h1>500</h1><p>' . e($msg) . '</p>', 500);
}

$response->send();
