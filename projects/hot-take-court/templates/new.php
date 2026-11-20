<?php /** @var array $errors @var array $old */ ?>
<section class="form-page">
  <h1>File a case</h1>
  <p>State your take in 140 characters. The jury deliberates for 72 hours.</p>
  <form method="post" action="/cases" novalidate>
    <?= csrf_field() ?>
    <div class="field">
      <label for="body">Your hot take</label>
      <textarea id="body" name="body" maxlength="140" rows="3" required aria-describedby="body-help<?= isset($errors['body']) ? ' body-err' : '' ?>"<?= isset($errors['body']) ? ' aria-invalid="true"' : '' ?>><?= e($old['body'] ?? '') ?></textarea>
      <p id="body-help" class="help"><span data-counter-for="body">0</span>/140 characters</p>
      <?php if (isset($errors['body'])): ?><p id="body-err" class="error"><?= e($errors['body']) ?></p><?php endif; ?>
    </div>
    <div class="field">
      <label for="category">Category</label>
      <select id="category" name="category" required<?= isset($errors['category']) ? ' aria-invalid="true" aria-describedby="cat-err"' : '' ?>>
        <option value="">Choose one</option>
        <?php foreach (App\Verdict::CATEGORIES as $cat): ?>
          <option value="<?= e($cat) ?>"<?= ($old['category'] ?? '') === $cat ? ' selected' : '' ?>><?= e($cat) ?></option>
        <?php endforeach; ?>
      </select>
      <?php if (isset($errors['category'])): ?><p id="cat-err" class="error"><?= e($errors['category']) ?></p><?php endif; ?>
    </div>
    <button type="submit" class="btn btn-primary">File it</button>
  </form>
</section>
