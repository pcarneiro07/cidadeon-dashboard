<##
.SYNOPSIS
  Prepara um dos dois secrets OAuth2 do Cidade ON para cadastro manual na Vercel.
.DESCRIPTION
  Lê os caminhos locais do .env.local e combina o cliente OAuth com o refresh token
  SEM mostrar os valores na tela, gravar arquivo, enviar pela rede ou modificar tokens.
.EXAMPLE
  .\deploy\copiar-secret-vercel.ps1 -Tipo GA4
  .\deploy\copiar-secret-vercel.ps1 -Tipo GSC
.EXAMPLE
  .\deploy\copiar-secret-vercel.ps1 -Tipo GSC -TokenFile 'C:\caminho\token_gsc.json'
##>
param(
  [Parameter(Mandatory=$true)]
  [ValidateSet('GA4','GSC')]
  [string]$Tipo,
  [string]$EnvFile = '.env.local',
  [string]$ClientFile = '',
  [string]$TokenFile = ''
)

$ErrorActionPreference = 'Stop'

function Load-EnvValues([string]$file) {
  $results = @{}
  if (!(Test-Path -LiteralPath $file)) { return $results }
  foreach ($line in Get-Content -LiteralPath $file -Encoding UTF8) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z_0-9]*)\s*=\s*(.*?)\s*$') {
      $value = $Matches[2].Trim()
      if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
        $value = $value.Substring(1, $value.Length - 2)
      }
      $results[$Matches[1]] = $value
    }
  }
  return $results
}

$dotenv = Load-EnvValues $EnvFile
if (!$ClientFile) { $ClientFile = $dotenv['GA4_CLIENT_SECRET_FILE'] }
if (!$TokenFile) {
  $TokenFile = if ($Tipo -eq 'GA4') { $dotenv['GA4_TOKEN_FILE'] } else { $dotenv['GSC_TOKEN_FILE'] }
}
if (!$ClientFile) { throw 'Não encontrei GA4_CLIENT_SECRET_FILE em .env.local. Informe -ClientFile.' }
if (!$TokenFile) { throw "Não encontrei ${Tipo}_TOKEN_FILE em .env.local. Informe -TokenFile." }
$ClientFile = [Environment]::ExpandEnvironmentVariables($ClientFile)
$TokenFile = [Environment]::ExpandEnvironmentVariables($TokenFile)
if (!(Test-Path -LiteralPath $ClientFile)) { throw 'Arquivo de cliente OAuth não encontrado.' }
if (!(Test-Path -LiteralPath $TokenFile)) { throw 'Arquivo do token OAuth não encontrado.' }

$rawClient = Get-Content -LiteralPath $ClientFile -Raw -Encoding UTF8 | ConvertFrom-Json
$client = if ($null -ne $rawClient.installed) { $rawClient.installed } elseif ($null -ne $rawClient.web) { $rawClient.web } else { $rawClient }
$token = Get-Content -LiteralPath $TokenFile -Raw -Encoding UTF8 | ConvertFrom-Json

$clientId = if ($client.client_id) { [string]$client.client_id } else { [string]$token.client_id }
$clientSecret = if ($client.client_secret) { [string]$client.client_secret } else { [string]$token.client_secret }
$refreshToken = [string]$token.refresh_token
if (!$clientId -or !$clientSecret -or !$refreshToken) {
  throw 'Falta client_id, client_secret ou refresh_token. É necessário autorizar acesso offline pelo OAuth2.'
}

$json = @{client_id=$clientId; client_secret=$clientSecret; refresh_token=$refreshToken} | ConvertTo-Json -Compress
Set-Clipboard -Value $json
$variable = if ($Tipo -eq 'GA4') { 'GA4_OAUTH_JSON' } else { 'GSC_OAUTH_JSON' }
Write-Host "Valor de $variable copiado para a área de transferência."
Write-Host 'Cole no campo de valor em Vercel > Project > Settings > Environment Variables.'
Write-Host 'Depois de cadastrar, substitua o conteúdo da área de transferência por texto não sensível.'
