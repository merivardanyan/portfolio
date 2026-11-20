<?php
/** @var array $c */
$v = App\Verdict::of($c);
?>
<article class="case-row">
  <div class="case-meta">
    <span class="tag"><?= e($c['category']) ?></span>
    <span class="mono">No. <?= e(str_pad((string) $c['id'], 4, '0', STR_PAD_LEFT)) ?></span>
    <span class="mono"><?= $v['open'] ? e(App\Clock::relative($c['closes_at'])) : 'closed' ?></span>
  </div>
  <h2 class="case-title"><a href="/cases/<?= (int) $c['id'] ?>"><?= e($c['body']) ?></a></h2>
  <svg class="split" viewBox="0 0 100 10" preserveAspectRatio="none" role="img" aria-label="<?= e("Guilty {$v['guilty']}, not guilty {$v['acquit']}") ?>"><rect class="split-a" width="100" height="10"/><rect class="split-g" width="<?= (int) $v['guiltyPct'] ?>" height="10"/></svg>
  <div class="case-foot">
    <span>by <a href="/u/<?= e($c['username']) ?>">@<?= e($c['username']) ?></a></span>
    <span class="mono"><?= (int) $v['guilty'] ?> guilty · <?= (int) $v['acquit'] ?> not guilty</span>
    <?php if (!$v['open']): ?><span class="stamp-sm stamp-<?= e(strtolower(str_replace(' ', '-', $v['label']))) ?>"><?= e($v['label']) ?></span><?php endif; ?>
  </div>
</article>
