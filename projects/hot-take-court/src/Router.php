<?php
declare(strict_types=1);

namespace App;

/** Tiny router: '/cases/{id}' style patterns, {id} params are digits only. */
final class Router
{
    /** @var array<int, array{string, string, array<int,string>, callable}> */
    private array $routes = [];

    public function get(string $pattern, callable $handler): void
    {
        $this->add('GET', $pattern, $handler);
    }

    public function post(string $pattern, callable $handler): void
    {
        $this->add('POST', $pattern, $handler);
    }

    private function add(string $method, string $pattern, callable $handler): void
    {
        $keys = [];
        $regex = preg_replace_callback('~\{(\w+)\}~', static function (array $m) use (&$keys): string {
            $keys[] = $m[1];
            return $m[1] === 'username' ? '([A-Za-z0-9_]{3,32})' : '([1-9][0-9]{0,9})';
        }, $pattern);
        $this->routes[] = [$method, '~^' . $regex . '$~', $keys, $handler];
    }

    public function dispatch(Request $req): Response
    {
        $allowed = [];
        foreach ($this->routes as [$method, $regex, $keys, $handler]) {
            if (!preg_match($regex, $req->path, $m)) {
                continue;
            }
            if ($method !== $req->method && !($method === 'GET' && $req->method === 'HEAD')) {
                $allowed[] = $method;
                continue;
            }
            $params = [];
            foreach ($keys as $i => $k) {
                $params[$k] = $m[$i + 1];
            }
            return $handler($req, $params);
        }
        if ($allowed) {
            throw new HttpException(405, 'method_not_allowed', 'Method not allowed', [], ['Allow' => implode(', ', array_unique($allowed))]);
        }
        throw new HttpException(404, 'not_found', 'Page not found');
    }
}
