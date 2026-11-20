<?php /** @var array $errors @var array $old @var string $next */ ?>
<section class="form-page">
  <h1>Log in</h1>
  <?php if (isset($errors['form'])): ?><p class="error" role="alert"><?= e($errors['form']) ?></p><?php endif; ?>
  <form method="post" action="/login">
    <?= csrf_field() ?>
    <input type="hidden" name="next" value="<?= e($next) ?>">
    <div class="field">
      <label for="username">Username</label>
      <input id="username" name="username" autocomplete="username" required value="<?= e($old['username'] ?? '') ?>">
    </div>
    <div class="field">
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required>
    </div>
    <button type="submit" class="btn btn-primary">Log in</button>
  </form>
  <p>New here? <a href="/register">Register</a>. Demo account: <code>demo</code> / <code>password123</code>.</p>
</section>
