# 毎朝 4:30 (JST) に収集を走らせる Windows タスクを登録する。
# 5:00 までに記事が出来上がっているよう、30 分の余裕を取っている。
#
#   powershell -ExecutionPolicy Bypass -File scripts\register-task.ps1
#
# 解除:  Unregister-ScheduledTask -TaskName "AI Daily Brief" -Confirm:$false

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node).Source
$taskName = 'AI Daily Brief'

$action = New-ScheduledTaskAction `
    -Execute $node `
    -Argument 'src\collect.mjs' `
    -WorkingDirectory $projectRoot

$trigger = New-ScheduledTaskTrigger -Daily -At 4:30AM

$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -DontStopIfGoingOnBatteries `
    -AllowStartIfOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 20)

try { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false } catch {}

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description 'AI 最新情報を収集し、裏取りのうえ記事を生成する（毎朝 4:30）' | Out-Null

Write-Host "登録しました: '$taskName' (毎日 4:30)"
Write-Host "作業ディレクトリ: $projectRoot"
Write-Host ""
Write-Host "今すぐ試す:  Start-ScheduledTask -TaskName '$taskName'"
Write-Host "状態を見る:  Get-ScheduledTaskInfo -TaskName '$taskName'"
