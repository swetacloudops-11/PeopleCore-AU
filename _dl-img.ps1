$ErrorActionPreference = "Continue"
$dir = "C:\Users\Nitish\Desktop\PeopleCore AU\public\images\site"
New-Item -ItemType Directory -Force -Path $dir | Out-Null

# Curated Unsplash photos (free licence, hotlink-free: downloaded locally).
$map = [ordered]@{
  "hero-team.jpg"        = "photo-1522071820081-009f0129c71c"
  "sol-hr.jpg"           = "photo-1450101499163-c8848c66ca85"
  "sol-payroll.jpg"      = "photo-1554224155-6726b3ff858f"
  "sol-rostering.jpg"    = "photo-1506784983877-45594efa4cbe"
  "sol-employee.jpg"     = "photo-1573496359142-b8d87734a5a2"
  "sol-ai.jpg"           = "photo-1677442136019-21780ecad995"
  "ind-hospitality.jpg"  = "photo-1556740738-b6a63e27c4df"
  "ind-healthcare.jpg"   = "photo-1538108149393-fbbd81895907"
  "ind-childcare.jpg"    = "photo-1503676260728-1c00da094a0b"
  "ind-logistics.jpg"    = "photo-1586528116311-ad8dd3c8310d"
  "ind-manufacturing.jpg"= "photo-1581091226825-a6a2a5aee158"
  "ind-accounting.jpg"   = "photo-1554224154-26032ffc0d07"
  "about-team.jpg"       = "photo-1521737604893-d14cc237f11d"
  "contact-side.jpg"     = "photo-1600880292203-757bb62b4baf"
}

$ok = 0; $bad = @()
foreach ($name in $map.Keys) {
  $id = $map[$name]
  $url = "https://images.unsplash.com/$id`?auto=format&fit=crop&w=1200&q=70"
  $dest = Join-Path $dir $name
  try {
    Invoke-WebRequest -Uri $url -OutFile $dest -TimeoutSec 60
    $file = Get-Item $dest
    if ($file.Length -gt 20000) { $ok++; Write-Output ("OK   {0,-22} {1} KB" -f $name, [int]($file.Length/1KB)) }
    else { $bad += $name; Write-Output ("TINY {0,-22} {1} bytes" -f $name, $file.Length) }
  } catch {
    $bad += $name
    Write-Output ("FAIL {0,-22} {1}" -f $name, $_.Exception.Message)
  }
}
Write-Output ""
Write-Output "downloaded OK: $ok / $($map.Count)  failed: $($bad.Count)  $($bad -join ', ')"
