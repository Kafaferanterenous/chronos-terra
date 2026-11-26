$end = (Get-Date).ToUniversalTime().ToString('yyyy-MM-dd')
$start = (Get-Date).ToUniversalTime().AddDays(-7).ToString('yyyy-MM-dd')
try {
  $u = 'https://ccmc.gsfc.nasa.gov/DONKI-API/get/CME?startDate=' + $start + '&endDate=' + $end
  $r = Invoke-WebRequest -UseBasicParsing $u -TimeoutSec 60
  Write-Output ('OK len=' + $r.Content.Length + '  ' + $u)
  Write-Output $r.Content.Substring(0, [Math]::Min(400, $r.Content.Length))
} catch {
  Write-Output ('FAIL ' + $_.Exception.Message)
}
