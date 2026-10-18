# Prépare le site GitHub Pages à partir de la dernière version du jeu (index-vX.Y.html).
# Usage : powershell -ExecutionPolicy Bypass -File publish.ps1 [-Game ..\index-v5.6.html] [-Push]
#   -Push : commit + push vers GitHub (sinon, prépare seulement les fichiers).
param(
    [string]$Game,
    [switch]$Push
)
$ErrorActionPreference = 'Stop'
$web = $PSScriptRoot

if (-not $Game) {
    $Game = Get-ChildItem (Join-Path $web '..') -Filter 'index-v*.html' |
        Sort-Object { [version](($_.BaseName -replace '^index-v', '') + '.0') } |
        Select-Object -Last 1 | ForEach-Object FullName
}
$html = Get-Content -Raw -Encoding UTF8 $Game
$m = [regex]::Match($html, "GAME_VERSION = '([^']+)'")
if (-not $m.Success) { throw "GAME_VERSION introuvable dans $Game" }
$version = $m.Groups[1].Value

# Balises « appli installable » (iPhone + Android) ajoutées dans <head>
$pwaHead = @'
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icon-180.png">
<link rel="icon" type="image/png" sizes="192x192" href="icon-192.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Hexa Sort">
'@
# Enregistrement du mode hors ligne, juste avant </body>
$swScript = @'
<script>
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => { /* hors ligne indisponible : le jeu marche quand même */ });
  }
</script>
'@
if ($html -notmatch '</head>' -or $html -notmatch '</body>') { throw "Structure HTML inattendue dans $Game" }
$html = $html.Replace('</head>', $pwaHead + '</head>').Replace('</body>', $swScript + '</body>')
$utf8 = New-Object Text.UTF8Encoding($false)
[IO.File]::WriteAllText((Join-Path $web 'index.html'), $html, $utf8)

$sw = [IO.File]::ReadAllText((Join-Path $web 'sw.js'), [Text.Encoding]::UTF8)
$sw = [regex]::Replace($sw, "const CACHE = 'hexa-sort-[^']*';", "const CACHE = 'hexa-sort-$version';")
[IO.File]::WriteAllText((Join-Path $web 'sw.js'), $sw, $utf8)

Write-Host "Site préparé : version $version (depuis $Game)"

if ($Push) {
    Push-Location $web
    try {
        git add -A
        git commit -m "Hexa Sort v$version"
        git push
    } finally { Pop-Location }
}
