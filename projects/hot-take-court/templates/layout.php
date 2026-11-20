<?php
/** @var string $title @var string $description @var ?array $og @var string $content */
$user = App\Auth::user();
$flash = $_SESSION['flash'] ?? null;
unset($_SESSION['flash']);
?><!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title><?= e($title) ?></title>
  <meta name="description" content="<?= e($description) ?>">
  <meta name="csrf-token" content="<?= e(App\Csrf::token()) ?>">
  <meta name="theme-color" content="#21160F">
  <meta property="og:site_name" content="Hot Take Court">
  <meta property="og:title" content="<?= e($title) ?>">
  <meta property="og:description" content="<?= e($description) ?>">
  <meta property="og:type" content="website">
  <?php
  // og:url / og:image must be absolute; they come only from APP_URL (never the Host header).
  if (!$og || !App\View::isAbsolute($og['image'])) {
      $fallback = App\View::absoluteUrl('/assets/og.png');
      $og = App\View::isAbsolute($fallback) ? ['url' => App\View::absoluteUrl('/'), 'image' => $fallback] : null;
  }
  ?>
  <?php if ($og): ?>
  <meta property="og:url" content="<?= e($og['url']) ?>">
  <meta property="og:image" content="<?= e($og['image']) ?>">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="<?= e($og['image']) ?>">
  <?php endif; ?>
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/assets/app.css">
  <script src="/assets/app.js" defer></script>
</head>
<body>
  <a class="skip" href="#main">Skip to content</a>
  <header class="site-header">
    <a class="brand" href="/"><span aria-hidden="true">&#9878;</span> Hot Take Court</a>
    <nav aria-label="Main">
      <ul>
        <li><a href="/new" class="btn btn-primary">File a case</a></li>
        <?php if ($user): ?>
          <li><a href="/u/<?= e($user['username']) ?>">@<?= e($user['username']) ?></a></li>
          <li>
            <form method="post" action="/logout" class="inline">
              <?= csrf_field() ?>
              <button type="submit" class="link">Log out</button>
            </form>
          </li>
        <?php else: ?>
          <li><a href="/login">Log in</a></li>
          <li><a href="/register">Register</a></li>
        <?php endif; ?>
      </ul>
    </nav>
  </header>
  <main id="main" tabindex="-1">
    <?php if ($flash): ?>
      <p class="flash flash-<?= e($flash['type']) ?>" role="status"><?= e($flash['message']) ?></p>
    <?php endif; ?>
    <?= $content ?>
  </main>
  <footer class="site-footer">
    <p>Hot Take Court: plain PHP 8, PDO, SQLite/MySQL. No framework. Verdicts are final-ish.</p>
  </footer>
  <div id="live" class="visually-hidden" aria-live="polite"></div>
</body>
</html>
