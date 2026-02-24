$ErrorActionPreference = "Stop"

$baseDir = Split-Path -Parent $PSScriptRoot
$path = Join-Path $baseDir "imports\Etapa1_2026.xlsx"
$out = Join-Path $baseDir "imports\equipos_etapa1_2026.csv"

if (-not (Test-Path $path)) {
  Write-Output "No existe Etapa1_2026.xlsx en imports."
  exit 1
}

$countryTokens = @(
  'spain','españa','espana','portugal','france','francia','italy','italia','germany','alemania','austria',
  'switzerland','suiza','belgium','belgica','netherlands','paises bajos','paisesbajos','uk','united kingdom',
  'reino unido','england','inglaterra','scotland','escocia','wales','gales','ireland','irlanda','usa',
  'united states','estados unidos','argentina','chile','uruguay','paraguay','peru','perú','bolivia','ecuador',
  'colombia','venezuela','mexico','méxico','brasil','brazil'
)

function Normalize-Name($name) {
  if ([string]::IsNullOrWhiteSpace($name)) { return "" }
  $n = $name.Trim()
  foreach ($token in $countryTokens) {
    $escaped = [regex]::Escape($token)
    $n = [regex]::Replace($n, "\b$escaped\b", "", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    $n = [regex]::Replace($n, "$escaped\s*$", "", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  }
  $n = $n -replace "[\u00A9]", ""
  $n = $n -replace "[\p{P}\p{S}]", " "
  $n = $n.ToLowerInvariant().Normalize([Text.NormalizationForm]::FormD)
  $chars = New-Object System.Text.StringBuilder
  foreach ($ch in $n.ToCharArray()) {
    $cat = [Globalization.CharUnicodeInfo]::GetUnicodeCategory($ch)
    if ($cat -ne [Globalization.UnicodeCategory]::NonSpacingMark) {
      [void]$chars.Append($ch)
    }
  }
  $n = $chars.ToString()
  $n = $n -replace "\s+", " "
  return $n.Trim()
}

$teamPlayers = @{
  'HOLE FG CLUB' = @('Carlos Calvo','Rubén Garrés','Alejandro Cutillas','Airam Cabrera','Sergio Cardoso','Carlos Moreno','Juan Casal','Juan M. Sánchez','Arthur Ayral')
  'ASOCIACION GALLEGA DE FOOTGOLF' = @('Noé Cortiñas','Sito Campo','Miguel Á. Pérez','Eloy Souto','Juan M. Triñanes','Alberto Camba','Brian Cortiñas','Fabio Pereira')
  'MACARONESIA ALBATROS FG' = @('Iván Abreu','Zeben Díaz','Luis Hernández','Sebastián Sanmiguel','Juan Ramón Pérez','Vicmar Iriarte','Alberto Salazar')
  'TENERIFE FG CLUB' = @('Cherre Bello','José A. López','Eduar González','Piero Menor','Borja Calvo','Sandro Rodríguez')
  'LA TABLA DE GONGORA FG - CLIVET LA SAGRA' = @('Fran Pariente','Sergio Gutiérrez','Sergio Mendoza','Sergio Massip','Sergio Plaza','Arsenio Rodríguez','Yeray Pérez','Emilio Peñafuerte','Iñaki Gauna','Rebeca Domingo')
  'STARLANCER FG' = @('Cuco Alonso','Carlos Sarmiento','Javi Braza','Manuel Flor','Paco Morano','Isaac Silva','Fernándo Román','Antonio Lainez')
  'NINGUARIA FUERTEVENTURA' = @('Samuel Padilla','Abisay Padilla','Alberto Efrén','Moisés López','Lorenzo Morales','Benito Reyes','Jorge Santiago','Eduardo Martín')
}

$playerToTeam = @{}
$rosterIndex = @()
foreach ($team in $teamPlayers.Keys) {
  foreach ($p in $teamPlayers[$team]) {
    $key = Normalize-Name $p
    if (-not [string]::IsNullOrWhiteSpace($key)) {
      $playerToTeam[$key] = $team
      $tokens = $key -split " "
      $rosterIndex += [pscustomobject]@{ Key = $key; Team = $team; Tokens = $tokens }
    }
  }
}

function Match-Team($key) {
  if ($playerToTeam.ContainsKey($key)) { return $playerToTeam[$key] }

  $substringMatch = $rosterIndex | Where-Object { $key -like "*" + $_.Key + "*" } | Select-Object -First 1
  if ($substringMatch) { return $substringMatch.Team }

  $rawTokens = $key -split " "
  $best = $null
  foreach ($entry in $rosterIndex) {
    $ok = $true
    foreach ($t in $entry.Tokens) {
      if (-not ($rawTokens | Where-Object { $_.StartsWith($t) })) { $ok = $false; break }
    }
    if ($ok) {
      if (-not $best -or $entry.Tokens.Count -gt $best.Tokens.Count) { $best = $entry }
    }
  }
  if ($best) { return $best.Team }
  return $null
}

$excel = $null
$wb = $null
$ws = $null

try {
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $wb = $excel.Workbooks.Open($path)
  $ws = $wb.Worksheets.Item(1)
  $used = $ws.UsedRange
  $lastRow = $used.Rows.Count

  $teamScores = @{}
  $unmapped = @()

  for ($r = 2; $r -le $lastRow; $r++) {
    $rawName = ($ws.Cells.Item($r,2).Text).Trim()
    if ([string]::IsNullOrWhiteSpace($rawName)) { continue }
    $golpesText = ($ws.Cells.Item($r,3).Text).Trim()
    if ([string]::IsNullOrWhiteSpace($golpesText)) { continue }
    $golpes = 0
    if (-not [int]::TryParse($golpesText, [ref]$golpes)) { continue }

    $key = Normalize-Name $rawName
    $team = Match-Team $key

    if (-not $team) {
      $unmapped += $rawName
      continue
    }
    if (-not $teamScores.ContainsKey($team)) { $teamScores[$team] = @() }
    $teamScores[$team] += $golpes
  }

  $results = foreach ($team in $teamPlayers.Keys) {
    $scores = @()
    if ($teamScores.ContainsKey($team)) { $scores = $teamScores[$team] | Sort-Object }
    $missing = [Math]::Max(0, 4 - $scores.Count)
    $best4 = $scores | Select-Object -First 4
    $sumBest = ($best4 | Measure-Object -Sum).Sum
    if ($null -eq $sumBest) { $sumBest = 0 }

    $total = $sumBest + (180 * $missing)
    $tiebreak = @()
    for ($i = 5; $i -le 10; $i++) {
      $idx = $i - 1
      if ($scores.Count -ge $i) { $tiebreak += $scores[$idx] } else { $tiebreak += 180 }
    }

    [pscustomobject]@{
      Equipo = $team
      TotalGolpes = $total
      Jugadores = $scores.Count
      Mejores4 = ($best4 -join ', ')
      T5 = $tiebreak[0]
      T6 = $tiebreak[1]
      T7 = $tiebreak[2]
      T8 = $tiebreak[3]
      T9 = $tiebreak[4]
      T10 = $tiebreak[5]
    }
  }

  $sorted = $results | Sort-Object TotalGolpes, T5, T6, T7, T8, T9, T10
  $sorted | Export-Csv -NoTypeInformation -Encoding UTF8 -Path $out

  if ($unmapped.Count -gt 0) {
    $unmapped | Sort-Object -Unique | Set-Content -Encoding UTF8 -Path ($out + ".unmapped.txt")
  }
}
finally {
  if ($wb) { $wb.Close($false) | Out-Null }
  if ($excel) { $excel.Quit() | Out-Null }
  if ($ws) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($ws) | Out-Null }
  if ($wb) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($wb) | Out-Null }
  if ($excel) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null }
}

Write-Output "OK"
