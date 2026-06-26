# Compile and run the ADLC demo backend with nothing but a JDK.
# Usage:  ./run.ps1            (port 8080)
#         ./run.ps1 9090       (custom port)
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$src  = Join-Path $here "src"
$out  = Join-Path $here "out"

if (-not (Test-Path $out)) { New-Item -ItemType Directory -Path $out | Out-Null }

Write-Host "Compiling..." -ForegroundColor Cyan
$files = Get-ChildItem -Recurse -Path $src -Filter *.java | ForEach-Object { $_.FullName }
& javac -d $out $files
if ($LASTEXITCODE -ne 0) { throw "Compilation failed" }

$port = if ($args.Count -gt 0) { $args[0] } else { "8080" }
Write-Host "Starting backend on port $port ..." -ForegroundColor Green
& java -cp $out com.cognizant.adlc.Server $port
