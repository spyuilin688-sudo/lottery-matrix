begin;

create table public.matrix_custom_status_results (
  member_id uuid not null references public.members (id) on delete cascade,
  lottery text not null check (
    lottery = any (array['今彩539'::text, '天天樂'::text, '六合彩'::text, '大樂透'::text])
  ),
  analysis_version text not null,
  draw_period text not null,
  config_key text not null,
  standard_payload jsonb not null,
  composite_payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (member_id, lottery),
  constraint matrix_custom_status_results_standard_payload_check check (
    jsonb_typeof(standard_payload) = 'object'
    and standard_payload ->> 'lottery' = lottery
    and standard_payload ->> 'drawPeriod' = draw_period
  ),
  constraint matrix_custom_status_results_composite_payload_check check (
    jsonb_typeof(composite_payload) = 'object'
    and composite_payload ->> 'lottery' = lottery
    and composite_payload ->> 'drawPeriod' = draw_period
  )
);

alter table public.matrix_custom_status_results enable row level security;

revoke all on table public.matrix_custom_status_results
  from public, anon, authenticated;
grant select, insert, update, delete
  on table public.matrix_custom_status_results
  to service_role;

commit;
