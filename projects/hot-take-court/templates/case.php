<?php
/** @var array $case @var array $verdict @var ?string $yourVote @var bool $isOwner @var array $top @var array $arguments @var string $shareUrl */
$user = App\Auth::user();
$id = (int) $case['id'];
$sideLabel = ['guilty' => 'Guilty', 'acquit' => 'Not guilty'];
$hasArgued = (bool) array_filter($arguments, static fn ($a) => $a['isMine']);
?>
<article class="case" data-case-id="<?= $id ?>">
  <p class="case-meta">
    <span class="tag"><?= e($case['category']) ?></span>
    <span class="mono">Case No. <?= e(str_pad((string) $id, 4, '0', STR_PAD_LEFT)) ?></span>
    <span class="mono">filed by <a href="/u/<?= e($case['username']) ?>">@<?= e($case['username']) ?></a></span>
  </p>
  <h1 class="take">&ldquo;<?= e($case['body']) ?>&rdquo;</h1>

  <figure class="card">
    <img src="/cases/<?= $id ?>/card.svg" width="1200" height="630" alt="<?= e(App\Verdict::headline($case)) ?>" id="verdict-card">
  </figure>

  <section class="tally" aria-labelledby="tally-h">
    <h2 id="tally-h" class="visually-hidden">Current tally</h2>
    <p class="status mono"><?= $verdict['open'] ? 'Jury deliberating · ' . e(App\Clock::relative($case['closes_at'])) : 'Verdict: ' . e($verdict['label']) ?></p>
    <svg class="split split-lg" viewBox="0 0 100 10" preserveAspectRatio="none" role="img" aria-label="<?= e("Guilty {$verdict['guilty']}, not guilty {$verdict['acquit']}") ?>"><rect class="split-a" width="100" height="10"/><rect class="split-g" width="<?= (int) $verdict['guiltyPct'] ?>" height="10"/></svg>
    <p class="counts"><span class="g" data-count="guilty"><?= (int) $verdict['guilty'] ?></span> guilty · <span class="a" data-count="acquit"><?= (int) $verdict['acquit'] ?></span> not guilty</p>
  </section>

  <?php if ($verdict['open']): ?>
    <section class="vote" aria-labelledby="vote-h">
      <h2 id="vote-h">Your verdict</h2>
      <?php if (!$user): ?>
        <p><a href="/login?next=<?= e(rawurlencode("/cases/{$id}")) ?>">Log in</a> or <a href="/register">register</a> to join the jury.</p>
      <?php elseif ($isOwner): ?>
        <p>You filed this case, so you can't sit on its jury. Share it instead.</p>
      <?php elseif ($yourVote): ?>
        <p class="your-vote">You voted <strong class="<?= $yourVote === 'guilty' ? 'g' : 'a' ?>"><?= e($sideLabel[$yourVote]) ?></strong>.</p>
      <?php else: ?>
        <form method="post" action="/api/cases/<?= $id ?>/vote" class="vote-form" data-js="vote">
          <?= csrf_field() ?>
          <label for="argument">Optional one-line argument</label>
          <input id="argument" name="argument" maxlength="120" placeholder="Make your case in 120 characters">
          <div class="vote-buttons">
            <button type="submit" name="verdict" value="guilty" class="btn btn-guilty">Guilty</button>
            <button type="submit" name="verdict" value="acquit" class="btn btn-acquit">Not guilty</button>
          </div>
        </form>
      <?php endif; ?>
    </section>
  <?php endif; ?>

  <section class="share" aria-labelledby="share-h">
    <h2 id="share-h">Share the verdict</h2>
    <div class="share-row">
      <label for="share-url" class="visually-hidden">Case link</label>
      <input id="share-url" value="<?= e($shareUrl) ?>" readonly>
      <button type="button" class="btn" data-js="copy" data-copy="<?= e($shareUrl) ?>">Copy link</button>
      <a class="btn" href="/cases/<?= $id ?>/card.svg" download="verdict-<?= $id ?>.svg">Download card</a>
    </div>
  </section>

  <section class="top-args" aria-labelledby="top-h">
    <h2 id="top-h">Closing arguments</h2>
    <div class="top-grid">
      <?php foreach (['guilty', 'acquit'] as $side): $a = $top[$side]; ?>
        <blockquote class="top-arg top-<?= $side ?>">
          <p class="mono"><?= e(strtoupper($sideLabel[$side])) ?></p>
          <?php if ($a): ?>
            <p><?= e($a['body']) ?></p>
            <footer>@<?= e($a['username']) ?> · <?= (int) $a['upvotes'] ?> upvotes</footer>
          <?php else: ?>
            <p class="muted">No argument yet.</p>
          <?php endif; ?>
        </blockquote>
      <?php endforeach; ?>
    </div>
  </section>

  <section id="arguments" aria-labelledby="args-h">
    <h2 id="args-h">All arguments (<?= count($arguments) ?>)</h2>
    <?php if ($user && $yourVote && !$hasArgued && $verdict['open']): ?>
      <form method="post" action="/api/cases/<?= $id ?>/arguments" class="argue-form">
        <?= csrf_field() ?>
        <label for="arg-body">Add your argument (<?= e($sideLabel[$yourVote]) ?>)</label>
        <input id="arg-body" name="body" minlength="3" maxlength="120" required>
        <button type="submit" class="btn">Submit</button>
      </form>
    <?php endif; ?>
    <ul class="args">
      <?php foreach ($arguments as $a): ?>
        <li class="arg arg-<?= e($a['side']) ?>">
          <span class="mono side"><?= e($sideLabel[$a['side']]) ?></span>
          <p><?= e($a['body']) ?></p>
          <span class="who">@<?= e($a['username']) ?></span>
          <?php if ($user && !$a['isMine'] && !$a['upvotedByMe'] && $verdict['open']): ?>
            <form method="post" action="/api/arguments/<?= (int) $a['id'] ?>/upvote" class="inline" data-js="upvote">
              <?= csrf_field() ?>
              <button type="submit" class="btn btn-sm" aria-label="Upvote argument by @<?= e($a['username']) ?>">&#9650; <span data-upvotes><?= (int) $a['upvotes'] ?></span></button>
            </form>
          <?php else: ?>
            <span class="mono upvotes">&#9650; <?= (int) $a['upvotes'] ?></span>
          <?php endif; ?>
        </li>
      <?php endforeach; ?>
    </ul>
  </section>
</article>
