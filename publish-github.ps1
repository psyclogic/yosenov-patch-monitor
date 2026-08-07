param(
    [Parameter(Mandatory = $false)]
    [string]$RepositoryName = "yosenov-patch-monitor",

    [ValidateSet("public", "private")]
    [string]$Visibility = "public"
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw "Git belum terpasang. Instal Git terlebih dahulu."
}

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw "GitHub CLI (gh) belum terpasang. Instal dari https://cli.github.com lalu jalankan: gh auth login"
}

$forbiddenFiles = Get-ChildItem -Path $PSScriptRoot -Recurse -File | Where-Object {
    $_.Name -match 'service[-_]?account.*\.json$' -or
    $_.Name -match 'firebase-adminsdk.*\.json$' -or
    $_.Name -match 'application_default_credentials\.json$'
}

if ($forbiddenFiles) {
    $names = ($forbiddenFiles.FullName -join "`n")
    throw "Ditemukan file kredensial yang tidak boleh diunggah:`n$names"
}

Set-Location $PSScriptRoot

if (-not (Test-Path ".git")) {
    git init
}

git add .

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Tidak ada perubahan untuk dikomit."
} else {
    git commit -m "Initial commit: YOSENOV Patch Monitor"
}

git branch -M main

gh repo create $RepositoryName --$Visibility --source . --remote origin --push

Write-Host "Repository berhasil dibuat dan seluruh proyek telah diunggah."
