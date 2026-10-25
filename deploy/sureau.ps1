<#
.SYNOPSIS
Pilote une instance Sureau installée avec Docker Compose (Windows).

.DESCRIPTION
Seul Docker Desktop est nécessaire sur la machine : ni Java ni Node.

  deploy\sureau.ps1 init [--port 8080]  crée la configuration et ses secrets
  deploy\sureau.ps1 up                  construit et démarre l'instance
  deploy\sureau.ps1 down                arrête l'instance, données conservées
  deploy\sureau.ps1 status | logs [...] état et journaux
  deploy\sureau.ps1 compose [...]       toute autre commande « docker compose »

Variables d'environnement facultatives pour gérer plusieurs instances :
  SUREAU_ENV_FILE  fichier de configuration (défaut : .env.instance à la racine)
  SUREAU_PROJECT   nom du projet Compose, qui détermine volume et réseaux

Si l'exécution de scripts est bloquée, utilisez deploy\sureau.cmd, qui lance
ce script sans modifier la politique d'exécution de la machine.
#>
# Pas de bloc param : PowerShell interpréterait des options de Docker Compose
# comme -v ou -d comme ses propres paramètres communs (-Verbose, -Debug).
$Command = if ($args.Count -gt 0) { [string]$args[0] } else { '' }
$Rest = @(if ($args.Count -gt 1) { $args[1..($args.Count - 1)] })

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Split-Path -Parent $ScriptDir
$ComposeFile = Join-Path $Root 'docker-compose.install.yml'
$Template = Join-Path $ScriptDir 'instance.env.example'
$EnvFile = if ($env:SUREAU_ENV_FILE) { $env:SUREAU_ENV_FILE } else { Join-Path $Root '.env.instance' }

function Fail([string]$Message) {
    [Console]::Error.WriteLine("Erreur : $Message")
    exit 1
}

function New-RandomHex([int]$Bytes) {
    $buffer = New-Object byte[] $Bytes
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($buffer) } finally { $generator.Dispose() }
    -join ($buffer | ForEach-Object { $_.ToString('x2') })
}

function Get-EnvValue([string]$Name) {
    $line = Get-Content -LiteralPath $EnvFile | Where-Object { $_ -match "^$Name=" } | Select-Object -Last 1
    if ($line) { $line.Substring($Name.Length + 1).Trim() } else { '' }
}

function Invoke-Compose {
    $arguments = @('compose', '-f', $ComposeFile)
    if ($env:SUREAU_PROJECT) { $arguments += @('-p', $env:SUREAU_PROJECT) }
    $arguments += @('--env-file', $EnvFile)
    & docker @arguments @args
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

function Assert-Instance {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Fail "Docker n'est pas installé ou n'est pas dans le PATH."
    }
    & docker compose version *> $null
    if ($LASTEXITCODE -ne 0) { Fail 'Docker Compose v2 est requis.' }
    if (-not (Test-Path -LiteralPath $EnvFile)) {
        Fail "$EnvFile est introuvable. Lancez d'abord : deploy\sureau.cmd init"
    }
}

function Invoke-Init {
    $Port = '8080'
    for ($i = 0; $i -lt $Rest.Count; $i++) {
        if ($Rest[$i] -eq '--port') {
            if ($i + 1 -ge $Rest.Count) { Fail '--port attend un numéro de port.' }
            $Port = $Rest[++$i]
        } else {
            Fail "Option inconnue : $($Rest[$i])"
        }
    }
    if ($Port -notmatch '^[0-9]+$') { Fail 'Le port doit être un nombre.' }
    if ([int]$Port -lt 1 -or [int]$Port -gt 65535) { Fail 'Le port doit être compris entre 1 et 65535.' }
    if (Test-Path -LiteralPath $EnvFile) {
        Write-Output "$EnvFile existe déjà : rien n'a été modifié."
        return
    }

    $dbPassword = New-RandomHex 32
    $setupToken = New-RandomHex 24
    $content = (Get-Content -LiteralPath $Template -Encoding UTF8) | ForEach-Object {
        if ($_ -match '^SUREAU_DB_PASSWORD=') { "SUREAU_DB_PASSWORD=$dbPassword" }
        elseif ($_ -match '^SUREAU_SETUP_TOKEN=') { "SUREAU_SETUP_TOKEN=$setupToken" }
        elseif ($_ -match '^SUREAU_HTTP_PORT=') { "SUREAU_HTTP_PORT=$Port" }
        else { $_ }
    }

    # Création exclusive (CreateNew) : un fichier existant n'est jamais écrasé.
    # UTF-8 sans BOM, que Docker Compose lit correctement.
    try {
        $stream = [System.IO.File]::Open($EnvFile, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write)
        try {
            $writer = New-Object System.IO.StreamWriter($stream, (New-Object System.Text.UTF8Encoding($false)))
            $writer.Write(($content -join "`n") + "`n")
            $writer.Flush()
        } finally { $stream.Dispose() }
    } catch {
        Fail "Impossible de créer $EnvFile."
    }

    # Réserve la lecture au compte courant (équivalent de chmod 600).
    $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    & icacls $EnvFile /inheritance:r /grant:r "${identity}:(F)" *> $null

    Write-Output "Configuration créée : $EnvFile"
    Write-Output "Conservez ce fichier et sauvegardez-le avec vos données : il contient les secrets de l'instance."
    Write-Output ''
    Write-Output "Clé d'installation du premier administrateur (à saisir une seule fois dans l'interface) :"
    Write-Output "  $setupToken"
    Write-Output ''
    Write-Output "Étape suivante : deploy\sureau.cmd up"
}

switch ($Command) {
    'init' { Invoke-Init }
    'up' {
        Assert-Instance
        Invoke-Compose up -d --build --wait --wait-timeout 300
        $bind = Get-EnvValue 'SUREAU_HTTP_BIND'
        if (-not $bind) { $bind = '127.0.0.1' }
        Write-Output ''
        Write-Output "Sureau est démarré : http://${bind}:$(Get-EnvValue 'SUREAU_HTTP_PORT')"
    }
    'down' { Assert-Instance; Invoke-Compose down }
    'status' { Assert-Instance; Invoke-Compose ps }
    'logs' { Assert-Instance; Invoke-Compose logs @Rest }
    'compose' { Assert-Instance; Invoke-Compose @Rest }
    { $_ -in @('help', '-h', '--help') } { Get-Help $MyInvocation.MyCommand.Path -Full }
    default {
        if ($Command) { [Console]::Error.WriteLine("Commande inconnue : $Command") }
        Get-Help $MyInvocation.MyCommand.Path
        exit 2
    }
}
