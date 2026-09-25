-- ─────────────────────────────────────────────────────────────────────────────
-- Booking agent: conversations kept on the server (the browser only holds the
-- conversation id), so the model's history and the tool results cannot be
-- forged by the client. Each turn is also logged in agent_runs (tokens,
-- latency, tools) for usage per hotel.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.agent_conversations (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  channel          text not null check (channel in ('web_chat', 'mcp', 'admin_copilot', 'eval')),
  user_id          uuid references auth.users(id) on delete set null,
  -- Booking created in this conversation, if any.
  reservation_id   uuid,
  turns            integer not null default 0,
  created_at       timestamptz not null default now(),
  last_message_at  timestamptz not null default now()
);
create index agent_conversations_tenant_idx on public.agent_conversations (tenant_id, last_message_at desc);

create table public.agent_messages (
  id               bigint generated always as identity primary key,
  conversation_id  uuid not null references public.agent_conversations(id) on delete cascade,
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  role             text not null check (role in ('user', 'assistant', 'tool')),
  content          text,
  -- Assistant tool calls (OpenAI format) and the id/name a tool result answers.
  tool_calls       jsonb,
  tool_call_id     text,
  tool_name        text,
  created_at       timestamptz not null default now()
);
create index agent_messages_conversation_idx on public.agent_messages (conversation_id, id);

alter table public.agent_conversations enable row level security;
alter table public.agent_messages enable row level security;
-- Hotel staff can review their conversations (quality, evals). Guests talk
-- through the agent-chat function only.
create policy agent_conversations_staff_read on public.agent_conversations
  for select to authenticated using (public.is_tenant_member(tenant_id));
create policy agent_messages_staff_read on public.agent_messages
  for select to authenticated using (public.is_tenant_member(tenant_id));

alter table public.agent_runs
  add column conversation_id uuid references public.agent_conversations(id) on delete set null;
