<?php /** @var array $user @var array $cases @var array $record @var array $agreement */ ?>
<section class="profile">
  <h1>@<?= e($user['username']) ?></h1>
  <p class="mono">On the bench since <?= e(substr($user['created_at'], 0, 10)) ?></p>
  <dl class="stats">
    <div><dt>Record</dt><dd>Defended <?= (int) $record['closed'] ?> take<?= $record['closed'] === 1 ? '' : 's' ?>, <?= (int) $record['acquitted'] ?> acquitted</dd></div>
    <div><dt>Cases filed</dt><dd><?= (int) $record['filed'] ?> (<?= (int) $record['guilty'] ?> found guilty)</dd></div>
    <div><dt>Agreement with the jury</dt><dd><?= $agreement['rate'] === null ? 'No decided cases yet' : (int) $agreement['rate'] . '% of ' . (int) $agreement['decided'] . ' decided votes' ?></dd></div>
    <div><dt>Votes cast</dt><dd><?= (int) $agreement['votes'] ?></dd></div>
  </dl>
  <h2>Cases</h2>
  <?php if (!$cases): ?><p class="empty">No cases filed yet.</p><?php endif; ?>
  <div class="cases">
    <?php foreach ($cases as $c) { echo App\View::partial('partials/case_row', ['c' => $c]); } ?>
  </div>
</section>
