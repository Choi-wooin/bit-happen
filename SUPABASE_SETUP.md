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

1. `supabase-config.js`에 `url`, `anonKey` 입력
2. 사이트 배포
3. 관리자 페이지에서 카드 저장 시 Supabase에 동기화
