<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Auth;
use App\Config;
use App\Csrf;
use App\Request;
use App\Response;
use App\View;

final class AuthController extends Controller
{
    private const USERNAME_RE = '/^[A-Za-z0-9_]{3,32}$/';
    /** bcrypt hash of a random throwaway string, same cost as PASSWORD_DEFAULT; used to equalise timing. */
    private const DUMMY_HASH = '$2y$12$DPFFdiIJeRBMlBjCQK7Bp.kg/BXb9ITkdBb9T8UlVNyV9CiAEJGCK';

    public function loginForm(Request $req): Response
    {
        if (Auth::user()) {
            return Response::redirect('/');
        }
        return View::render('login', ['title' => 'Log in · Hot Take Court', 'next' => self::safeNext($req->queryStr('next', '/')), 'errors' => [], 'old' => []]);
    }

    public function login(Request $req): Response
    {
        Csrf::verify($req);
        $username = trim($req->str('username'));
        $password = $req->str('password');
        $next = self::safeNext($req->str('next') ?: '/');
        // Throttle per IP and per (IP, username) to slow credential stuffing and targeted guessing.
        // Hits are counted up front (atomically, so parallel guesses can't slip through) and given
        // back when the login succeeds: only FAILED attempts use up the IP budget.
        $this->limiter->hit('login_ip', $req->ip, 30, 900);
        $this->limiter->hit('login_user', $req->ip . '|' . strtolower($username), 5, 900);

        $user = preg_match(self::USERNAME_RE, $username) ? $this->users->findForLogin($username) : null;
        // Always run password_verify so response time doesn't reveal whether the user exists.
        $hash = $user['password_hash'] ?? self::DUMMY_HASH;
        $ok = password_verify($password, $hash) && $user !== null;
        if (!$ok) {
            return View::render('login', ['title' => 'Log in · Hot Take Court', 'next' => $next,
                'errors' => ['form' => 'Invalid username or password.'], 'old' => ['username' => $username]], 422);
        }
        if (password_needs_rehash($user['password_hash'], PASSWORD_DEFAULT)) {
            $this->users->updateHash((int) $user['id'], password_hash($password, PASSWORD_DEFAULT));
        }
        $this->limiter->refund('login_ip', $req->ip);
        $this->limiter->clear('login_user', $req->ip . '|' . strtolower($username));
        Auth::login(['id' => (int) $user['id'], 'username' => $user['username'], 'created_at' => $user['created_at']]);
        self::flash('Welcome back, ' . $user['username'] . '. Court is in session.');
        return Response::redirect($next);
    }

    public function registerForm(Request $req): Response
    {
        if (Auth::user()) {
            return Response::redirect('/');
        }
        return View::render('register', ['title' => 'Register · Hot Take Court', 'errors' => [], 'old' => []]);
    }

    public function register(Request $req): Response
    {
        Csrf::verify($req);
        // Counted up front (atomic), refunded when the form itself is invalid so typos don't burn the
        // quota. A taken username still counts: otherwise the form would be a free enumeration oracle.
        $this->limiter->hit('register_ip', $req->ip, (int) (Config::get('REGISTER_LIMIT_PER_HOUR') ?? 5), 3600);
        $username = trim($req->str('username'));
        $password = $req->str('password');
        $errors = [];
        if (!preg_match(self::USERNAME_RE, $username)) {
            $errors['username'] = 'Use 3-32 letters, numbers or underscores.';
        }
        if (strlen($password) < 8 || strlen($password) > 72) {
            $errors['password'] = 'Use 8-72 characters.'; // 72 = bcrypt input limit
        } elseif ($password !== $req->str('password_confirm')) {
            $errors['password_confirm'] = 'Passwords do not match.';
        }
        if ($errors) {
            $this->limiter->refund('register_ip', $req->ip);
        } else {
            $id = $this->users->create($username, password_hash($password, PASSWORD_DEFAULT));
            if ($id === null) {
                $errors['username'] = 'That username is taken.';
            } else {
                Auth::login(['id' => $id, 'username' => $username, 'created_at' => gmdate('Y-m-d H:i:s')]);
                self::flash('Welcome to the bench, ' . $username . '. File your first case.');
                return Response::redirect('/');
            }
        }
        return View::render('register', ['title' => 'Register · Hot Take Court', 'errors' => $errors, 'old' => ['username' => $username]], 422);
    }

    public function logout(Request $req): Response
    {
        Csrf::verify($req);
        Auth::logout();
        return Response::redirect('/');
    }
}
