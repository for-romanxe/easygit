#!/usr/bin/env bash
# 같은 와이파이의 팀원이 쉬운깃에 접속하도록 주소를 안내한다. (WSL2 전용 안내)
set -euo pipefail
PORT=8088

WSL_IP=$(hostname -I | awk '{print $1}')
WIN_IP=$(powershell.exe -NoProfile -Command \
  "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { \$_.PrefixOrigin -eq 'Dhcp' -and \$_.IPAddress -notlike '169.*' } | Select-Object -First 1 -ExpandProperty IPAddress)" \
  2>/dev/null | tr -d '\r\n ' || true)

echo "쉬운깃 팀 공유 안내"
echo "-------------------------------------------"
echo "WSL 내부 IP   : ${WSL_IP:-알수없음}   (팀원은 이 주소로는 접속 못 함)"
echo "Windows LAN IP: ${WIN_IP:-자동감지 실패}"
echo
if [ -n "${WIN_IP:-}" ]; then
  echo "▶ 팀원 접속 주소:   http://${WIN_IP}:${PORT}"
else
  echo "▶ Windows에서 'ipconfig' 실행 → Wi-Fi 의 IPv4 주소:${PORT} 로 접속"
fi
echo
echo "처음 한 번(그리고 WSL 재시작 후)에는 Windows '관리자 PowerShell'에서:"
echo "   powershell -ExecutionPolicy Bypass -File \\\\wsl.localhost\\Ubuntu\\home\\for_romanxe\\easygit\\windows-share.ps1"
echo "-------------------------------------------"
