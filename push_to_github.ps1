$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  Metals Dashboard - GitHub Push & Deploy Tool" -ForegroundColor Yellow
Write-Host "========================================================" -ForegroundColor Cyan

$repoUrl = "https://github.com/mahmoudshahin1/metals-dashboard.git"

Write-Host "`n[1/3] Checking Git repository & origin remote..." -ForegroundColor Green
Set-Location "C:\Users\mahmoud.mohamed\Desktop\METAL"
git remote remove origin 2>$null
git remote add origin $repoUrl

Write-Host "`n[2/3] Adding all updated files..." -ForegroundColor Green
git add -A
git commit -m "Deploy updated Metals Dashboard with Nov 1 records & English UI" 2>$null

Write-Host "`n[3/3] Pushing to GitHub (main branch)..." -ForegroundColor Green
Write-Host "Destination: $repoUrl" -ForegroundColor White

git -c http.version=HTTP/1.1 push -u origin main --force

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n========================================================" -ForegroundColor Green
    Write-Host "  SUCCESS! Deployed to GitHub Successfully!" -ForegroundColor Green
    Write-Host "========================================================" -ForegroundColor Green
    Write-Host "`nLive Dashboard Link on GitHub Pages:" -ForegroundColor White
    Write-Host "👉 https://mahmoudshahin1.github.io/metals-dashboard/" -ForegroundColor Cyan
    Write-Host "`n(It usually takes 30-60 seconds for GitHub Pages to refresh the live site)" -ForegroundColor Gray
} else {
    Write-Host "`n========================================================" -ForegroundColor Yellow
    Write-Host "  Authentication required by GitHub" -ForegroundColor Yellow
    Write-Host "========================================================" -ForegroundColor Yellow
    Write-Host "`nIf Git Credential Manager didn't open your browser automatically:" -ForegroundColor White
    Write-Host "You can enter your GitHub Personal Access Token (PAT) below." -ForegroundColor White
    Write-Host "(Or press Enter to cancel)" -ForegroundColor Gray
    
    $token = Read-Host "`nEnter GitHub Token (ghp_...)"
    if ($token -and $token.Trim().Length -gt 10) {
        $token = $token.Trim()
        $authUrl = "https://mahmoudshahin1:$token@github.com/mahmoudshahin1/metals-dashboard.git"
        Write-Host "`nPushing with provided token..." -ForegroundColor Green
        git -c http.version=HTTP/1.1 push $authUrl main --force
        if ($LASTEXITCODE -eq 0) {
            # Save token to .git-credentials for future automatic pushes
            "https://mahmoudshahin1:$token@github.com" | Set-Content "C:\Users\mahmoud.mohamed\.git-credentials" -Encoding UTF8
            Write-Host "`n========================================================" -ForegroundColor Green
            Write-Host "  SUCCESS! Pushed with Token & Saved for future use!" -ForegroundColor Green
            Write-Host "========================================================" -ForegroundColor Green
            Write-Host "`nLive Dashboard Link:" -ForegroundColor White
            Write-Host "👉 https://mahmoudshahin1.github.io/metals-dashboard/" -ForegroundColor Cyan
        } else {
            Write-Host "`n[X] Push with token failed. Please verify your token has 'repo' permissions." -ForegroundColor Red
        }
    }
}
