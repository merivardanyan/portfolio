<?php /** @var int $status @var string $message */ ?>
<section class="form-page error-page">
  <p class="mono">Error <?= (int) $status ?></p>
  <h1>Objection!</h1>
  <p><?= e($message) ?></p>
  <p><a class="btn" href="/">Back to the docket</a></p>
</section>
