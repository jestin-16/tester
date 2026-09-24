param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Arguments
)

$scriptPath = Join-Path $PSScriptRoot "chat.js"
node $scriptPath @Arguments
