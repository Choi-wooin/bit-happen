# Supabase Setup

아래 SQL을 Supabase SQL Editor에서 실행하세요.

```sql
create table if not exists public.site_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.site_state enable row level security;

drop policy if exists "public read site_state" on public.site_state;
create policy "public read site_state"
on public.site_state
for select
to anon
using (true);

drop policy if exists "public write site_state" on public.site_state;
create policy "public write site_state"
on public.site_state
for all
to anon
using (true)
with check (true);
```

주의: 운영 환경에서는 `anon` 쓰기 권한을 열어두지 말고, 관리자 인증 또는 Edge Function으로 쓰기를 제한하세요.

## 프로젝트 파일 설정

1. `assets/js/supabase-config.js`에 `url`, `anonKey` 입력
2. `cardsStateKey`, `mediaStateKey`, `adminStateKey`는 기본값 사용 가능
3. 사이트 배포
4. `pages/login.html`로 로그인 후 관리자에서 데이터 저장

## 현재 폴더 구조

- 메인 페이지: `index.html`
- 관리자 로그인: `pages/login.html`
- 관리자 콘솔: `pages/admin.html`
- 카드 관리자: `pages/manager.html`
- 미디어 관리자: `pages/media-manager.html`
- JS 공통 자산: `assets/js/*`
- CSS 공통 자산: `assets/css/*`

## site_state 키 매핑

- `cards`: 카드 우선순위/크기/표시여부 등 카드 상태
- `mediaLibrary`: 상세 페이지 미디어 라이브러리 상태
- `adminUsers`: 관리자 계정 상태

## 관리자 계정 초기값

- 첫 로그인 시 `adminUsers` 상태키가 비어 있으면 아래 계정이 자동 생성됩니다.
- id: `admin`
- password: `iloveyou12#$`
- role: `super_admin`

## 빠른 점검

1. `pages/login.html` 로그인 성공
2. `pages/admin.html` 좌측 메뉴 표시
3. 카드/미디어 저장 후 다른 브라우저에서도 동일 표시
