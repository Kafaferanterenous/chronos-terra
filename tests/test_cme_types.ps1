$r = Invoke-WebRequest -UseBasicParsing 'https://services.swpc.noaa.gov/json/edited_events.json' -TimeoutSec 60
$ev = $r.Content | ConvertFrom-Json
Write-Output ('total events ' + $ev.Count)
$types = $ev | Group-Object type | Sort-Object Count -Descending | Select-Object -First 12
foreach ($t in $types) { Write-Output ($t.Name + ' x' + $t.Count) }
$cme = $ev | Where-Object { $_.type -eq 'CME' } | Select-Object -Last 2
foreach ($c in $cme) {
  Write-Output '=== CME sample ==='
  Write-Output ($c | ConvertTo-Json -Depth 4)
}
