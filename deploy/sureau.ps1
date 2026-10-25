<#
.SYNOPSIS
Pilote une instance Sureau installée avec Docker Compose (Windows).

.DESCRIPTION
Seul Docker Desktop est nécessaire sur la machine : ni Java ni Node.

  deploy\sureau.ps1 init [--port 8080]  crée la configuration et ses secrets
  deploy\sureau.ps1 up                  construit et démarre l'instance
  deploy\sureau.ps1 down                arrête l'instance, données conservées
  deploy\sureau.ps1 status | logs [...] état et journaux
  deploy\sureau.ps1 backup [--output D] sauvegarde complète de la base
  deploy\sureau.ps1 restore FICHIER [--yes]
                                        remplace les données par une sauvegarde
  deploy\sureau.ps1 update              sauvegarde, reconstruit, redémarre
  deploy\sureau.ps1 compose [...]       toute autre commande « docker compose »

Variables d'environnement facultatives pour gérer plusieurs instances :
  SUREAU_ENV_FILE    fichier de configuration (défaut : .env.instance à la racine)
  SUREAU_PROJECT     nom du projet Compose, qui détermine volume et réseaux
  SUREAU_BACKUP_DIR  dossier des sauvegardes (défaut : backups à la racine)

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
$BackupDir = if ($env:SUREAU_BACKUP_DIR) { $env:SUREAU_BACKUP_DIR } else { Join-Path $Root 'backups' }
$Project = if ($env:SUREAU_PROJECT) { $env:SUREAU_PROJECT } else { 'sureau-instance' }

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

# Réserve un fichier au compte courant (équivalent de chmod 600).
function Set-OwnerOnly([string]$Path) {
    $ErrorActionPreference = 'Continue'
    $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    & icacls $Path /inheritance:r /grant:r "${identity}:(F)" | Out-Null
}

# Les appels aux programmes natifs passent par ces fonctions : une sortie
# d'erreur de Docker ne doit pas interrompre le script, c'est le code de
# sortie qui décide. Le résultat de la commande reste dans $LASTEXITCODE.
function Invoke-ComposeRaw {
    $ErrorActionPreference = 'Continue'
    $arguments = @('compose', '-f', $ComposeFile)
    if ($env:SUREAU_PROJECT) { $arguments += @('-p', $env:SUREAU_PROJECT) }
    $arguments += @('--env-file', $EnvFile)
    & docker @arguments @args
}

function Invoke-Compose {
    Invoke-ComposeRaw @args
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

# Exécute une commande shell dans le conteneur de la base, sans entrée
# standard (docker exec sans -i). Les guillemets simples restent dans la
# chaîne : Windows PowerShell 5.1 altère les guillemets doubles.
function Invoke-InDb([string]$Container, [string]$Script) {
    $ErrorActionPreference = 'Continue'
    & docker exec $Container sh -c $Script
}

function Copy-Native([string]$From, [string]$To) {
    $ErrorActionPreference = 'Continue'
    & docker cp $From $To | Out-Null
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

function Get-DatabaseContainer {
    $id = (Invoke-ComposeRaw ps -q --status running postgres | Out-String).Trim()
    if (-not $id) {
        Fail "La base de données n'est pas démarrée. Lancez d'abord : deploy\sureau.cmd up"
    }
    $id
}

# Écrit une sauvegarde complète et vérifiée dans $Directory, avec le préfixe
# $Prefix, et renvoie son chemin et sa taille.
function New-Backup([string]$Directory, [string]$Prefix) {
    $container = Get-DatabaseContainer
    New-Item -ItemType Directory -Force -Path $Directory | Out-Null
    $stamp = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss')
    $file = Join-Path $Directory "$Prefix-$stamp.dump"

    # Le contenu des sessions est exclu : une sauvegarde ne doit jamais
    # permettre de réutiliser une connexion ouverte.
    $dump = 'pg_dump --username=sureau --dbname=sureau --format=custom --no-owner --no-privileges ' +
        '--exclude-table-data=spring_session --exclude-table-data=spring_session_attributes ' +
        '--file=/tmp/sureau.dump && pg_restore --list /tmp/sureau.dump > /dev/null'
    Invoke-InDb $container $dump | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail 'La sauvegarde de la base a échoué.' }

    # docker cp transfère le fichier tel quel, sans réencodage : pas de
    # redirection de sortie binaire par PowerShell.
    Copy-Native "${container}:/tmp/sureau.dump" $file
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $file)) {
        Fail 'La copie de la sauvegarde a échoué.'
    }
    $expected = (Invoke-InDb $container 'wc -c < /tmp/sureau.dump' | Out-String).Trim()
    $size = (Get-Item -LiteralPath $file).Length
    Invoke-InDb $container 'rm -f /tmp/sureau.dump' | Out-Null
    if ([string]$size -ne $expected) {
        Remove-Item -LiteralPath $file -Force
        Fail "La sauvegarde copiée est incomplète ($size sur $expected octets) ; elle a été supprimée."
    }
    Set-OwnerOnly $file
    [pscustomobject]@{ Path = $file; Size = $size }
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
    Set-OwnerOnly $EnvFile

    Write-Output "Configuration créée : $EnvFile"
    Write-Output "Conservez ce fichier et sauvegardez-le avec vos données : il contient les secrets de l'instance."
    Write-Output ''
    Write-Output "Clé d'installation du premier administrateur (à saisir une seule fois dans l'interface) :"
    Write-Output "  $setupToken"
    Write-Output ''
    Write-Output "Étape suivante : deploy\sureau.cmd up"
}

