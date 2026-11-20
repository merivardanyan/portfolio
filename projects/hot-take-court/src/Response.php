<?php
declare(strict_types=1);

namespace App;

final class Response
{
    public function __construct(
        public string $body = '',
        public int $status = 200,
        public array $headers = [],
    ) {
    }

    public static function html(string $body, int $status = 200): self
    {
        return new self($body, $status, ['Content-Type' => 'text/html; charset=utf-8']);
    }

    public static function json(mixed $data, int $status = 200, array $headers = []): self
    {
        return new self(
            json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
            $status,
            ['Content-Type' => 'application/json; charset=utf-8', 'Cache-Control' => 'no-store'] + $headers,
        );
    }

    public static function redirect(string $to, int $status = 303): self
    {
        return new self('', $status, ['Location' => $to]);
    }

    public static function svg(string $svg, int $maxAge = 60): self
    {
        return new self($svg, 200, [
            'Content-Type' => 'image/svg+xml; charset=utf-8',
            'Cache-Control' => "public, max-age={$maxAge}",
            'Content-Security-Policy' => "default-src 'none'; style-src 'unsafe-inline'",
        ]);
    }

    public static function png(string $png, int $maxAge = 60): self
    {
        return new self($png, 200, [
            'Content-Type' => 'image/png',
            'Cache-Control' => "public, max-age={$maxAge}",
        ]);
    }

    public function send(): void
    {
        http_response_code($this->status);
        $defaults = [
            'X-Content-Type-Options' => 'nosniff',
            'X-Frame-Options' => 'DENY',
            'Referrer-Policy' => 'strict-origin-when-cross-origin',
            'Content-Security-Policy' => "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; "
                . "form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
        ];
        foreach ($this->headers + $defaults as $k => $v) {
            header("{$k}: {$v}");
        }
        echo $this->body;
    }
}
