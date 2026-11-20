<?php
/** @var array $errors @var array $old */
$err = static fn (string $f): string => isset($errors[$f]) ? '<p id="' . e($f) . '-err" class="error">' . e($errors[$f]) . '</p>' : '';
$inv = static fn (string $f): string => isset($errors[$f]) ? ' aria-invalid="true" aria-describedby="' . e($f) . '-err"' : '';
?>
<section class="form-page">
  <h1>Join the jury</h1>
  <form method="post" action="/register" novalidate>
    <?= csrf_field() ?>
    <div class="field">
      <label for="username">Username</label>
      <input id="username" name="username" autocomplete="username" required pattern="[A-Za-z0-9_]{3,32}" value="<?= e($old['username'] ?? '') ?>"<?= $inv('username') ?>>
      <p class="help">3-32 letters, numbers or underscores.</p>
      <?= $err('username') ?>
    </div>
    <div class="field">
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="new-password" required minlength="8" maxlength="72"<?= $inv('password') ?>>
      <?= $err('password') ?>
    </div>
    <div class="field">
      <label for="password_confirm">Confirm password</label>
      <input id="password_confirm" name="password_confirm" type="password" autocomplete="new-password" required<?= $inv('password_confirm') ?>>
      <?= $err('password_confirm') ?>
    </div>
    <button type="submit" class="btn btn-primary">Register</button>
  </form>
  <p>Already on the bench? <a href="/login">Log in</a>.</p>
</section>
