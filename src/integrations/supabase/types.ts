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
      agent_runs: {
        Row: {
          channel: string
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
          cancellation_reason: string | null
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
          extras_total: number
          hold_expires_at: string | null
          id: string
          internal_notes: string | null
          is_prebooking: boolean
          manual_override: boolean
          member_id: string | null
          paid_amount: number
          people: number
          promo_code_id: string | null
          property_id: string | null
          redsys_order: string | null
          room_id: string
          start_at: string
          status: Database["public"]["Enums"]["reservation_status"]
          tenant_id: string
          total: number
          updated_at: string
        }
        Insert: {
          access_token_hash?: string | null
          base_price?: number
          cancellation_reason?: string | null
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
          extras_total?: number
          hold_expires_at?: string | null
          id?: string
          internal_notes?: string | null
          is_prebooking?: boolean
          manual_override?: boolean
          member_id?: string | null
          paid_amount?: number
          people?: number
          promo_code_id?: string | null
          property_id?: string | null
          redsys_order?: string | null
          room_id: string
          start_at: string
          status?: Database["public"]["Enums"]["reservation_status"]
          tenant_id?: string
          total?: number
          updated_at?: string
        }
        Update: {
          access_token_hash?: string | null
          base_price?: number
          cancellation_reason?: string | null
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
          extras_total?: number
          hold_expires_at?: string | null
          id?: string
          internal_notes?: string | null
          is_prebooking?: boolean
          manual_override?: boolean
          member_id?: string | null
          paid_amount?: number
          people?: number
          promo_code_id?: string | null
          property_id?: string | null
          redsys_order?: string | null
          room_id?: string
          start_at?: string
          status?: Database["public"]["Enums"]["reservation_status"]
          tenant_id?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
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
      cancel_guest_booking: {
        Args: { p_id: string; p_token: string }
        Returns: undefined
      }
      cancel_my_reservation: {
        Args: { p_reservation_id: string }
        Returns: undefined
      }
      cancel_stale_pending_reservations: { Args: never; Returns: number }
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
      current_tenant_id: { Args: never; Returns: string }
      extend_cleaning_and_shift: {
        Args: { p_cleaning_minutes: number; p_reservation_id: string }
        Returns: number
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
      get_guest_booking: {
        Args: { p_id: string; p_token: string }
        Returns: Json
      }
      get_payment_secret: { Args: { p_name: string }; Returns: string }
      guest_booking_row: {
        Args: { p_id: string; p_token: string }
        Returns: {
          access_token_hash: string | null
          base_price: number
          cancellation_reason: string | null
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
          extras_total: number
          hold_expires_at: string | null
          id: string
          internal_notes: string | null
          is_prebooking: boolean
          manual_override: boolean
          member_id: string | null
          paid_amount: number
          people: number
          promo_code_id: string | null
          property_id: string | null
          redsys_order: string | null
          room_id: string
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
      is_member_user: {
        Args: { p_member: string; p_tenant: string }
        Returns: boolean
      }
      is_tenant_member: { Args: { p_tenant: string }; Returns: boolean }
      redeem_promo_code: { Args: { p_id: string }; Returns: undefined }
      redeem_reward: {
        Args: { p_member_id: string; p_reward_id: string }
        Returns: number
      }
      room_busy_windows: {
        Args: { p_from: string; p_tenant: string; p_to: string }
        Returns: {
          end_at: string
          room_id: string
          start_at: string
        }[]
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
      dynamic_rule_type: "occupancy" | "date"
      extra_category:
        | "breakfast"
        | "parking"
        | "wellness"
        | "experiences"
        | "services"
      payment_provider: "redsys" | "stripe"
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
      staff_role: "admin" | "reception"
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
      dynamic_rule_type: ["occupancy", "date"],
      extra_category: [
        "breakfast",
        "parking",
        "wellness",
        "experiences",
        "services",
      ],
      payment_provider: ["redsys", "stripe"],
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
      staff_role: ["admin", "reception"],
      tenant_status: ["trial", "active", "suspended"],
    },
  },
} as const
