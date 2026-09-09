foreach ($u in @(
  'https://cdaw.gsfc.nasa.gov/CME_list/UNIVERSAL/2026_07/univ2026_07.txt',
  'https://cdaw.gsfc.nasa.gov/CME_list/UNIVERSAL/2026_08/univ2026_08.txt',
  'https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/getCME'
)) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing $u -TimeoutSec 45
    Write-Output ('OK len=' + $r.Content.Length + '  ' + $u)
    Write-Output ($r.Content.Substring(0, [Math]::Min(500, $r.Content.Length)))
    Write-Output '---'
  } catch {
    Write-Output ('FAIL ' + $_.Exception.Message + '  ' + $u)
  }
}
