<?php
declare(strict_types=1);

namespace App;

/**
 * 1200x630 PNG verdict card for og:image (Facebook, X, LinkedIn, Slack and iMessage
 * don't render SVG previews). Same layout and data as VerdictCard::svg, drawn with GD.
 *
 * Fonts: CARD_FONT / CARD_FONT_MONO (paths to .ttf files) if set, otherwise the first
 * common system font found (DejaVu on Linux, Georgia/Arial on Windows/macOS). No fonts are
 * bundled for licensing reasons. Without FreeType or any font, GD's built-in bitmap font is
 * scaled up: cruder, but the card still renders.
 */
final class VerdictCardPng
{
    private const SERIF = [
        '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf',
        '/usr/share/fonts/dejavu/DejaVuSerif-Bold.ttf',
        '/usr/share/fonts/TTF/DejaVuSerif-Bold.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf',
        'C:/Windows/Fonts/georgiab.ttf',
        '/System/Library/Fonts/Supplemental/Georgia Bold.ttf',
    ];
    private const MONO = [
        '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf',
        '/usr/share/fonts/dejavu/DejaVuSansMono-Bold.ttf',
        '/usr/share/fonts/TTF/DejaVuSansMono-Bold.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationMono-Bold.ttf',
        'C:/Windows/Fonts/consolab.ttf',
        'C:/Windows/Fonts/arialbd.ttf',
        '/System/Library/Fonts/Supplemental/Courier New Bold.ttf',
    ];
    private const STAMP = [
        'GUILTY' => [0xE5, 0x38, 0x3B],
        'ACQUITTED' => [0x38, 0xB0, 0x00],
        'HUNG JURY' => [0xAD, 0xB5, 0xBD],
        'DELIBERATING' => [0xFF, 0xB7, 0x03],
    ];

    public static function available(): bool
    {
        return function_exists('imagecreatetruecolor') && function_exists('imagepng');
    }

    public static function font(string $kind): ?string
    {
        if (!function_exists('imagettftext')) {
            return null;
        }
        $env = Config::get($kind === 'mono' ? 'CARD_FONT_MONO' : 'CARD_FONT');
        $candidates = array_merge($env ? [$env] : [], $kind === 'mono' ? self::MONO : self::SERIF);
        foreach ($candidates as $f) {
            if (is_file($f) && is_readable($f)) {
                return $f;
            }
        }
        return null;
    }

    public static function png(array $case, ?int $now = null): string
    {
        $v = Verdict::of($case, $now);
        $serif = self::font('serif');
        $mono = self::font('mono') ?? $serif;
        $im = imagecreatetruecolor(1200, 630);
        imageantialias($im, true);
        $c = static fn (int $r, int $g, int $b): int => imagecolorallocate($im, $r, $g, $b);
        $wood = $c(0x21, 0x16, 0x0F);
        $grain = $c(0x1A, 0x11, 0x0B);
        $gold = $c(0xC9, 0xA2, 0x27);
        $cream = $c(0xF7, 0xEF, 0xE3);
        $muted = $c(0xBF, 0xB3, 0xA3);
        $red = $c(0xE5, 0x38, 0x3B);
        $green = $c(0x38, 0xB0, 0x00);

        imagefilledrectangle($im, 0, 0, 1199, 629, $wood);
        for ($y = 10; $y < 630; $y += 12) {
            imagefilledrectangle($im, 0, $y, 1199, $y + 1, $grain);
        }
        imagesetthickness($im, 3);
        imagerectangle($im, 24, 24, 1176, 606, $gold);
        imagesetthickness($im, 1);
        imagerectangle($im, 36, 36, 1164, 594, $gold);

        $no = 'CASE No. ' . str_pad((string) $case['id'], 4, '0', STR_PAD_LEFT);
        self::text($im, $mono, 20, 80, 104, $gold, 'HOT TAKE COURT');
        self::text($im, $mono, 20, 1120, 104, $gold, $no . ' - ' . mb_strtoupper($case['category']), 'right');

        // The take must stay left of the stamp (x < 670) and above the vote bar (y < 450).
        [$size, $lines] = self::fitTake('"' . $case['body'] . '"', $serif);
        foreach ($lines as $i => $line) {
            self::text($im, $serif, $size, 80, 150 + $size + $i * (int) ($size * 1.42), $cream, $line);
        }

        // Stamp: drawn on its own canvas, then rotated -10deg (counter-clockwise) onto the card.
        $word = $v['label'];
        $ss = mb_strlen($word) > 9 ? 44 : 58;
        $sw = (int) (mb_strlen($word) * $ss * 0.8 + 80);
        $st = imagecreatetruecolor($sw, 140);
        imagealphablending($st, false);
        $clear = imagecolorallocatealpha($st, 0, 0, 0, 127);
        imagefilledrectangle($st, 0, 0, $sw, 140, $clear);
        imagealphablending($st, true);
        $sc = imagecolorallocate($st, ...self::STAMP[$word]);
        imagesetthickness($st, 8);
        imagerectangle($st, 6, 10, $sw - 7, 129, $sc);
        imagesetthickness($st, 3);
        imagerectangle($st, 18, 22, $sw - 19, 117, $sc);
        self::text($st, $serif, $ss, (int) ($sw / 2), 70 + (int) ($ss * 0.36), $sc, $word, 'center');
        $rot = imagerotate($st, 10, $clear);
        imagealphablending($im, true);
        imagecopy($im, $rot, (int) (880 - imagesx($rot) / 2), (int) (375 - imagesy($rot) / 2), 0, 0, imagesx($rot), imagesy($rot));

        self::text($im, $mono, 17, 80, 500, $red, "GUILTY {$v['guiltyPct']}%");
        self::text($im, $mono, 17, 1120, 500, $green, "NOT GUILTY {$v['acquitPct']}%", 'right');
        $gw = $v['total'] ? (int) round(1040 * $v['guilty'] / $v['total']) : 520;
        imagefilledrectangle($im, 80, 516, 1120, 538, $green);
        if ($gw > 0) {
            imagefilledrectangle($im, 80, 516, 80 + $gw, 538, $red);
        }
        $votes = $v['total'] === 1 ? '1 VOTE' : "{$v['total']} VOTES";
        $status = $v['open'] ? 'Jury deliberating: ' . Clock::relative($case['closes_at']) : 'Verdict final';
        self::text($im, $mono, 15, 80, 574, $muted, 'FILED BY @' . mb_strtoupper($case['username']) . ' - ' . $votes);
        self::text($im, $mono, 15, 1120, 574, $muted, mb_strtoupper($status), 'right');

        ob_start();
        imagepng($im, null, 6);
        return (string) ob_get_clean();
    }

