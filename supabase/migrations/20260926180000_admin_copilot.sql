-- ─────────────────────────────────────────────────────────────────────────────
-- Admin copilot: a module of the AI package (see @domain/features.ts). Its
-- conversations reuse agent_conversations (channel 'admin_copilot', owned by
-- the staff member in user_id).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.module_package(p_feature text)
returns text language sql immutable set search_path = public as $$
  select case p_feature
    when 'chat' then 'stay' when 'folio' then 'stay'
    when 'reviews' then 'stay' when 'experiences' then 'stay'
    when 'ai_agent' then 'ai' when 'mcp' then 'ai' when 'copilot' then 'ai'
    when 'loyalty' then 'chain'
    when 'reports' then 'data' when 'data_lake' then 'data'
  end;
$$;