function Invoke-Backup {
    $directory = $BackupDir
    for ($i = 0; $i -lt $Rest.Count; $i++) {
        if ($Rest[$i] -eq '--output') {
            if ($i + 1 -ge $Rest.Count) { Fail '--output attend un dossier.' }
            $directory = $Rest[++$i]
        } else {
            Fail "Option inconnue : $($Rest[$i])"
        }
    }
    Assert-Instance
    $backup = New-Backup $directory $Project
    Write-Output "Sauvegarde créée : $($backup.Path) ($($backup.Size) octets)"
    Write-Output "Elle contient tous les comptes, l'inventaire et les plans de l'instance : rangez-la hors de cette machine et protégez-la."
    Write-Output "Elle ne contient pas $EnvFile : conservez-le séparément."
}

function Invoke-Restore {
    $file = $null
    $assumeYes = $false
    foreach ($argument in $Rest) {
        if ($argument -eq '--yes') { $assumeYes = $true }
        elseif ($argument.StartsWith('-')) { Fail "Option inconnue : $argument" }
        elseif ($file) { Fail 'Un seul fichier de sauvegarde est attendu.' }
        else { $file = $argument }
    }
    if (-not $file) { Fail 'Indiquez le fichier de sauvegarde à restaurer.' }
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { Fail "$file est introuvable." }
    $file = (Resolve-Path -LiteralPath $file).Path
    Assert-Instance
    $container = Get-DatabaseContainer

    # Rien n'est modifié tant que l'archive n'a pas été lue et reconnue.
    Copy-Native $file "${container}:/tmp/restore.dump"
    if ($LASTEXITCODE -ne 0) { Fail "Impossible de transmettre $file à la base." }
    $contents = (Invoke-InDb $container 'pg_restore --list /tmp/restore.dump 2>/dev/null' | Out-String)
    if ($LASTEXITCODE -ne 0 -or $contents -notmatch 'flyway_schema_history') {
        Invoke-InDb $container 'rm -f /tmp/restore.dump' | Out-Null
        Fail "$file n'est pas une sauvegarde Sureau lisible."
    }

    if (-not $assumeYes) {
        Write-Output "Toutes les données de l'instance « $Project » (comptes, inventaire, plans)"
        Write-Output "seront remplacées par le contenu de $file."
        Write-Output 'Une sauvegarde de sécurité de l''état actuel est créée avant.'
        $answer = Read-Host 'Tapez « restaurer » pour continuer'
        if ($answer -ne 'restaurer') {
            Invoke-InDb $container 'rm -f /tmp/restore.dump' | Out-Null
            Fail "Restauration annulée, rien n'a été modifié."
        }
    }

    $safety = New-Backup $BackupDir "$Project-avant-restauration"
    Write-Output "Sauvegarde de sécurité : $($safety.Path)"

    # L'application est arrêtée pour qu'aucune connexion n'écrive pendant le
    # remplacement. Les sessions de la sauvegarde sont purgées : tout le monde
    # doit se reconnecter.
    Invoke-Compose stop app
    $restored = $true
    Invoke-InDb $container "psql --quiet --username=sureau --dbname=sureau -v ON_ERROR_STOP=1 -c 'SET client_min_messages TO warning; DROP SCHEMA public CASCADE; CREATE SCHEMA public;'"
    if ($LASTEXITCODE -ne 0) { $restored = $false }
    if ($restored) {
        Invoke-InDb $container 'pg_restore --username=sureau --dbname=sureau --no-owner --no-privileges --single-transaction --exit-on-error /tmp/restore.dump'
        if ($LASTEXITCODE -ne 0) { $restored = $false }
    }
    if ($restored) {
        Invoke-InDb $container "psql --quiet --username=sureau --dbname=sureau -v ON_ERROR_STOP=1 -c 'TRUNCATE spring_session, spring_session_attributes'"
        if ($LASTEXITCODE -ne 0) { $restored = $false }
    }
    if (-not $restored) {
        Fail "La restauration a échoué ; la base peut être vide. Pour revenir à l'état précédent : deploy\sureau.cmd restore $($safety.Path) --yes"
    }
    Invoke-InDb $container 'rm -f /tmp/restore.dump' | Out-Null

    Invoke-ComposeRaw up -d --wait --wait-timeout 300
    if ($LASTEXITCODE -ne 0) {
        Fail "L'application ne démarre pas après la restauration. Si la sauvegarde vient d'une version plus récente de Sureau, revenez d'abord à cette version. État précédent : deploy\sureau.cmd restore $($safety.Path) --yes"
    }
    Write-Output ''
    Write-Output 'Restauration terminée. Toutes les sessions ont été fermées : reconnectez-vous.'
    Write-Output "État précédent conservé dans $($safety.Path)"
}