    /**
     * Largest font size whose pixel-width word wrap fits a 590x300 box.
     * @return array{0:int, 1:list<string>}
     */
    private static function fitTake(string $text, ?string $font): array
    {
        if ($font === null) {
            return [36, VerdictCard::wrap($text, 24, 5)];
        }
        $width = static function (string $s, int $size) use ($font): int {
            $b = imagettfbbox($size, 0, $font, $s);
            return $b ? $b[2] - $b[0] : 0;
        };
        foreach ([46, 40, 34, 30, 26] as $size) {
            $maxLines = intdiv(300, (int) ($size * 1.42));
            $lines = [];
            $cur = '';
            foreach (preg_split('/\s+/u', trim($text)) ?: [] as $word) {
                $try = $cur === '' ? $word : "{$cur} {$word}";
                if ($cur !== '' && $width($try, $size) > 590) {
                    $lines[] = $cur;
                    $cur = $word;
                } else {
                    $cur = $try;
                }
            }
            $lines[] = $cur;
            $fits = count($lines) <= $maxLines && max(array_map(fn ($l) => $width($l, $size), $lines)) <= 590;
            if ($fits || $size === 26) {
                if (!$fits) { // smallest size still overflows: hard-wrap by characters and ellipsize
                    $lines = VerdictCard::wrap($text, 36, $maxLines);
                }
                return [$size, $lines];
            }
        }
        return [26, []]; // unreachable
    }

    /** Draw text with a TTF font, or GD's bitmap font scaled up when no font is available. */
    private static function text(\GdImage $im, ?string $font, int $size, int $x, int $y, int $color, string $s, string $align = 'left'): void
    {
        if ($font !== null) {
            $box = imagettfbbox($size, 0, $font, $s);
            $w = $box ? $box[2] - $box[0] : 0;
            $x0 = $align === 'right' ? $x - $w : ($align === 'center' ? (int) ($x - $w / 2) : $x);
            imagettftext($im, $size, 0, $x0, $y, $color, $font, $s);
            return;
        }
        // Bitmap fallback: font 5 is 9x15 px and Latin-1 only; transliterate, render, scale.
        $ascii = preg_replace('/[^\x20-\x7E]/', '?', (string) (iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $s) ?: $s));
        $scale = max(1, (int) round($size / 12));
        $w = strlen($ascii) * 9;
        $tmp = imagecreatetruecolor(max(1, $w), 15);
        imagealphablending($tmp, false);
        $clear = imagecolorallocatealpha($tmp, 0, 0, 0, 127);
        imagefilledrectangle($tmp, 0, 0, $w, 15, $clear);
        [$r, $g, $b] = array_values(array_slice(imagecolorsforindex($im, $color), 0, 3));
        imagestring($tmp, 5, 0, 0, $ascii, imagecolorallocate($tmp, $r, $g, $b));
        $W = $w * $scale;
        $x0 = $align === 'right' ? $x - $W : ($align === 'center' ? (int) ($x - $W / 2) : $x);
        imagecopyresized($im, $tmp, $x0, $y - 15 * $scale, 0, 0, $W, 15 * $scale, $w, 15);
    }
}
