<?php
declare(strict_types=1);

namespace App;

final class Request
{
    /** @var array<string, mixed>|null */
    private ?array $json = null;
    /** Set when the URL path had malformed percent-encoding; the front controller answers 400. */
    public bool $malformedPath = false;

    public function __construct(
        public readonly string $method,
        public readonly string $path,
        public readonly array $query,
        public readonly array $post,
        public readonly array $headers,
        public readonly string $ip,
        private readonly string $rawBody = '',
    ) {
    }

    public static function fromGlobals(): self
    {
        $headers = [];
        foreach ($_SERVER as $k => $v) {
            if (str_starts_with($k, 'HTTP_')) {
                $headers[strtolower(str_replace('_', '-', substr($k, 5)))] = (string) $v;
            }
        }
        if (isset($_SERVER['CONTENT_TYPE'])) {
            $headers['content-type'] = (string) $_SERVER['CONTENT_TYPE'];
        }
        $rawPath = (string) (parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH) ?: '/');
        [$path, $malformed] = self::decodePath($rawPath);
        $ip = self::clientIp((string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0'), $headers['x-forwarded-for'] ?? null,
            (int) (Config::get('TRUST_PROXY') ?? 0));
        $req = new self(strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')), $path, $_GET, $_POST, $headers, $ip,
            (string) file_get_contents('php://input'));
        $req->malformedPath = $malformed;
        return $req;
    }

    /**
     * Percent-decode a path. Malformed escapes (`%G1`, a dangling `%`), encoded NUL/control
     * bytes and sequences that decode to invalid UTF-8 are rejected instead of being routed.
     * @return array{0:string, 1:bool} [path, malformed]
     */
    public static function decodePath(string $raw): array
    {
        if (preg_match('/%(?![0-9A-Fa-f]{2})/', $raw)) {
            return ['/', true];
        }
        $decoded = rawurldecode($raw);
        if (!mb_check_encoding($decoded, 'UTF-8') || preg_match('/[\x00-\x1F\x7F]/', $decoded)) {
            return ['/', true];
        }
        return ['/' . trim($decoded, '/'), false];
    }

    /**
     * With TRUST_PROXY=N (number of reverse proxies you run), take the address N hops from the
     * RIGHT of X-Forwarded-For. Entries further left were supplied by the client and are spoofable.
     */
    public static function clientIp(string $remote, ?string $xff, int $trustedHops): string
    {
        if ($trustedHops <= 0 || $xff === null) {
            return $remote;
        }
        $chain = array_values(array_filter(array_map('trim', explode(',', $xff)), static fn ($s) => $s !== ''));
        if (!$chain) {
            return $remote;
        }
        $ip = $chain[max(0, count($chain) - $trustedHops)];
        return filter_var($ip, FILTER_VALIDATE_IP) !== false ? $ip : $remote;
    }

    public function header(string $name): ?string
    {
        return $this->headers[strtolower($name)] ?? null;
    }

    public function isJson(): bool
    {
        return str_contains((string) $this->header('content-type'), 'application/json');
    }

    /** Body field from a JSON or form-encoded body. */
    public function input(string $key, mixed $default = null): mixed
    {
        if ($this->isJson()) {
            if ($this->json === null) {
                $decoded = json_decode($this->rawBody, true);
                $this->json = is_array($decoded) ? $decoded : [];
            }
            return $this->json[$key] ?? $default;
        }
        return $this->post[$key] ?? $default;
    }

    public function str(string $key): string
    {
        $v = $this->input($key, '');
        return is_string($v) ? $v : '';
    }

    public function queryStr(string $key, string $default = ''): string
    {
        $v = $this->query[$key] ?? $default;
        return is_string($v) ? $v : $default;
    }

    public function wantsJson(): bool
    {
        if ($this->isJson() || str_contains((string) $this->header('accept'), 'application/json')) {
            return true;
        }
        // No-JS form posts to /api/* get HTML error pages; everything else under /api/ is JSON.
        $form = str_contains((string) $this->header('content-type'), 'application/x-www-form-urlencoded');
        return str_starts_with($this->path, '/api/') && !$form;
    }
}
