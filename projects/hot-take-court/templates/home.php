<?php
/** @var array $docket */
$sorts = ['trending' => 'Trending', 'new' => 'Newest', 'closing' => 'Closing soon'];
?>
<section class="hero">
  <h1>Put your opinion on trial.</h1>
  <p>Submit your hottest take. The internet is the jury. Get a verdict card: <strong class="g">GUILTY</strong> of being wrong, or <strong class="a">ACQUITTED</strong>.</p>
</section>

<section aria-labelledby="docket-h">
  <h2 id="docket-h" class="visually-hidden">The docket</h2>
  <div class="filters">
    <nav aria-label="Sort cases" class="tabs">
      <?php foreach ($sorts as $key => $label): ?>
        <a href="<?= e(docket_url(['sort' => $key, 'category' => $docket['category']])) ?>"<?= $docket['sort'] === $key ? ' aria-current="page"' : '' ?>><?= e($label) ?></a>
      <?php endforeach; ?>
    </nav>
    <nav aria-label="Filter by category" class="chips">
      <a href="<?= e(docket_url(['sort' => $docket['sort']])) ?>"<?= $docket['category'] === null ? ' aria-current="page"' : '' ?>>All</a>
      <?php foreach (App\Verdict::CATEGORIES as $cat): ?>
        <a href="<?= e(docket_url(['sort' => $docket['sort'], 'category' => $cat])) ?>"<?= $docket['category'] === $cat ? ' aria-current="page"' : '' ?>><?= e($cat) ?></a>
      <?php endforeach; ?>
    </nav>
  </div>

  <?php if (!$docket['items']): ?>
    <p class="empty">No cases on this docket. <a href="/new">File the first one.</a></p>
  <?php endif; ?>
  <div class="cases">
    <?php foreach ($docket['items'] as $c) { echo App\View::partial('partials/case_row', ['c' => $c]); } ?>
  </div>

  <?php if ($docket['pages'] > 1): ?>
    <nav class="pager" aria-label="Pagination">
      <?php if ($docket['page'] > 1): ?>
        <a rel="prev" href="<?= e(docket_url(['sort' => $docket['sort'], 'category' => $docket['category'], 'page' => $docket['page'] - 1])) ?>">&larr; Previous</a>
      <?php endif; ?>
      <span>Page <?= (int) $docket['page'] ?> of <?= (int) $docket['pages'] ?></span>
      <?php if ($docket['page'] < $docket['pages']): ?>
        <a rel="next" href="<?= e(docket_url(['sort' => $docket['sort'], 'category' => $docket['category'], 'page' => $docket['page'] + 1])) ?>">Next &rarr;</a>
      <?php endif; ?>
    </nav>
  <?php endif; ?>
</section>
