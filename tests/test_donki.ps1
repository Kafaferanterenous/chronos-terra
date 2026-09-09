try {
  $u = 'https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/getCME?startDate=2026-07-26&endDate=2026-08-25&api_key=DEMO_KEY'
  $r = Invoke-WebRequest -UseBasicParsing $u -TimeoutSec 60
  Write-Output ('OK len=' + $r.Content.Length)
  Write-Output $r.Content.Substring(0, [Math]::Min(400, $r.Content.Length))
} catch {
  Write-Output ('FAIL ' + $_.Exception.Message)
}
