# 쉬운깃 팀 공유 설정 (WSL2 -> 같은 와이파이 팀원에게 열기)
#
# [사용법] Windows에서 "관리자 권한" PowerShell 을 열고 실행:
#     powershell -ExecutionPolicy Bypass -File \\wsl.localhost\Ubuntu\home\for_romanxe\easygit\windows-share.ps1
#
# WSL 을 재시작하면 WSL 내부 IP 가 바뀌므로, 그때는 이 스크립트를 다시 한 번 실행하세요.

$port = 8088

# 관리자 권한 확인
$admin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
         ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
    Write-Host "[!] 관리자 권한이 필요합니다. PowerShell 을 '관리자로 실행'한 뒤 다시 시도하세요." -ForegroundColor Red
    exit 1
}

# 현재 WSL 내부 IP 자동 감지
$wslIp = (wsl hostname -I).Trim().Split(" ")[0]
if (-not $wslIp) { Write-Host "[!] WSL IP 를 찾지 못했습니다. WSL 이 실행 중인지 확인하세요." -ForegroundColor Red; exit 1 }
Write-Host "WSL 내부 IP : $wslIp"

# 포트 포워딩 (Windows:8088 -> WSL:8088) 재설정
netsh interface portproxy delete v4tov4 listenport=$port listenaddress=0.0.0.0 2>$null | Out-Null
netsh interface portproxy add    v4tov4 listenport=$port listenaddress=0.0.0.0 connectport=$port connectaddress=$wslIp | Out-Null

# 방화벽 인바운드 허용
netsh advfirewall firewall delete rule name="EasyGit $port" 2>$null | Out-Null
netsh advfirewall firewall add rule name="EasyGit $port" dir=in action=allow protocol=TCP localport=$port | Out-Null

# 팀원 접속 주소 안내 (같은 와이파이의 LAN IP)
$lan = (Get-NetIPAddress -AddressFamily IPv4 |
        Where-Object { $_.PrefixOrigin -eq 'Dhcp' -and $_.IPAddress -notlike '169.*' } |
        Select-Object -First 1 -ExpandProperty IPAddress)

Write-Host ""
Write-Host "===============================================" -ForegroundColor Green
Write-Host " 설정 완료! 팀원들은 같은 와이파이에서 접속하세요:" -ForegroundColor Green
if ($lan) { Write-Host "     http://$lan`:$port" -ForegroundColor Cyan }
else      { Write-Host "     (LAN IP 자동감지 실패 — 'ipconfig' 의 Wi-Fi IPv4 주소:$port 로 접속)" -ForegroundColor Yellow }
Write-Host "===============================================" -ForegroundColor Green
Write-Host ""
Write-Host "현재 포워딩 상태:"
netsh interface portproxy show all