# Démarre ou met à jour l'application. L'image est construite à partir des
# sources, sauf si SUREAU_IMAGE désigne une image publiée : elle est alors
# téléchargée, ce qui évite d'avoir les sources sur la machine. Le résultat
# se lit dans $LASTEXITCODE.
function Start-App {
    $image = if ($env:SUREAU_IMAGE) { $env:SUREAU_IMAGE } else { Get-EnvValue 'SUREAU_IMAGE' }
    if ($image -and $image -ne 'sureau:local') {
        Invoke-ComposeRaw pull app
        if ($LASTEXITCODE -ne 0) { return }
        Invoke-ComposeRaw up -d --wait --wait-timeout 300
    } else {
        Invoke-ComposeRaw up -d --build --wait --wait-timeout 300
    }
}

function Invoke-Update {
    Assert-Instance
    $backup = New-Backup $BackupDir "$Project-avant-mise-a-jour"
    Write-Output "Sauvegarde avant mise à jour : $($backup.Path)"
    Start-App
    if ($LASTEXITCODE -ne 0) {
        Fail "La mise à jour a échoué. Revenez à la version précédente (sources ou SUREAU_IMAGE) puis restaurez : deploy\sureau.cmd restore $($backup.Path) --yes"
    }
    Write-Output ''
    Write-Output 'Mise à jour terminée.'
}

switch ($Command) {
    'init' { Invoke-Init }
    'up' {
        Assert-Instance
        Start-App
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        $bind = Get-EnvValue 'SUREAU_HTTP_BIND'
        if (-not $bind) { $bind = '127.0.0.1' }
        Write-Output ''
        Write-Output "Sureau est démarré : http://${bind}:$(Get-EnvValue 'SUREAU_HTTP_PORT')"
    }
    'down' { Assert-Instance; Invoke-Compose down }
    'status' { Assert-Instance; Invoke-Compose ps }
    'logs' { Assert-Instance; Invoke-Compose logs @Rest }
    'backup' { Invoke-Backup }
    'restore' { Invoke-Restore }
    'update' { Invoke-Update }
    'compose' { Assert-Instance; Invoke-Compose @Rest }
    { $_ -in @('help', '-h', '--help') } { Get-Help $MyInvocation.MyCommand.Path -Full }
    default {
        if ($Command) { [Console]::Error.WriteLine("Commande inconnue : $Command") }
        Get-Help $MyInvocation.MyCommand.Path
        exit 2
    }
}
