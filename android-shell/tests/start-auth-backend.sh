#!/usr/bin/env bash
set -euo pipefail

backend="$RUNNER_TEMP/fitnessdex-auth-backend"
mkdir -p "$backend"
cd "$backend"
supabase init
sed -i 's|^additional_redirect_urls = .*|additional_redirect_urls = ["io.github.gy8s.fitnessdex://auth/callback"]|' supabase/config.toml
sed -i '0,/^enable_confirmations = false/s//enable_confirmations = true/' supabase/config.toml
supabase start -x studio,imgproxy,storage-api,realtime,edge-runtime,logflare,vector,postgres-meta,supavisor
status="$(supabase status -o json)"
printf '%s' "$status" | node -e '
  const fs = require("node:fs");
  const status = JSON.parse(fs.readFileSync(0, "utf8"));
  const publishable = status.PUBLISHABLE_KEY || status.ANON_KEY;
  if (!publishable || !status.SERVICE_ROLE_KEY || !status.DB_URL) throw Error("Isolated backend credentials missing");
  console.log("::add-mask::" + status.SERVICE_ROLE_KEY);
  fs.appendFileSync(process.env.GITHUB_ENV, "FITNESSDEX_TEST_SUPABASE_KEY=" + publishable + "\n");
  fs.appendFileSync(process.env.GITHUB_ENV, "FITNESSDEX_TEST_SERVICE_KEY=" + status.SERVICE_ROLE_KEY + "\n");
  fs.appendFileSync(process.env.GITHUB_ENV, "FITNESSDEX_TEST_DATABASE_URL=" + status.DB_URL + "\n");
'

db="$(printf '%s' "$status" | node -pe 'JSON.parse(require("node:fs").readFileSync(0,"utf8")).DB_URL')"
psql "$db" -v ON_ERROR_STOP=1 <<'SQL'
create table public.fitnessdex_saves (
  user_id uuid primary key references auth.users(id),
  save_data jsonb not null,
  updated_at timestamptz not null
);
revoke all on public.fitnessdex_saves from anon, authenticated;
grant select, insert, update on public.fitnessdex_saves to authenticated;
alter table public.fitnessdex_saves enable row level security;
create policy own_save_select on public.fitnessdex_saves for select to authenticated
  using ((select auth.uid()) = user_id);
create policy own_save_insert on public.fitnessdex_saves for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy own_save_update on public.fitnessdex_saves for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
notify pgrst, 'reload schema';
SQL
