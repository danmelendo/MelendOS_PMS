export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agent_conversations: {
        Row: {
          channel: string
          created_at: string
          id: string
          last_message_at: string
          reservation_id: string | null
          tenant_id: string
          turns: number
          user_id: string | null
        }
        Insert: {
          channel: string
          created_at?: string
          id?: string
          last_message_at?: string
          reservation_id?: string | null
          tenant_id: string
          turns?: number
          user_id?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          last_message_at?: string
          reservation_id?: string | null
          tenant_id?: string
          turns?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_conversations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          id: number
          role: string
          tenant_id: string
          tool_call_id: string | null
          tool_calls: Json | null
          tool_name: string | null
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          id?: never
          role: string
          tenant_id: string
          tool_call_id?: string | null
          tool_calls?: Json | null
          tool_name?: string | null
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          id?: never
          role?: string
          tenant_id?: string
          tool_call_id?: string | null
          tool_calls?: Json | null
          tool_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "agent_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runs: {
        Row: {
          channel: string
          conversation_id: string | null
          cost_usd: number
          created_at: string
          error: string | null
          id: string
          input_tokens: number
          latency_ms: number | null
          model: string
          outcome: string
          output_tokens: number
          tenant_id: string
          tools_called: string[]
        }
        Insert: {
          channel: string
          conversation_id?: string | null
          cost_usd?: number
          created_at?: string
          error?: string | null
          id?: string
          input_tokens?: number
          latency_ms?: number | null
          model: string
          outcome: string
          output_tokens?: number
          tenant_id: string
          tools_called?: string[]
        }
        Update: {
          channel?: string
          conversation_id?: string | null
          cost_usd?: number
          created_at?: string
          error?: string | null
          id?: string
          input_tokens?: number
          latency_ms?: number | null
          model?: string
          outcome?: string
          output_tokens?: number
          tenant_id?: string
          tools_called?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "agent_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          at: string
          entity: string
          entity_id: string | null
          id: string
          payload: Json | null
          tenant_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          at?: string
          entity: string
          entity_id?: string | null
          id?: string
          payload?: Json | null
          tenant_id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          payload?: Json | null
          tenant_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_watches: {
        Row: {
          check_in: string
          check_out: string
          created_at: string
          guests: number
          id: string
          member_id: string
          notified_at: string | null
          property_id: string
          room_id: string
          status: string
          tenant_id: string
        }
        Insert: {
          check_in: string
          check_out: string
          created_at?: string
          guests?: number
          id?: string
          member_id: string
          notified_at?: string | null
          property_id: string
          room_id: string
          status?: string
          tenant_id?: string
        }
        Update: {
          check_in?: string
          check_out?: string
          created_at?: string
          guests?: number
          id?: string
          member_id?: string
          notified_at?: string | null
          property_id?: string
          room_id?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_watches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_watches_tenant_id_member_id_fkey"
            columns: ["tenant_id", "member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "availability_watches_tenant_id_room_id_fkey"
            columns: ["tenant_id", "room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      booking_access_tokens: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          reservation_id: string
          tenant_id: string
          token_hash: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          reservation_id: string
          tenant_id: string
          token_hash: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          reservation_id?: string
          tenant_id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_access_tokens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_access_tokens_tenant_id_reservation_id_fkey"
            columns: ["tenant_id", "reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      booking_journal: {
        Row: {
          actor: string
          booking_ref: string
          created_at: string
          event_type: string
          id: string
          member_id: string | null
          payload: Json
          property_id: string | null
          tenant_id: string
        }
        Insert: {
          actor: string
          booking_ref: string
          created_at?: string
          event_type: string
          id?: string
          member_id?: string | null
          payload?: Json
          property_id?: string | null
          tenant_id?: string
        }
        Update: {
          actor?: string
          booking_ref?: string
          created_at?: string
          event_type?: string
          id?: string
          member_id?: string | null
          payload?: Json
          property_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_journal_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cancellation_requests: {
        Row: {
          category: string | null
          channel: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          id: string
          reason: string | null
          requested_at: string
          reservation_id: string
          status: Database["public"]["Enums"]["cancellation_status"]
          tenant_id: string
        }
        Insert: {
          category?: string | null
          channel?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          reason?: string | null
          requested_at?: string
          reservation_id: string
          status?: Database["public"]["Enums"]["cancellation_status"]
          tenant_id?: string
        }
        Update: {
          category?: string | null
          channel?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          reason?: string | null
          requested_at?: string
          reservation_id?: string
          status?: Database["public"]["Enums"]["cancellation_status"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cancellation_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cancellation_requests_tenant_id_reservation_id_fkey"
            columns: ["tenant_id", "reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      channel_messages: {
        Row: {
          channel_id: string
          created_at: string
          detail: string | null
          direction: string
          event: string
          external_ref: string | null
          id: number
          payload: Json | null
          reservation_id: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          detail?: string | null
          direction: string
          event: string
          external_ref?: string | null
          id?: never
          payload?: Json | null
          reservation_id?: string | null
          status: string
          tenant_id: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          detail?: string | null
          direction?: string
          event?: string
          external_ref?: string | null
          id?: never
          payload?: Json | null
          reservation_id?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_messages_tenant_id_channel_id_fkey"
            columns: ["tenant_id", "channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      channel_outbox: {
        Row: {
          attempts: number
          channel_id: string
          created_at: string
          error: string | null
          event: string
          id: number
          payload: Json
          sent_at: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          attempts?: number
          channel_id: string
          created_at?: string
          error?: string | null
          event?: string
          id?: never
          payload: Json
          sent_at?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          attempts?: number
          channel_id?: string
          created_at?: string
          error?: string | null
          event?: string
          id?: never
          payload?: Json
          sent_at?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_outbox_tenant_id_channel_id_fkey"
            columns: ["tenant_id", "channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      channels: {
        Row: {
          commission_pct: number
          created_at: string
          id: string
          kind: string
          last_message_at: string | null
          name: string
          provider: string
          room_map: Json
          status: string
          tenant_id: string
        }
        Insert: {
          commission_pct?: number
          created_at?: string
          id?: string
          kind: string
          last_message_at?: string | null
          name: string
          provider: string
          room_map?: Json
          status?: string
          tenant_id: string
        }
        Update: {
          commission_pct?: number
          created_at?: string
          id?: string
          kind?: string
          last_message_at?: string | null
          name?: string
          provider?: string
          room_map?: Json
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      common_spaces: {
        Row: {
          active: boolean
          capacity: number
          close_hour: number
          created_at: string
          description: string | null
          id: string
          kind: string
          name: string
          open_hour: number
          price_per_hour: number
          property_id: string
          sort_order: number
          tenant_id: string
        }
        Insert: {
          active?: boolean
          capacity?: number
          close_hour: number
          created_at?: string
          description?: string | null
          id?: string
          kind: string
          name: string
          open_hour: number
          price_per_hour?: number
          property_id: string
          sort_order?: number
          tenant_id?: string
        }
        Update: {
          active?: boolean
          capacity?: number
          close_hour?: number
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          name?: string
          open_hour?: number
          price_per_hour?: number
          property_id?: string
          sort_order?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "common_spaces_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "common_spaces_tenant_id_property_id_fkey"
            columns: ["tenant_id", "property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string | null
          no_contact: boolean
          notes: string | null
          phone: string | null
          simulated: boolean
          tenant_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          no_contact?: boolean
          notes?: string | null
          phone?: string | null
          simulated?: boolean
          tenant_id?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          no_contact?: boolean
          notes?: string | null
          phone?: string | null
          simulated?: boolean
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      domain_events: {
        Row: {
          actor_id: string | null
          entity: string
          entity_id: string
          event_type: string
          id: number
          occurred_at: string
          payload: Json
          tenant_id: string
        }
        Insert: {
          actor_id?: string | null
          entity: string
          entity_id: string
          event_type: string
          id?: never
          occurred_at?: string
          payload?: Json
          tenant_id: string
        }
        Update: {
          actor_id?: string | null
          entity?: string
          entity_id?: string
          event_type?: string
          id?: never
          occurred_at?: string
          payload?: Json
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "domain_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      dynamic_rules: {
        Row: {
          active: boolean
          config: Json
          created_at: string
          id: string
          multiplier: number
          name: string
          tenant_id: string
          type: Database["public"]["Enums"]["dynamic_rule_type"]
        }
        Insert: {
          active?: boolean
          config?: Json
          created_at?: string
          id?: string
          multiplier?: number
          name: string
          tenant_id?: string
          type: Database["public"]["Enums"]["dynamic_rule_type"]
        }
        Update: {
          active?: boolean
          config?: Json
          created_at?: string
          id?: string
          multiplier?: number
          name?: string
          tenant_id?: string
          type?: Database["public"]["Enums"]["dynamic_rule_type"]
        }
        Relationships: [
          {
            foreignKeyName: "dynamic_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      experiences: {
        Row: {
          active: boolean
          attending: number
          capacity: number
          category: string
          created_at: string
          description: string | null
          id: string
          location: string
          property_id: string
          starts_at: string
          summary: string
          tenant_id: string
          title: string
        }
        Insert: {
          active?: boolean
          attending?: number
          capacity: number
          category: string
          created_at?: string
          description?: string | null
          id?: string
          location: string
          property_id: string
          starts_at: string
          summary: string
          tenant_id?: string
          title: string
        }
        Update: {
          active?: boolean
          attending?: number
          capacity?: number
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          location?: string
          property_id?: string
          starts_at?: string
          summary?: string
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "experiences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiences_tenant_id_property_id_fkey"
            columns: ["tenant_id", "property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      extras: {
        Row: {
          active: boolean
          category: Database["public"]["Enums"]["extra_category"]
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          name: string
          price: number
          sort_order: number
          tenant_id: string
        }
        Insert: {
          active?: boolean
          category: Database["public"]["Enums"]["extra_category"]
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          price: number
          sort_order?: number
          tenant_id?: string
        }
        Update: {
          active?: boolean
          category?: Database["public"]["Enums"]["extra_category"]
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          price?: number
          sort_order?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "extras_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      folio_charges: {
        Row: {
          amount: number | null
          category: string
          created_at: string
          created_by: string | null
          description: string
          id: string
          note: string | null
          posted_at: string | null
          qty: number
          reservation_id: string
          service_id: string | null
          source: string
          status: string
          tenant_id: string
          unit_price: number
          void_reason: string | null
        }
        Insert: {
          amount?: number | null
          category: string
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          note?: string | null
          posted_at?: string | null
          qty?: number
          reservation_id: string
          service_id?: string | null
          source?: string
          status?: string
          tenant_id: string
          unit_price: number
          void_reason?: string | null
        }
        Update: {
          amount?: number | null
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          note?: string | null
          posted_at?: string | null
          qty?: number
          reservation_id?: string
          service_id?: string | null
          source?: string
          status?: string
          tenant_id?: string
          unit_price?: number
          void_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "folio_charges_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folio_charges_tenant_id_reservation_id_fkey"
            columns: ["tenant_id", "reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "folio_charges_tenant_id_service_id_fkey"
            columns: ["tenant_id", "service_id"]
            isOneToOne: false
            referencedRelation: "stay_services"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      gift_thresholds: {
        Row: {
          active: boolean
          gift_extra_id: string
          id: string
          min_extras_total: number
          tenant_id: string
        }
        Insert: {
          active?: boolean
          gift_extra_id: string
          id?: string
          min_extras_total: number
          tenant_id?: string
        }
        Update: {
          active?: boolean
          gift_extra_id?: string
          id?: string
          min_extras_total?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gift_thresholds_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_thresholds_tenant_id_gift_extra_id_fkey"
            columns: ["tenant_id", "gift_extra_id"]
            isOneToOne: false
            referencedRelation: "extras"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      guest_identities: {
        Row: {
          address_line: string | null
          birth_date: string | null
          city: string | null
          country: string | null
          customer_id: string
          document_country: string | null
          document_number: string
          document_type: string
          nationality: string | null
          postal_code: string | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address_line?: string | null
          birth_date?: string | null
          city?: string | null
          country?: string | null
          customer_id: string
          document_country?: string | null
          document_number: string
          document_type: string
          nationality?: string | null
          postal_code?: string | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address_line?: string | null
          birth_date?: string | null
          city?: string | null
          country?: string | null
          customer_id?: string
          document_country?: string | null
          document_number?: string
          document_type?: string
          nationality?: string | null
          postal_code?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guest_identities_tenant_id_customer_id_fkey"
            columns: ["tenant_id", "customer_id"]
            isOneToOne: true
            referencedRelation: "customers"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "guest_identities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents: {
        Row: {
          category: string
          created_at: string
          description: string
          id: string
          member_id: string
          property_name: string | null
          status: string
          tenant_id: string
          title: string
          updates: Json
        }
        Insert: {
          category: string
          created_at?: string
          description: string
          id?: string
          member_id: string
          property_name?: string | null
          status?: string
          tenant_id?: string
          title: string
          updates?: Json
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          id?: string
          member_id?: string
          property_name?: string | null
          status?: string
          tenant_id?: string
          title?: string
          updates?: Json
        }
        Relationships: [
          {
            foreignKeyName: "incidents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_tenant_id_member_id_fkey"
            columns: ["tenant_id", "member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          concept: string
          due_at: string
          id: string
          issued_at: string
          member_id: string
          net: number
          number: string
          property_name: string | null
          status: string
          tax: number
          tenant_id: string
        }
        Insert: {
          amount: number
          concept: string
          due_at: string
          id?: string
          issued_at: string
          member_id: string
          net: number
          number: string
          property_name?: string | null
          status: string
          tax: number
          tenant_id?: string
        }
        Update: {
          amount?: number
          concept?: string
          due_at?: string
          id?: string
          issued_at?: string
          member_id?: string
          net?: number
          number?: string
          property_name?: string | null
          status?: string
          tax?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_member_id_fkey"
            columns: ["tenant_id", "member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      loyalty_accounts: {
        Row: {
          created_at: string
          id: string
          lifetime_points: number
          member_id: string
          member_since: string
          points: number
          tenant_id: string
          tier_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          lifetime_points?: number
          member_id: string
          member_since?: string
          points?: number
          tenant_id?: string
          tier_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          lifetime_points?: number
          member_id?: string
          member_since?: string
          points?: number
          tenant_id?: string
          tier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_accounts_tenant_id_member_id_fkey"
            columns: ["tenant_id", "member_id"]
            isOneToOne: true
            referencedRelation: "members"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "loyalty_accounts_tenant_id_tier_id_fkey"
            columns: ["tenant_id", "tier_id"]
            isOneToOne: false
            referencedRelation: "loyalty_tiers"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      loyalty_tiers: {
        Row: {
          created_at: string
          id: string
          min_points: number
          name: string
          perks: string[]
          points_per_euro: number
          sort_order: number
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          min_points?: number
          name: string
          perks?: string[]
          points_per_euro?: number
          sort_order?: number
          tenant_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          min_points?: number
          name?: string
          perks?: string[]
          points_per_euro?: number
          sort_order?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_tiers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_transactions: {
        Row: {
          created_at: string
          id: string
          member_id: string
          points: number
          reason: string
          reservation_id: string | null
          tenant_id: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          member_id: string
          points: number
          reason: string
          reservation_id?: string | null
          tenant_id?: string
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          member_id?: string
          points?: number
          reason?: string
          reservation_id?: string | null
          tenant_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_tenant_id_member_id_fkey"
            columns: ["tenant_id", "member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "loyalty_transactions_tenant_id_reservation_id_fkey"
            columns: ["tenant_id", "reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      mcp_tokens: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          last_used_at: string | null
          name: string
          revoked_at: string | null
          scopes: string[]
          tenant_id: string
          token_hash: string
          token_prefix: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          last_used_at?: string | null
          name: string
          revoked_at?: string | null
          scopes: string[]
          tenant_id: string
          token_hash: string
          token_prefix: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
          scopes?: string[]
          tenant_id?: string
          token_hash?: string
          token_prefix?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_tokens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          created_at: string
          email: string
          id: string
          member_number: string
          name: string
          phone: string | null
          tenant_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          member_number: string
          name: string
          phone?: string | null
          tenant_id?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          member_number?: string
          name?: string
          phone?: string | null
          tenant_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_accounts: {
        Row: {
          active: boolean
          created_at: string
          id: string
          provider: Database["public"]["Enums"]["payment_provider"]
          public_config: Json
          secret_name: string | null
          tenant_id: string
          test_mode: boolean
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          provider: Database["public"]["Enums"]["payment_provider"]
          public_config?: Json
          secret_name?: string | null
          tenant_id?: string
          test_mode?: boolean
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          provider?: Database["public"]["Enums"]["payment_provider"]
          public_config?: Json
          secret_name?: string | null
          tenant_id?: string
          test_mode?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "payment_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          kind: string
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_ref: string
          raw_notification: Json | null
          reservation_id: string
          status: Database["public"]["Enums"]["payment_status"]
          tenant_id: string
          verified_at: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          id?: string
          kind?: string
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_ref: string
          raw_notification?: Json | null
          reservation_id: string
          status?: Database["public"]["Enums"]["payment_status"]
          tenant_id?: string
          verified_at?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          kind?: string
          provider?: Database["public"]["Enums"]["payment_provider"]
          provider_ref?: string
          raw_notification?: Json | null
          reservation_id?: string
          status?: Database["public"]["Enums"]["payment_status"]
          tenant_id?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_tenant_id_reservation_id_fkey"
            columns: ["tenant_id", "reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      promo_codes: {
        Row: {
          active: boolean
          archived: boolean
          code: string
          created_at: string
          discount_type: string
          discount_value: number
          id: string
          max_uses: number | null
          single_use: boolean
          tenant_id: string
          times_used: number
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          active?: boolean
          archived?: boolean
          code: string
          created_at?: string
          discount_type: string
          discount_value: number
          id?: string
          max_uses?: number | null
          single_use?: boolean
          tenant_id?: string
          times_used?: number
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          active?: boolean
          archived?: boolean
          code?: string
          created_at?: string
          discount_type?: string
          discount_value?: number
          id?: string
          max_uses?: number | null
          single_use?: boolean
          tenant_id?: string
          times_used?: number
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promo_codes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      properties: {
        Row: {
          active: boolean
          address: string | null
          amenities: string[]
          brand: string | null
          city: string
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          name: string
          province_id: string | null
          rating: number | null
          sort_order: number
          tenant_id: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          amenities?: string[]
          brand?: string | null
          city: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          province_id?: string | null
          rating?: number | null
          sort_order?: number
          tenant_id?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          amenities?: string[]
          brand?: string | null
          city?: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          province_id?: string | null
          rating?: number | null
          sort_order?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "properties_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_tenant_id_province_id_fkey"
            columns: ["tenant_id", "province_id"]
            isOneToOne: false
            referencedRelation: "provinces"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      provinces: {
        Row: {
          accent: string
          created_at: string
          id: string
          name: string
          sort_order: number
          tagline: string | null
          tenant_id: string
        }
        Insert: {
          accent?: string
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          tagline?: string | null
          tenant_id?: string
        }
        Update: {
          accent?: string
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          tagline?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "provinces_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_groups: {
        Row: {
          created_at: string
          id: string
          name: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          tenant_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rate_groups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_nightly: {
        Row: {
          id: string
          price: number
          rate_group_id: string
          tenant_id: string
          weekend_price: number | null
        }
        Insert: {
          id?: string
          price: number
          rate_group_id: string
          tenant_id?: string
          weekend_price?: number | null
        }
        Update: {
          id?: string
          price?: number
          rate_group_id?: string
          tenant_id?: string
          weekend_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rate_nightly_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rate_nightly_tenant_id_rate_group_id_fkey"
            columns: ["tenant_id", "rate_group_id"]
            isOneToOne: true
            referencedRelation: "rate_groups"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      reservation_extras: {
        Row: {
          created_at: string
          extra_id: string
          id: string
          is_gift: boolean
          qty: number
          reservation_id: string
          tenant_id: string
          unit_price: number
        }
        Insert: {
          created_at?: string
          extra_id: string
          id?: string
          is_gift?: boolean
          qty?: number
          reservation_id: string
          tenant_id?: string
          unit_price: number
        }
        Update: {
          created_at?: string
          extra_id?: string
          id?: string
          is_gift?: boolean
          qty?: number
          reservation_id?: string
          tenant_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "reservation_extras_tenant_id_extra_id_fkey"
            columns: ["tenant_id", "extra_id"]
            isOneToOne: false
            referencedRelation: "extras"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "reservation_extras_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_extras_tenant_id_reservation_id_fkey"
            columns: ["tenant_id", "reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      reservations: {
        Row: {
          access_token_hash: string | null
          base_price: number
          cancellation_category: string | null
          cancellation_note: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          channel_commission: number | null
          channel_id: string | null
          cleaning_minutes: number
          confirmation_email_error: string | null
          confirmation_email_sent_at: string | null
          created_at: string
          created_by: string | null
          created_by_role: string | null
          customer_id: string | null
          deposit_amount: number
          deposit_paid: boolean
          discount_amount: number
          dynamic_reason: string | null
          dynamic_surcharge: number
          end_at: string
          external_ref: string | null
          extras_total: number
          free_cancellation_until: string | null
          hold_expires_at: string | null
          id: string
          internal_notes: string | null
          is_prebooking: boolean
          late_cancellation_fee: number | null
          manual_override: boolean
          member_id: string | null
          paid_amount: number
          payment_mode: string
          people: number
          promo_code_id: string | null
          property_id: string | null
          redsys_order: string | null
          reference: string | null
          room_id: string
          simulated: boolean
          start_at: string
          status: Database["public"]["Enums"]["reservation_status"]
          tenant_id: string
          total: number
          updated_at: string
        }
        Insert: {
          access_token_hash?: string | null
          base_price?: number
          cancellation_category?: string | null
          cancellation_note?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          channel_commission?: number | null
          channel_id?: string | null
          cleaning_minutes?: number
          confirmation_email_error?: string | null
          confirmation_email_sent_at?: string | null
          created_at?: string
          created_by?: string | null
          created_by_role?: string | null
          customer_id?: string | null
          deposit_amount?: number
          deposit_paid?: boolean
          discount_amount?: number
          dynamic_reason?: string | null
          dynamic_surcharge?: number
          end_at: string
          external_ref?: string | null
          extras_total?: number
          free_cancellation_until?: string | null
          hold_expires_at?: string | null
          id?: string
          internal_notes?: string | null
          is_prebooking?: boolean
          late_cancellation_fee?: number | null
          manual_override?: boolean
          member_id?: string | null
          paid_amount?: number
          payment_mode?: string
          people?: number
          promo_code_id?: string | null
          property_id?: string | null
          redsys_order?: string | null
          reference?: string | null
          room_id: string
          simulated?: boolean
          start_at: string
          status?: Database["public"]["Enums"]["reservation_status"]
          tenant_id?: string
          total?: number
          updated_at?: string
        }
        Update: {
          access_token_hash?: string | null
          base_price?: number
          cancellation_category?: string | null
          cancellation_note?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          channel_commission?: number | null
          channel_id?: string | null
          cleaning_minutes?: number
          confirmation_email_error?: string | null
          confirmation_email_sent_at?: string | null
          created_at?: string
          created_by?: string | null
          created_by_role?: string | null
          customer_id?: string | null
          deposit_amount?: number
          deposit_paid?: boolean
          discount_amount?: number
          dynamic_reason?: string | null
          dynamic_surcharge?: number
          end_at?: string
          external_ref?: string | null
          extras_total?: number
          free_cancellation_until?: string | null
          hold_expires_at?: string | null
          id?: string
          internal_notes?: string | null
          is_prebooking?: boolean
          late_cancellation_fee?: number | null
          manual_override?: boolean
          member_id?: string | null
          paid_amount?: number
          payment_mode?: string
          people?: number
          promo_code_id?: string | null
          property_id?: string | null
          redsys_order?: string | null
          reference?: string | null
          room_id?: string
          simulated?: boolean
          start_at?: string
          status?: Database["public"]["Enums"]["reservation_status"]
          tenant_id?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservations_channel_fk"
            columns: ["tenant_id", "channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "reservations_tenant_id_customer_id_fkey"
            columns: ["tenant_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "reservations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_tenant_id_member_id_fkey"
            columns: ["tenant_id", "member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "reservations_tenant_id_promo_code_id_fkey"
            columns: ["tenant_id", "promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "reservations_tenant_id_property_id_fkey"
            columns: ["tenant_id", "property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "reservations_tenant_id_room_id_fkey"
            columns: ["tenant_id", "room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      reviews: {
        Row: {
          author_name: string
          comment: string | null
          created_at: string
          id: string
          property_id: string | null
          rating: number
          replied_at: string | null
          replied_by: string | null
          reply: string | null
          reservation_id: string
          scores: Json
          simulated: boolean
          tenant_id: string
        }
        Insert: {
          author_name: string
          comment?: string | null
          created_at?: string
          id?: string
          property_id?: string | null
          rating: number
          replied_at?: string | null
          replied_by?: string | null
          reply?: string | null
          reservation_id: string
          scores?: Json
          simulated?: boolean
          tenant_id: string
        }
        Update: {
          author_name?: string
          comment?: string | null
          created_at?: string
          id?: string
          property_id?: string | null
          rating?: number
          replied_at?: string | null
          replied_by?: string | null
          reply?: string | null
          reservation_id?: string
          scores?: Json
          simulated?: boolean
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_tenant_id_property_id_fkey"
            columns: ["tenant_id", "property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "reviews_tenant_id_reservation_id_fkey"
            columns: ["tenant_id", "reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      rewards: {
        Row: {
          active: boolean
          category: string
          cost_points: number
          created_at: string
          description: string | null
          id: string
          name: string
          sort_order: number
          tenant_id: string
        }
        Insert: {
          active?: boolean
          category: string
          cost_points: number
          created_at?: string
          description?: string | null
          id?: string
          name: string
          sort_order?: number
          tenant_id?: string
        }
        Update: {
          active?: boolean
          category?: string
          cost_points?: number
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          sort_order?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rewards_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          active: boolean
          asset_type: Database["public"]["Enums"]["room_category"]
          building: string
          capacity: number
          created_at: string
          description: string | null
          features: string[]
          has_tv: boolean
          id: string
          image_url: string | null
          name: string
          property_id: string
          rate_group_id: string | null
          sort_order: number
          status: Database["public"]["Enums"]["room_status"]
          tenant_id: string
        }
        Insert: {
          active?: boolean
          asset_type?: Database["public"]["Enums"]["room_category"]
          building: string
          capacity?: number
          created_at?: string
          description?: string | null
          features?: string[]
          has_tv?: boolean
          id?: string
          image_url?: string | null
          name: string
          property_id: string
          rate_group_id?: string | null
          sort_order?: number
          status?: Database["public"]["Enums"]["room_status"]
          tenant_id?: string
        }
        Update: {
          active?: boolean
          asset_type?: Database["public"]["Enums"]["room_category"]
          building?: string
          capacity?: number
          created_at?: string
          description?: string | null
          features?: string[]
          has_tv?: boolean
          id?: string
          image_url?: string | null
          name?: string
          property_id?: string
          rate_group_id?: string | null
          sort_order?: number
          status?: Database["public"]["Enums"]["room_status"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rooms_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rooms_tenant_id_property_id_fkey"
            columns: ["tenant_id", "property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "rooms_tenant_id_rate_group_id_fkey"
            columns: ["tenant_id", "rate_group_id"]
            isOneToOne: false
            referencedRelation: "rate_groups"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      signatures: {
        Row: {
          created_at: string
          doc_type: string
          id: string
          reservation_id: string
          signature_data: string | null
          signed_at: string | null
          signer_name: string
          status: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          doc_type: string
          id?: string
          reservation_id: string
          signature_data?: string | null
          signed_at?: string | null
          signer_name: string
          status?: string
          tenant_id?: string
        }
        Update: {
          created_at?: string
          doc_type?: string
          id?: string
          reservation_id?: string
          signature_data?: string | null
          signed_at?: string | null
          signer_name?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "signatures_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signatures_tenant_id_reservation_id_fkey"
            columns: ["tenant_id", "reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      space_bookings: {
        Row: {
          created_at: string
          date: string
          end_hour: number
          guests: number
          id: string
          member_id: string
          space_id: string
          start_hour: number
          status: string
          tenant_id: string
          total: number
        }
        Insert: {
          created_at?: string
          date: string
          end_hour: number
          guests?: number
          id?: string
          member_id: string
          space_id: string
          start_hour: number
          status?: string
          tenant_id?: string
          total?: number
        }
        Update: {
          created_at?: string
          date?: string
          end_hour?: number
          guests?: number
          id?: string
          member_id?: string
          space_id?: string
          start_hour?: number
          status?: string
          tenant_id?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "space_bookings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_bookings_tenant_id_member_id_fkey"
            columns: ["tenant_id", "member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "space_bookings_tenant_id_space_id_fkey"
            columns: ["tenant_id", "space_id"]
            isOneToOne: false
            referencedRelation: "common_spaces"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      stay_extensions: {
        Row: {
          amount: number
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          id: string
          new_check_out: string
          new_end_at: string
          nights: number
          requested_at: string
          reservation_id: string
          status: string
          tenant_id: string
        }
        Insert: {
          amount: number
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          new_check_out: string
          new_end_at: string
          nights: number
          requested_at?: string
          reservation_id: string
          status?: string
          tenant_id: string
        }
        Update: {
          amount?: number
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          new_check_out?: string
          new_end_at?: string
          nights?: number
          requested_at?: string
          reservation_id?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stay_extensions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stay_extensions_tenant_id_reservation_id_fkey"
            columns: ["tenant_id", "reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      stay_messages: {
        Row: {
          body: string
          category: string | null
          created_at: string
          id: string
          read_at: string | null
          reservation_id: string
          sender: Database["public"]["Enums"]["message_sender"]
          staff_id: string | null
          tenant_id: string
        }
        Insert: {
          body: string
          category?: string | null
          created_at?: string
          id?: string
          read_at?: string | null
          reservation_id: string
          sender: Database["public"]["Enums"]["message_sender"]
          staff_id?: string | null
          tenant_id: string
        }
        Update: {
          body?: string
          category?: string | null
          created_at?: string
          id?: string
          read_at?: string | null
          reservation_id?: string
          sender?: Database["public"]["Enums"]["message_sender"]
          staff_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stay_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stay_messages_tenant_id_reservation_id_fkey"
            columns: ["tenant_id", "reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      stay_services: {
        Row: {
          active: boolean
          category: string
          created_at: string
          description: string | null
          id: string
          name: string
          price: number
          sort_order: number
          tenant_id: string
          unit: string
        }
        Insert: {
          active?: boolean
          category: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          price: number
          sort_order?: number
          tenant_id?: string
          unit?: string
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          price?: number
          sort_order?: number
          tenant_id?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "stay_services_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_members: {
        Row: {
          created_at: string
          role: Database["public"]["Enums"]["staff_role"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          role: Database["public"]["Enums"]["staff_role"]
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          role?: Database["public"]["Enums"]["staff_role"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          brand: Json
          created_at: string
          domain: string | null
          id: string
          name: string
          plan: string
          settings: Json
          slug: string
          status: Database["public"]["Enums"]["tenant_status"]
        }
        Insert: {
          brand?: Json
          created_at?: string
          domain?: string | null
          id?: string
          name: string
          plan?: string
          settings?: Json
          slug: string
          status?: Database["public"]["Enums"]["tenant_status"]
        }
        Update: {
          brand?: Json
          created_at?: string
          domain?: string | null
          id?: string
          name?: string
          plan?: string
          settings?: Json
          slug?: string
          status?: Database["public"]["Enums"]["tenant_status"]
        }
        Relationships: []
      }
      usage_events: {
        Row: {
          id: number
          metadata: Json
          metric: string
          occurred_at: string
          quantity: number
          tenant_id: string
          unit: string
        }
        Insert: {
          id?: never
          metadata?: Json
          metric: string
          occurred_at?: string
          quantity: number
          tenant_id: string
          unit: string
        }
        Update: {
          id?: never
          metadata?: Json
          metric?: string
          occurred_at?: string
          quantity?: number
          tenant_id?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      archive_expired_promo_codes: { Args: never; Returns: number }
      cancel_booking_as_guest: {
        Args: {
          p_actor: string
          p_category: string
          r: Database["public"]["Tables"]["reservations"]["Row"]
        }
        Returns: undefined
      }
      cancel_booking_for_channel: {
        Args: {
          p_category?: string
          p_channel: string
          p_reservation: string
          p_tenant: string
        }
        Returns: Json
      }
      cancel_guest_booking: {
        Args: { p_category?: string; p_id: string; p_token: string }
        Returns: undefined
      }
      cancel_my_reservation: {
        Args: { p_category?: string; p_reservation_id: string }
        Returns: undefined
      }
      cancel_stale_pending_reservations: { Args: never; Returns: number }
      channel_secret: { Args: { p_channel: string }; Returns: string }
      confirm_payment: {
        Args: {
          p_amount: number
          p_provider: Database["public"]["Enums"]["payment_provider"]
          p_raw: Json
          p_ref: string
          p_succeeded: boolean
        }
        Returns: string
      }
      create_channel: {
        Args: {
          p_commission?: number
          p_kind: string
          p_name: string
          p_provider: string
          p_room_map?: Json
          p_tenant: string
        }
        Returns: Json
      }
      create_mcp_token: {
        Args: {
          p_days?: number
          p_name: string
          p_scopes: string[]
          p_tenant: string
        }
        Returns: Json
      }
      current_tenant_id: { Args: never; Returns: string }
      customer_directory: {
        Args: {
          p_identity?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_sort?: string
          p_stay?: string
          p_tenant?: string
        }
        Returns: {
          created_at: string
          email: string
          has_identity: boolean
          id: string
          in_house: boolean
          last_check_out: string
          name: string
          next_check_in: string
          nights: number
          no_contact: boolean
          notes: string
          phone: string
          spent: number
          stays: number
          tenant_id: string
          total: number
        }[]
      }
      decide_cancellation: {
        Args: {
          p_approve: boolean
          p_category?: string
          p_note?: string
          p_request_id: string
        }
        Returns: undefined
      }
      decide_extension: {
        Args: { p_approve: boolean; p_id: string; p_note?: string }
        Returns: undefined
      }
      delete_channel: { Args: { p_channel: string }; Returns: undefined }
      delete_customer: { Args: { p_customer_id: string }; Returns: string }
      extend_cleaning_and_shift: {
        Args: { p_cleaning_minutes: number; p_reservation_id: string }
        Returns: number
      }
      find_guest_booking: {
        Args: { p_email: string; p_reference: string; p_tenant: string }
        Returns: Json
      }
      find_or_create_customer: {
        Args: {
          p_email: string
          p_name: string
          p_no_contact?: boolean
          p_phone?: string
          p_tenant: string
        }
        Returns: string
      }
      folio_balance: { Args: { p_reservation_id: string }; Returns: number }
      get_folio: {
        Args: { p_reservation_id: string; p_token?: string }
        Returns: Json
      }
      get_guest_booking: {
        Args: { p_id: string; p_token: string }
        Returns: Json
      }
      get_guest_identity: { Args: { p_customer_id: string }; Returns: Json }
      get_my_review: {
        Args: { p_reservation_id: string; p_token?: string }
        Returns: Json
      }
      get_payment_secret: { Args: { p_name: string }; Returns: string }
      get_reviews: {
        Args: { p_limit?: number; p_property?: string; p_tenant?: string }
        Returns: Json
      }
      get_stay_messages: {
        Args: { p_reservation_id: string; p_token?: string }
        Returns: Json
      }
      guest_booking_row: {
        Args: { p_id: string; p_token: string }
        Returns: {
          access_token_hash: string | null
          base_price: number
          cancellation_category: string | null
          cancellation_note: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          channel_commission: number | null
          channel_id: string | null
          cleaning_minutes: number
          confirmation_email_error: string | null
          confirmation_email_sent_at: string | null
          created_at: string
          created_by: string | null
          created_by_role: string | null
          customer_id: string | null
          deposit_amount: number
          deposit_paid: boolean
          discount_amount: number
          dynamic_reason: string | null
          dynamic_surcharge: number
          end_at: string
          external_ref: string | null
          extras_total: number
          free_cancellation_until: string | null
          hold_expires_at: string | null
          id: string
          internal_notes: string | null
          is_prebooking: boolean
          late_cancellation_fee: number | null
          manual_override: boolean
          member_id: string | null
          paid_amount: number
          payment_mode: string
          people: number
          promo_code_id: string | null
          property_id: string | null
          redsys_order: string | null
          reference: string | null
          room_id: string
          simulated: boolean
          start_at: string
          status: Database["public"]["Enums"]["reservation_status"]
          tenant_id: string
          total: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "reservations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      guest_stay: {
        Args: { p_id: string; p_token: string }
        Returns: {
          access_token_hash: string | null
          base_price: number
          cancellation_category: string | null
          cancellation_note: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          channel_commission: number | null
          channel_id: string | null
          cleaning_minutes: number
          confirmation_email_error: string | null
          confirmation_email_sent_at: string | null
          created_at: string
          created_by: string | null
          created_by_role: string | null
          customer_id: string | null
          deposit_amount: number
          deposit_paid: boolean
          discount_amount: number
          dynamic_reason: string | null
          dynamic_surcharge: number
          end_at: string
          external_ref: string | null
          extras_total: number
          free_cancellation_until: string | null
          hold_expires_at: string | null
          id: string
          internal_notes: string | null
          is_prebooking: boolean
          late_cancellation_fee: number | null
          manual_override: boolean
          member_id: string | null
          paid_amount: number
          payment_mode: string
          people: number
          promo_code_id: string | null
          property_id: string | null
          redsys_order: string | null
          reference: string | null
          room_id: string
          simulated: boolean
          start_at: string
          status: Database["public"]["Enums"]["reservation_status"]
          tenant_id: string
          total: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "reservations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      has_tenant_role: {
        Args: {
          p_role: Database["public"]["Enums"]["staff_role"]
          p_tenant: string
        }
        Returns: boolean
      }
      hotel_cancellation_penalty: {
        Args: { p_tenant: string }
        Returns: string
      }
      hotel_free_cancellation_hours: {
        Args: { p_tenant: string }
        Returns: number
      }
      is_cancellation_category: { Args: { p: string }; Returns: boolean }
      is_group_only: { Args: { p_tenant: string }; Returns: boolean }
      is_member_user: {
        Args: { p_member: string; p_tenant: string }
        Returns: boolean
      }
      is_tenant_member: { Args: { p_tenant: string }; Returns: boolean }
      is_tenant_staff: { Args: { p_tenant: string }; Returns: boolean }
      lake_tenants: { Args: never; Returns: string[] }
      list_mcp_tokens: { Args: { p_tenant: string }; Returns: Json }
      mcp_token_auth: { Args: { p_token_hash: string }; Returns: Json }
      module_package: { Args: { p_feature: string }; Returns: string }
      order_service: {
        Args: {
          p_note?: string
          p_qty?: number
          p_reservation_id: string
          p_service_id: string
          p_token: string
        }
        Returns: string
      }
      record_desk_payment: {
        Args: { p_amount: number; p_method: string; p_reservation_id: string }
        Returns: undefined
      }
      redeem_promo_code: { Args: { p_id: string }; Returns: undefined }
      redeem_reward: {
        Args: { p_member_id: string; p_reward_id: string }
        Returns: number
      }
      reply_review: {
        Args: { p_reply: string; p_review_id: string }
        Returns: undefined
      }
      report_stays: {
        Args: { p_from: string; p_tenant?: string; p_to: string }
        Returns: Json
      }
      request_guest_cancellation: {
        Args: {
          p_category?: string
          p_id: string
          p_reason?: string
          p_token: string
        }
        Returns: string
      }
      review_author: { Args: { p_name: string }; Returns: string }
      revoke_mcp_token: { Args: { p_id: string }; Returns: undefined }
      room_busy_windows: {
        Args: { p_from: string; p_tenant: string; p_to: string }
        Returns: {
          end_at: string
          room_id: string
          start_at: string
        }[]
      }
      save_guest_identity: {
        Args: { p_customer_id: string; p_data: Json }
        Returns: undefined
      }
      seconds_since_sign_in: { Args: never; Returns: number }
      send_stay_message: {
        Args: {
          p_body: string
          p_category?: string
          p_reservation_id: string
          p_token: string
        }
        Returns: string
      }
      sign_guest_registration: {
        Args: {
          p_id: string
          p_signature_data: string
          p_signer: string
          p_token: string
        }
        Returns: undefined
      }
      submit_review: {
        Args: {
          p_comment?: string
          p_rating: number
          p_reservation_id: string
          p_scores?: Json
          p_token: string
        }
        Returns: string
      }
      tenant_feature: {
        Args: { p_feature: string; p_tenant: string }
        Returns: boolean
      }
      tenant_packages: {
        Args: { p_plan: string; p_settings: Json }
        Returns: string[]
      }
      tenant_storage_usage: {
        Args: never
        Returns: {
          bytes: number
          objects: number
          tenant_id: string
        }[]
      }
      upsert_payment_secret: {
        Args: { p_name: string; p_secret: string }
        Returns: undefined
      }
      validate_promo_code: {
        Args: { p_code: string; p_tenant: string }
        Returns: {
          code: string
          discount_type: string
          discount_value: number
          id: string
        }[]
      }
    }
    Enums: {
      cancellation_status: "pending" | "approved" | "rejected"
      dynamic_rule_type: "occupancy" | "date"
      extra_category:
        | "breakfast"
        | "parking"
        | "wellness"
        | "experiences"
        | "services"
      message_sender: "guest" | "staff" | "assistant" | "system"
      payment_provider: "redsys" | "stripe" | "desk"
      payment_status: "created" | "succeeded" | "failed" | "refunded"
      reservation_status:
        | "pending"
        | "confirmed"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "no_show"
        | "rejected"
      room_category: "room" | "suite" | "family"
      room_status: "available" | "occupied" | "cleaning" | "out_of_service"
      staff_role: "admin" | "reception" | "group"
      tenant_status: "trial" | "active" | "suspended"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      cancellation_status: ["pending", "approved", "rejected"],
      dynamic_rule_type: ["occupancy", "date"],
      extra_category: [
        "breakfast",
        "parking",
        "wellness",
        "experiences",
        "services",
      ],
      message_sender: ["guest", "staff", "assistant", "system"],
      payment_provider: ["redsys", "stripe", "desk"],
      payment_status: ["created", "succeeded", "failed", "refunded"],
      reservation_status: [
        "pending",
        "confirmed",
        "in_progress",
        "completed",
        "cancelled",
        "no_show",
        "rejected",
      ],
      room_category: ["room", "suite", "family"],
      room_status: ["available", "occupied", "cleaning", "out_of_service"],
      staff_role: ["admin", "reception", "group"],
      tenant_status: ["trial", "active", "suspended"],
    },
  },
} as const
