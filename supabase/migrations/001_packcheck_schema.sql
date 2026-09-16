create extension if not exists vector;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  password_hash text,
  role text not null,
  display_name text,
  created_at timestamptz default now(),
  updated_at timestamptz
);

create table if not exists businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  gstin text,
  created_at timestamptz default now(),
  updated_at timestamptz
);

create table if not exists business_users (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id),
  user_id uuid references users(id),
  role text,
  created_at timestamptz default now()
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id),
  name text,
  brand text,
  created_at timestamptz default now(),
  updated_at timestamptz
);

create table if not exists product_versions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id),
  version_label text,
  declarations jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists inspections (
  id uuid primary key default gen_random_uuid(),
  officer_user_id text,
  business_id uuid references businesses(id),
  product_id uuid references products(id),
  status text not null,
  current_step text,
  result_status text,
  rule_version_id uuid,
  legal_context jsonb default '{}'::jsonb,
  error_message text,
  finalized_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz
);

create table if not exists product_images (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid references inspections(id),
  product_id uuid references products(id),
  role text,
  original_name text,
  mime_type text,
  storage_path text,
  public_path text,
  created_at timestamptz default now()
);

create table if not exists inspection_images (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid references inspections(id),
  role text,
  original_name text,
  mime_type text,
  storage_path text,
  public_path text,
  created_at timestamptz default now()
);

create table if not exists ocr_results (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid references inspections(id),
  engine text,
  images jsonb default '[]'::jsonb,
  combined_text text,
  created_at timestamptz default now()
);

create table if not exists extracted_declarations (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid references inspections(id),
  ocr_result_id uuid references ocr_results(id),
  source text,
  warning text,
  declarations jsonb default '{}'::jsonb,
  field_evidence jsonb default '{}'::jsonb,
  officer_corrections jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists rule_versions (
  id uuid primary key default gen_random_uuid(),
  version text not null,
  source text,
  status text not null,
  effective_date date,
  created_at timestamptz default now()
);

create table if not exists rules (
  id uuid primary key default gen_random_uuid(),
  rule_version_id uuid references rule_versions(id),
  source text,
  rule text,
  section text,
  topic text,
  text text,
  created_at timestamptz default now()
);

create table if not exists rule_chunks (
  id uuid primary key default gen_random_uuid(),
  rule_version_id uuid references rule_versions(id),
  document_name text not null,
  source text,
  section text,
  rule text,
  topic text,
  page integer,
  version text,
  effective_date date,
  text text not null,
  embedding vector(1536),
  embedding_provider text,
  embedding_status text,
  created_at timestamptz default now()
);

create table if not exists compliance_checks (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid references inspections(id),
  declaration_id uuid references extracted_declarations(id),
  field text,
  label text,
  status text,
  what text,
  why text,
  rule text,
  source text,
  page integer,
  legal_source_text text,
  applicability_reason text,
  confidence numeric,
  evidence jsonb,
  officer_status text,
  officer_corrected_value text,
  officer_remark text,
  officer_user_id text,
  officer_timestamp timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz
);

create table if not exists violations (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid references inspections(id),
  compliance_check_id uuid references compliance_checks(id),
  status text,
  created_at timestamptz default now()
);

create table if not exists evidence (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid references inspections(id),
  field text,
  image_path text,
  public_path text,
  text text,
  confidence numeric,
  box jsonb,
  bounds jsonb,
  created_at timestamptz default now()
);

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid references inspections(id),
  officer_user_id text,
  result_status text,
  generated_at timestamptz,
  summary jsonb,
  pdf_path text,
  docx_path text,
  created_at timestamptz default now()
);

create table if not exists complaints (
  id uuid primary key default gen_random_uuid(),
  product text,
  description text,
  location text,
  contact text,
  status text not null default 'SUBMITTED',
  image_path text,
  created_at timestamptz default now(),
  updated_at timestamptz
);

create table if not exists complaint_updates (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid references complaints(id),
  status text,
  note text,
  actor_user_id text,
  created_at timestamptz default now()
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  actor_user_id text,
  actor_role text,
  details jsonb default '{}'::jsonb,
  timestamp timestamptz default now(),
  created_at timestamptz default now()
);

create table if not exists analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid references inspections(id),
  actor_user_id text,
  actor_role text,
  portal text,
  status text not null,
  current_stage text,
  progress integer default 0,
  message text,
  stages jsonb default '{}'::jsonb,
  timings jsonb default '{}'::jsonb,
  error text,
  cancelled_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz
);

create table if not exists sync_queue (
  id uuid primary key default gen_random_uuid(),
  local_id text,
  entity_type text not null,
  entity_payload jsonb not null,
  status text not null default 'PENDING',
  last_error text,
  created_at timestamptz default now(),
  updated_at timestamptz
);

create index if not exists rule_chunks_topic_idx on rule_chunks(topic);
create index if not exists rule_chunks_rule_idx on rule_chunks(rule);
create index if not exists inspections_status_idx on inspections(status);
create index if not exists complaints_status_idx on complaints(status);
create index if not exists analysis_jobs_status_idx on analysis_jobs(status);
