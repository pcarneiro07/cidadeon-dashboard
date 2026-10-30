# Executar na pasta raiz do projeto cidadeon-dashboard.
$ErrorActionPreference = 'Stop'
if (-not (Test-Path '.\app.yml') -or -not (Test-Path '.\package.json')) {
  throw 'Entre na pasta cidadeon-dashboard antes de executar.'
}
Write-Host 'Aplicacao nova: YOUTUBE_EPTV.DEV.CIDADEON_DASHBOARD' -ForegroundColor Cyan
Write-Host 'ACIDADEON_INTELLIGENCE nao sera alterado.'
if (-not (Get-Command snow -ErrorAction SilentlyContinue)) {
  throw 'Snowflake CLI nao encontrado. Ative o ambiente Python onde snowflake-cli ja foi instalado.'
}
& snow helpers check-version
if ($LASTEXITCODE -ne 0) { throw 'Atualize o Snowflake CLI antes de prosseguir.' }
& snow app validate --connection acidadeon
if ($LASTEXITCODE -ne 0) { throw 'Validacao falhou. Corrija o app.yml ou as permissoes.' }
$confirm = Read-Host 'Secrets OAuth2 e External Access Integration estao criados? (SIM para publicar)'
if ($confirm -cne 'SIM') { Write-Host 'Publicacao cancelada. Nenhum app foi modificado.'; exit 1 }
& snow app deploy --connection acidadeon
if ($LASTEXITCODE -ne 0) { throw 'Deploy falhou; veja os logs via snow app events.' }
& snow app open --connection acidadeon --print-only
