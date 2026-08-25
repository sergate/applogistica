# Descarga e instala la ultima version LTS de Node.js para Windows x64, si
# no esta ya instalado. Lo llama instalar-agente.bat -- no hace falta
# correrlo a mano.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

try {
    node -v | Out-Null
    Write-Host "[OK] Node.js ya esta instalado."
    exit 0
} catch {
    # node no esta en el PATH -- seguimos con la instalacion.
}

try {
    Write-Host "Buscando la ultima version LTS de Node.js..."
    $index = Invoke-RestMethod -Uri "https://nodejs.org/dist/index.json"
    $lts = $index | Where-Object { $_.lts -ne $false } | Select-Object -First 1
    $version = $lts.version
    $url = "https://nodejs.org/dist/$version/node-$version-x64.msi"
    $destino = Join-Path $env:TEMP "node-installer.msi"

    Write-Host "Bajando Node.js $version..."
    Invoke-WebRequest -Uri $url -OutFile $destino

    Write-Host "Instalando Node.js (puede pedir permisos de administrador)..."
    # Se pasa $destino como elemento propio del array (sin comillas manuales
    # alrededor) -- Start-Process ya se encarga de citarlo si hace falta, y
    # entrecomillarlo a mano acá termina duplicando las comillas.
    $proceso = Start-Process msiexec.exe -ArgumentList "/i", $destino, "/qn", "/norestart" -Wait -PassThru
    Remove-Item $destino -ErrorAction SilentlyContinue

    if ($proceso.ExitCode -ne 0) {
        Write-Host "La instalacion de Node.js termino con codigo de salida $($proceso.ExitCode)."
        exit 1
    }

    Write-Host "[OK] Node.js instalado correctamente."
    exit 0
} catch {
    Write-Host "ERROR instalando Node.js: $($_.Exception.Message)"
    exit 1
}
