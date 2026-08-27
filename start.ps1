#Requires -Version 5.0
<#
  start.ps1 — inicia o servidor HTTP local do GTD Executivo (André Delamata).
  100% local: apenas serve os arquivos deste diretório em http://localhost:8080.
  Nenhum dado é enviado para a internet.
#>

$Host.UI.RawUI.WindowTitle = 'GTD Executivo - André Delamata'

Write-Host '============================================================'
Write-Host '  GTD Executivo - André Delamata'
Write-Host '  Iniciando servidor local em http://localhost:8080'
Write-Host '  (100% local — nenhum dado sai deste computador)'
Write-Host '============================================================'
Write-Host ''

Set-Location -Path $PSScriptRoot

$pythonCmd = $null
foreach ($candidate in @('python', 'python3', 'py')) {
    if (Get-Command $candidate -ErrorAction SilentlyContinue) {
        $pythonCmd = $candidate
        break
    }
}

if (-not $pythonCmd) {
    Write-Host '[ERRO] Python não foi encontrado no PATH deste computador.' -ForegroundColor Red
    Write-Host 'Peça ao time de TI para instalar o Python 3 (necessário apenas para' -ForegroundColor Yellow
    Write-Host 'servir os arquivos locais — a aplicação em si não depende de internet).' -ForegroundColor Yellow
    Read-Host 'Pressione Enter para sair'
    exit 1
}

Write-Host 'Pressione Ctrl+C nesta janela para encerrar o servidor.'
Write-Host 'Abra o navegador em http://localhost:8080 quando o servidor iniciar.'
Write-Host ''

& $pythonCmd -m http.server 8080
