# 미디어 서버 HTTPS 4443 포트 SSL 진단 및 해결 가이드

**서버**: `media.bithappen.kr` (IP: `211.238.8.74`), Kestrel 기반  
**작성일**: 2026-04-20

---

## 현재 증상

- 포트 4443에 TCP 연결은 되지만 **TLS 핸드셰이크에서 실패**
- 클라이언트에서 `https://media.bithappen.kr:4443/upload/images` 호출 시 업로드 실패
- 포트 80(HTTP)에서는 `/upload` → 405, `/upload/images` → 404

---

## 1단계: 서버 접속 후 현재 상태 확인

서버에 RDP 또는 SSH로 접속한 뒤:

```powershell
# 4443 포트를 점유하고 있는 프로세스 확인
netstat -ano | findstr :4443

# 해당 PID의 프로세스 이름 확인
tasklist /FI "PID eq <위에서_나온_PID>"
```

---

## 2단계: Kestrel 설정 파일 확인

Kestrel 서버의 HTTPS 설정은 보통 `appsettings.json` 또는 `Program.cs`에 있습니다.

```powershell
# 미디어 서버 프로젝트 폴더에서 설정 파일 찾기
Get-ChildItem -Recurse -Filter "appsettings*.json" | Select-String -Pattern "4443|Certificate|Https"
Get-ChildItem -Recurse -Filter "*.cs" | Select-String -Pattern "4443|UseHttps|ListenAnyIP"
```

정상적인 Kestrel HTTPS 설정 예시 (`appsettings.json`):

```json
{
  "Kestrel": {
    "Endpoints": {
      "Https": {
        "Url": "https://0.0.0.0:4443",
        "Certificate": {
          "Path": "C:\\certs\\media.bithappen.kr.pfx",
          "Password": "인증서비밀번호"
        }
      }
    }
  }
}
```

또는 `Program.cs`에서:

```csharp
builder.WebHost.ConfigureKestrel(options =>
{
    options.ListenAnyIP(4443, listenOptions =>
    {
        listenOptions.UseHttps("C:\\certs\\media.bithappen.kr.pfx", "비밀번호");
    });
});
```

**확인 포인트:**
- `Certificate.Path` 경로에 실제 `.pfx` 파일이 존재하는지
- 비밀번호가 맞는지
- 인증서가 만료되지 않았는지

---

## 3단계: 인증서 파일 유효성 검증

```powershell
# PFX 인증서 정보 확인 (비밀번호 입력 필요)
$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2(
    "C:\certs\media.bithappen.kr.pfx", "비밀번호"
)
$cert | Format-List Subject, Issuer, NotBefore, NotAfter, HasPrivateKey, DnsNameList
```

**확인 포인트:**

| 항목 | 정상 값 |
|---|---|
| `Subject` | `CN=media.bithappen.kr` 또는 와일드카드 `*.bithappen.kr` 포함 |
| `NotAfter` | 현재 날짜(2026-04-20) 이후여야 함 |
| `HasPrivateKey` | `True` (반드시!) |
| `DnsNameList` | `media.bithappen.kr` 포함 |

---

## 4단계: 인증서가 없거나 만료된 경우 → 새로 발급

### 방법 A: Let's Encrypt (무료, 권장)

```powershell
# win-acme 도구 다운로드 (Windows용 Let's Encrypt 클라이언트)
# https://www.win-acme.com/ 에서 다운로드

# 실행
wacs.exe

# 또는 커맨드라인으로 직접 발급
wacs.exe --target manual --host media.bithappen.kr --store pfxfile --pfxfilepath "C:\certs\media.bithappen.kr.pfx" --pfxpassword "원하는비밀번호"
```

> DNS가 `media.bithappen.kr → 211.238.8.74`로 정상 연결되어 있어야 합니다.

### 방법 B: 자체서명 인증서 (테스트용)

```powershell
# 자체서명 인증서 생성
$cert = New-SelfSignedCertificate `
    -DnsName "media.bithappen.kr" `
    -CertStoreLocation "Cert:\LocalMachine\My" `
    -NotAfter (Get-Date).AddYears(2)

# PFX로 내보내기
$pwd = ConvertTo-SecureString -String "원하는비밀번호" -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath "C:\certs\media.bithappen.kr.pfx" -Password $pwd
```

---

## 5단계: Kestrel 설정에 인증서 경로 반영

`appsettings.json`에서 인증서 경로와 비밀번호를 업데이트:

```json
{
  "Kestrel": {
    "Endpoints": {
      "Https": {
        "Url": "https://0.0.0.0:4443",
        "Certificate": {
          "Path": "C:\\certs\\media.bithappen.kr.pfx",
          "Password": "설정한비밀번호"
        }
      }
    }
  }
}
```

---

## 6단계: 라우팅 확인 (`/upload/images`, `/upload/videos`)

현재 80포트에서 `/upload`만 존재하고 `/upload/images`는 404입니다. 서버 코드에서 라우팅을 확인하세요:

```powershell
# 컨트롤러 또는 엔드포인트 매핑 찾기
Get-ChildItem -Recurse -Include "*.cs" | Select-String -Pattern 'upload|Upload' | Select-String -Pattern 'Route|Map|HttpPost'
```

필요한 엔드포인트:

```csharp
app.MapPost("/upload/images", async (IFormFile file) => { /* 이미지 업로드 처리 */ });
app.MapPost("/upload/videos", async (IFormFile file) => { /* 동영상 업로드 처리 */ });
```

현재 `/upload` 하나만 있다면 서브 경로를 추가해야 합니다.

---

## 7단계: 서비스 재시작 및 테스트

```powershell
# Kestrel 서비스 재시작 (서비스 이름에 따라 다름)
Restart-Service "MediaServerService"
# 또는 프로세스를 직접 재시작

# TLS 핸드셰이크 테스트
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Invoke-WebRequest -Uri "https://media.bithappen.kr:4443/" -Method GET -TimeoutSec 5

# 업로드 테스트
$form = @{ file = Get-Item "C:\test.jpg" }
Invoke-RestMethod -Uri "https://media.bithappen.kr:4443/upload/images" -Method POST -Form $form
```

---

## 체크리스트

| 순서 | 확인 항목 | 상태 |
|---|---|---|
| 1 | 4443 포트에 Kestrel이 리스닝 중인지 | ☐ |
| 2 | appsettings.json에 인증서 경로/비밀번호 설정 | ☐ |
| 3 | .pfx 파일이 실제 존재하는지 | ☐ |
| 4 | 인증서 만료 안 됐는지 (`NotAfter` > 현재 날짜) | ☐ |
| 5 | `HasPrivateKey = True`인지 | ☐ |
| 6 | `/upload/images`, `/upload/videos` 라우팅 존재하는지 | ☐ |
| 7 | 서비스 재시작 후 HTTPS 응답 확인 | ☐ |
