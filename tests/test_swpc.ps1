foreach ($u in @(
  'https://services.swpc.noaa.gov/products/alerts.json',
  'https://services.swpc.noaa.gov/json/edited_events.json',
  'https://services.swpc.noaa.gov/json/cme.json'
)) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing $u -TimeoutSec 45
    $c = $r.Content
    Write-Output ('OK len=' + $c.Length + '  ' + $u)
    Write-Output ($c.Substring(0, [Math]::Min(350, $c.Length)))
    Write-Output '---'
  } catch {
    Write-Output ('FAIL ' + $_.Exception.Message + '  ' + $u)
  }
}
