<?php
declare(strict_types=1);

namespace App;

/** 1200x630 SVG verdict card (case page + og:image). Pure function of the case row. */
final class VerdictCard
{
    private const STAMP = [
        'GUILTY' => ['#E5383B', 'GUILTY'],
        'ACQUITTED' => ['#38B000', 'ACQUITTED'],
        'HUNG JURY' => ['#ADB5BD', 'HUNG JURY'],
        'DELIBERATING' => ['#FFB703', 'DELIBERATING'],
    ];

    public static function svg(array $case, ?int $now = null): string
    {
        $v = Verdict::of($case, $now);
        [$color, $word] = self::STAMP[$v['label']];
        $x = static fn (string $s): string => htmlspecialchars($s, ENT_XML1 | ENT_QUOTES, 'UTF-8');
        $no = 'CASE No. ' . str_pad((string) $case['id'], 4, '0', STR_PAD_LEFT);
        $lines = self::wrap('"' . $case['body'] . '"', 30, 4);
        $fontSize = count($lines) > 3 ? 50 : 58;
        $text = '';
        foreach ($lines as $i => $line) {
            $y = 215 + $i * ($fontSize + 14);
            $text .= "<text x=\"80\" y=\"{$y}\" class=\"take\" font-size=\"{$fontSize}\">{$x($line)}</text>";
        }
        $gw = $v['total'] ? (int) round(1040 * $v['guilty'] / $v['total']) : 520;
        $status = $v['open'] ? 'Jury deliberating: ' . Clock::relative($case['closes_at']) : 'Verdict final';
        $stampSize = mb_strlen($word) > 9 ? 58 : 76;
        $stampW = mb_strlen($word) * ($stampSize * 0.62) + 70;
        $votes = $v['total'] === 1 ? '1 VOTE' : "{$v['total']} VOTES";

        return <<<SVG
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-labelledby="t d">
  <title id="t">{$x(Verdict::headline($case, $now))}</title>
  <desc id="d">Hot Take Court {$x($no)}. Guilty {$v['guilty']}, not guilty {$v['acquit']}.</desc>
  <defs>
    <pattern id="wood" width="1200" height="12" patternUnits="userSpaceOnUse">
      <rect width="1200" height="12" fill="#21160F"/><rect y="10" width="1200" height="2" fill="#1A110B"/>
    </pattern>
    <style>
      .serif { font-family: Georgia, 'Times New Roman', serif; }
      .mono { font-family: 'JetBrains Mono', Consolas, monospace; letter-spacing: 3px; }
      .take { font-family: Georgia, 'Times New Roman', serif; fill: #F7EFE3; font-weight: 700; }
    </style>
  </defs>
  <rect width="1200" height="630" fill="url(#wood)"/>
  <rect x="24" y="24" width="1152" height="582" rx="14" fill="none" stroke="#C9A227" stroke-width="3"/>
  <rect x="36" y="36" width="1128" height="558" rx="10" fill="none" stroke="#C9A227" stroke-opacity=".35"/>
  <text x="80" y="104" class="mono" font-size="22" fill="#C9A227">HOT TAKE COURT</text>
  <text x="1120" y="104" class="mono" font-size="22" fill="#C9A227" text-anchor="end">{$x($no)} · {$x(mb_strtoupper($case['category']))}</text>
  {$text}
  <g transform="translate(880 375) rotate(-10)">
    <rect x="{$x((string) (-$stampW / 2))}" y="-62" width="{$x((string) $stampW)}" height="124" rx="10" fill="none" stroke="{$color}" stroke-width="8"/>
    <rect x="{$x((string) (-$stampW / 2 + 12))}" y="-50" width="{$x((string) ($stampW - 24))}" height="100" rx="6" fill="none" stroke="{$color}" stroke-width="3"/>
    <text x="0" y="{$x((string) ($stampSize * 0.35))}" class="serif" font-size="{$stampSize}" font-weight="700" fill="{$color}" text-anchor="middle" textLength="{$x((string) ($stampW - 70))}" lengthAdjust="spacingAndGlyphs">{$x($word)}</text>
  </g>
  <text x="80" y="500" class="mono" font-size="20" fill="#E5383B">GUILTY {$v['guiltyPct']}%</text>
  <text x="1120" y="500" class="mono" font-size="20" fill="#38B000" text-anchor="end">NOT GUILTY {$v['acquitPct']}%</text>
  <rect x="80" y="516" width="1040" height="22" rx="11" fill="#38B000"/>
  <rect x="80" y="516" width="{$gw}" height="22" rx="11" fill="#E5383B"/>
  <text x="80" y="574" class="mono" font-size="18" fill="#BFB3A3">FILED BY @{$x(mb_strtoupper($case['username']))} · {$x($votes)}</text>
  <text x="1120" y="574" class="mono" font-size="18" fill="#BFB3A3" text-anchor="end">{$x(mb_strtoupper($status))}</text>
</svg>
SVG;
    }

    /** Greedy word wrap (multibyte safe); last line gets an ellipsis if text overflows. */
    public static function wrap(string $text, int $width, int $maxLines): array
    {
        $words = preg_split('/\s+/u', trim($text)) ?: [];
        $lines = [];
        $cur = '';
        foreach ($words as $w) {
            while (mb_strlen($w) > $width) { // break very long words
                if ($cur !== '') {
                    $lines[] = $cur;
                    $cur = '';
                }
                $lines[] = mb_substr($w, 0, $width);
                $w = mb_substr($w, $width);
            }
            $try = $cur === '' ? $w : "{$cur} {$w}";
            if (mb_strlen($try) <= $width) {
                $cur = $try;
            } else {
                $lines[] = $cur;
                $cur = $w;
            }
        }
        if ($cur !== '') {
            $lines[] = $cur;
        }
        if (count($lines) > $maxLines) {
            $lines = array_slice($lines, 0, $maxLines);
            $lines[$maxLines - 1] = rtrim(mb_substr($lines[$maxLines - 1], 0, $width - 1)) . '…';
        }
        return $lines;
    }
}
