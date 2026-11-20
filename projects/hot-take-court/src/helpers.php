<?php
declare(strict_types=1);

/** HTML-escape for templates. */
function e(mixed $value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/** Hidden CSRF field for forms. */
function csrf_field(): string
{
    return '<input type="hidden" name="_csrf" value="' . e(App\Csrf::token()) . '">';
}

/** Build a docket URL keeping current filters. */
function docket_url(array $params): string
{
    $params = array_filter($params, static fn ($v) => $v !== null && $v !== '' && $v !== 1 && $v !== 'trending');
    return '/' . ($params ? '?' . http_build_query($params) : '');
}
