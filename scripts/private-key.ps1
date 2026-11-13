param([ValidateSet('save','load')][string]$Action)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$path = Join-Path $PSScriptRoot '..\.local\private-vault.key'
if ($Action -eq 'save') {
    if (Test-Path -LiteralPath $path) { throw 'Private key already exists.' }
    $password = [Console]::In.ReadToEnd()
    if (-not $password) { throw 'Password is required.' }
    $secret = [Text.Encoding]::UTF8.GetBytes($password)
    $encrypted = [Security.Cryptography.ProtectedData]::Protect($secret, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    [IO.Directory]::CreateDirectory((Split-Path $path)) | Out-Null
    [IO.File]::WriteAllBytes($path, $encrypted)
    [Array]::Clear($secret, 0, $secret.Length)
} else {
    $secret = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($path), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    try { [Console]::Out.Write([Text.Encoding]::UTF8.GetString($secret)) }
    finally { [Array]::Clear($secret, 0, $secret.Length) }
}
