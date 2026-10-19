# v6 is a multi-file application. The v5 HTML generator would overwrite it.
# Run tests; deploy the repository or Docker image as described in README.md.
$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
  npm run check
  if ($LASTEXITCODE -ne 0) { throw 'Syntax check failed' }
  npm test
  if ($LASTEXITCODE -ne 0) { throw 'Tests failed' }
  Write-Host 'Validation OK. See docs/DEPLOYMENT.md for hosting. No files were overwritten or pushed.'
} finally { Pop-Location }
