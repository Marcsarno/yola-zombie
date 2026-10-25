# One labelled sheet of all 23 Mixamo picks (their intake portraits), grouped by role, with where each one stands.
Add-Type -AssemblyName System.Drawing
$IN = 'C:\Users\marc7\.claude\projects\Zombie Apoc\yolanda\zombie\shots\intake'
$OUT = 'C:\Users\marc7\.claude\projects\Zombie Apoc\yolanda\zombie\shots\mixamo_all_23.jpg'
# slug, name, role note, status (game = in Chapter 2, build = being built, rig = Rig Lab, '' = downloaded only)
$groups = @(
  @{ t = 'HOSPITAL'; c = @(@('chad','Chad','Surgeon (your favourite)',''), @('joe','Joe','Suit: administrator',''), @('alex','Alex','Security uniform',''), @('dummy','Dummy','Orange jumpsuit','')) },
  @{ t = 'ZOMBIES'; c = @(@('romero','Romero','Zombie','game'), @('zombiegirl','Zombiegirl','Zombie','game'), @('yaku','Yaku','Zombie',''), @('skeletonzombie','Skeletonzombie','Ribs out',''), @('parasite','Parasite','Mutated',''), @('maynard','Maynard','Skinless','')) },
  @{ t = 'ARMED'; c = @(@('swat','Swat','Blue uniform',''), @('swat_guy','Swat Guy','Armoured, masked',''), @('steve','Steve','Army fatigues',''), @('eve','Eve','Tactical gear','game')) },
  @{ t = 'CIVILIANS'; c = @(@('james','James','Hoodie','build'), @('remy','Remy','T-shirt, cargo shorts','game'), @('adam','Adam','Grey athletic',''), @('brian','Brian','Polo, jeans','rig'), @('sophie','Sophie','Yellow top','build'), @('bryce','Bryce','Red T-shirt','build'), @('david','David','Black long sleeves','game'), @('pete','Pete','Hi-vis, hard hat',''), @('lewis','Lewis','Teal T-shirt','')) }
)
$TW = 240; $TH = 320; $GAP = 14; $LAB = 64; $HEAD = 46; $PAD = 30; $COLS = 9
$W = $PAD * 2 + $COLS * $TW + ($COLS - 1) * $GAP
$H = 120 + $groups.Count * ($HEAD + $TH + $LAB + 18) + 40
$bmp = New-Object System.Drawing.Bitmap $W, $H
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'; $g.InterpolationMode = 'HighQualityBicubic'; $g.TextRenderingHint = 'AntiAliasGridFit'
$g.Clear([System.Drawing.Color]::FromArgb(29, 38, 43))
$fT = New-Object System.Drawing.Font('Segoe UI', 30, [System.Drawing.FontStyle]::Bold)
$fS = New-Object System.Drawing.Font('Segoe UI', 14)
$fH = New-Object System.Drawing.Font('Segoe UI', 17, [System.Drawing.FontStyle]::Bold)
$fN = New-Object System.Drawing.Font('Segoe UI', 15, [System.Drawing.FontStyle]::Bold)
$fR = New-Object System.Drawing.Font('Segoe UI', 11)
$white = [System.Drawing.Brushes]::WhiteSmoke
$dim = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(157, 176, 173))
$amber = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 179, 71))
$card = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(38, 50, 58))
$tag = @{ game = @('IN CHAPTER 2', [System.Drawing.Color]::FromArgb(46, 160, 90)); build = @('BEING BUILT', [System.Drawing.Color]::FromArgb(214, 140, 30)); rig = @('RIG LAB DUMMY', [System.Drawing.Color]::FromArgb(70, 120, 200)) }
$g.DrawString('Your 23 Mixamo characters', $fT, $white, $PAD, 22)
$g.DrawString('All downloaded (T-pose, local only: yolanda/zombie/assets/source/refs).  Green: in the game.  Orange: being built now.  Blue: the Rig Lab''s clothed dummy.  No tag: downloaded, not used yet.', $fS, $dim, $PAD + 2, 74)
$y = 120
foreach ($grp in $groups) {
  $g.DrawString(("{0} ({1})" -f $grp.t, $grp.c.Count), $fH, $amber, $PAD, $y + 8)
  $y += $HEAD; $x = $PAD
  foreach ($c in $grp.c) {
    $g.FillRectangle($card, $x, $y, $TW, $TH + $LAB)
    $img = [System.Drawing.Image]::FromFile((Join-Path $IN ($c[0] + '\look.jpg')))
    $g.DrawImage($img, $x, $y, $TW, $TH); $img.Dispose()
    if ($c[0] -eq 'chad') { $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 179, 71)), 4; $g.DrawRectangle($pen, $x + 2, $y + 2, $TW - 4, $TH + $LAB - 4) }
    $g.DrawString($c[1], $fN, $white, $x + 8, $y + $TH + 6)
    $g.DrawString($c[2], $fR, $dim, $x + 9, $y + $TH + 34)
    if ($c[3]) {
      $t = $tag[$c[3]]; $sz = $g.MeasureString($t[0], $fR)
      $b = New-Object System.Drawing.SolidBrush $t[1]
      $g.FillRectangle($b, $x + 6, $y + 6, $sz.Width + 10, $sz.Height + 4)
      $g.DrawString($t[0], $fR, $white, $x + 11, $y + 8)
    }
    $x += $TW + $GAP
  }
  $y += $TH + $LAB + 18
}
$enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$ep = New-Object System.Drawing.Imaging.EncoderParameters 1
$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 90L
$bmp.Save($OUT, $enc, $ep); $g.Dispose(); $bmp.Dispose()
"SAVED $OUT ${W}x${H}"
