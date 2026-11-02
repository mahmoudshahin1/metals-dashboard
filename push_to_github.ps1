$ErrorActionPreference = "Continue"
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  Metals Dashboard - GitHub Push Tool" -ForegroundColor Yellow
Write-Host "========================================================" -ForegroundColor Cyan

$repoUrl = "https://github.com/mahmoudshahin1/metals-dashboard.git"

Write-Host "`n[1/3] Setting remote to: $repoUrl" -ForegroundColor Green
git remote remove origin 2>$null
git remote add origin $repoUrl

Write-Host "`n[2/3] Committing files..." -ForegroundColor Green
git add -A
git commit -m "Update Metals Dashboard: English UI, new machine table columns, and latest daily production" 2>$null

Write-Host "`n[3/3] Pushing to GitHub (main branch)..." -ForegroundColor Green
Write-Host "Target: https://github.com/mahmoudshahin1/metals-dashboard" -ForegroundColor White

git -c http.version=HTTP/1.1 push -u origin main --force

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n========================================================" -ForegroundColor Green
    Write-Host "  SUCCESSFULLY PUSHED TO GITHUB!" -ForegroundColor Green
    Write-Host "========================================================" -ForegroundColor Green
    Write-Host "Live Dashboard URL:" -ForegroundColor White
    Write-Host "https://mahmoudshahin1.github.io/metals-dashboard/" -ForegroundColor Cyan
} else {
    Write-Host "`n[!] Push returned exit code: $LASTEXITCODE" -ForegroundColor Yellow
}
