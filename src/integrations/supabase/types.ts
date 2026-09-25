export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string;
          at: string;
          entity: string;
          entity_id: string | null;
          id: string;
          payload: Json | null;
          user_id: string | null;
        };
        Insert: {
          action: string;
          at?: string;
          entity: string;
          entity_id?: string | null;
          id?: string;
          payload?: Json | null;
          user_id?: string | null;
        };
        Update: {
          action?: string;
          at?: string;
          entity?: string;
          entity_id?: string | null;
          id?: string;
          payload?: Json | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      customers: {
        Row: {
          created_at: string;
          email: string | null;
          id: string;
          name: string | null;
          no_contact: boolean;
          notes: string | null;
          phone: string | null;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          id?: string;
          name?: string | null;
          no_contact?: boolean;
          notes?: string | null;
          phone?: string | null;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          id?: string;
          name?: string | null;
          no_contact?: boolean;
          notes?: string | null;
          phone?: string | null;
        };
        Relationships: [];
      };
      dynamic_rules: {
        Row: {
          active: boolean;
          config: Json;
          created_at: string;
          id: string;
          multiplier: number | null;
          name: string;
          type: Database["public"]["Enums"]["dynamic_rule_type"];
        };
        Insert: {
          active?: boolean;
          config?: Json;
          created_at?: string;
          id?: string;
          multiplier?: number | null;
          name: string;
          type: Database["public"]["Enums"]["dynamic_rule_type"];
        };
        Update: {
          active?: boolean;
          config?: Json;
          created_at?: string;
          id?: string;
          multiplier?: number | null;
          name?: string;
          type?: Database["public"]["Enums"]["dynamic_rule_type"];
        };
        Relationships: [];
      };
      extras: {
        Row: {
          active: boolean;
          category: Database["public"]["Enums"]["extra_category"];
          created_at: string;
          description: string | null;
          id: string;
          image_url: string | null;
          name: string;
          price: number;
          sort_order: number;
        };
        Insert: {
          active?: boolean;
          category: Database["public"]["Enums"]["extra_category"];
          created_at?: string;
          description?: string | null;
          id?: string;
          image_url?: string | null;
          name: string;
          price: number;
          sort_order?: number;
        };
        Update: {
          active?: boolean;
          category?: Database["public"]["Enums"]["extra_category"];
          created_at?: string;
          description?: string | null;
          id?: string;
          image_url?: string | null;
          name?: string;
          price?: number;
          sort_order?: number;
        };
        Relationships: [];
      };
      gift_thresholds: {
        Row: {
          active: boolean;
          gift_extra_id: string;
          id: string;
          min_extras_total: number;
        };
        Insert: {
          active?: boolean;
          gift_extra_id: string;
          id?: string;
          min_extras_total: number;
        };
        Update: {
          active?: boolean;
          gift_extra_id?: string;
          id?: string;
          min_extras_total?: number;
        };
        Relationships: [
          {
            foreignKeyName: "gift_thresholds_gift_extra_id_fkey";
            columns: ["gift_extra_id"];
            isOneToOne: false;
            referencedRelation: "extras";
            referencedColumns: ["id"];
          },
        ];
      };
      promo_codes: {
        Row: {
          active: boolean;
          archived: boolean;
          code: string;
          created_at: string;
          discount_type: string;
          discount_value: number;
          id: string;
          max_uses: number | null;
          single_use: boolean;
          times_used: number;
          valid_from: string;
          valid_until: string | null;
        };
        Insert: {
          active?: boolean;
          archived?: boolean;
          code: string;
          created_at?: string;
          discount_type: string;
          discount_value: number;
          id?: string;
          max_uses?: number | null;
          single_use?: boolean;
          times_used?: number;
          valid_from?: string;
          valid_until?: string | null;
        };
        Update: {
          active?: boolean;
          archived?: boolean;
          code?: string;
          created_at?: string;
          discount_type?: string;
          discount_value?: number;
          id?: string;
          max_uses?: number | null;
          single_use?: boolean;
          times_used?: number;
          valid_from?: string;
          valid_until?: string | null;
        };
        Relationships: [];
      };
      rate_groups: {
        Row: {
          created_at: string;
          id: string;
          name: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      rate_nightly: {
        Row: {
          id: string;
          price: number;
          rate_group_id: string;
          weekend_price: number | null;
        };
        Insert: {
          id?: string;
          price: number;
          rate_group_id: string;
          weekend_price?: number | null;
        };
        Update: {
          id?: string;
          price?: number;
          rate_group_id?: string;
          weekend_price?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "rate_nightly_rate_group_id_fkey";
            columns: ["rate_group_id"];
            isOneToOne: false;
            referencedRelation: "rate_groups";
            referencedColumns: ["id"];
          },
        ];
      };
      reservation_extras: {
        Row: {
          created_at: string;
          extra_id: string;
          id: string;
          is_gift: boolean;
          qty: number;
          reservation_id: string;
          unit_price: number;
        };
        Insert: {
          created_at?: string;
          extra_id: string;
          id?: string;
          is_gift?: boolean;
          qty?: number;
          reservation_id: string;
          unit_price: number;
        };
        Update: {
          created_at?: string;
          extra_id?: string;
          id?: string;
          is_gift?: boolean;
          qty?: number;
          reservation_id?: string;
          unit_price?: number;
        };
        Relationships: [
          {
            foreignKeyName: "reservation_extras_extra_id_fkey";
            columns: ["extra_id"];
            isOneToOne: false;
            referencedRelation: "extras";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reservation_extras_reservation_id_fkey";
            columns: ["reservation_id"];
            isOneToOne: false;
            referencedRelation: "reservations";
            referencedColumns: ["id"];
          },
        ];
      };
      reservations: {
        Row: {
          base_price: number;
          cleaning_minutes: number;
          created_at: string;
          created_by: string | null;
          created_by_role: string | null;
          customer_id: string | null;
          deposit_amount: number;
          deposit_paid: boolean;
          dynamic_reason: string | null;
          dynamic_surcharge: number;
          end_at: string;
          extras_total: number;
          id: string;
          internal_notes: string | null;
          manual_override: boolean;
          paid_amount: number;
          people: number;
          room_id: string;
          start_at: string;
          status: Database["public"]["Enums"]["reservation_status"];
          redsys_order: string | null;
          total: number;
          updated_at: string;
        };
        Insert: {
          base_price?: number;
          cleaning_minutes?: number;
          created_at?: string;
          created_by?: string | null;
          created_by_role?: string | null;
          customer_id?: string | null;
          deposit_amount?: number;
          deposit_paid?: boolean;
          dynamic_reason?: string | null;
          dynamic_surcharge?: number;
          end_at: string;
          extras_total?: number;
          id?: string;
          internal_notes?: string | null;
          manual_override?: boolean;
          paid_amount?: number;
          people?: number;
          room_id: string;
          start_at: string;
          status?: Database["public"]["Enums"]["reservation_status"];
          redsys_order?: string | null;
          total?: number;
          updated_at?: string;
        };
        Update: {
          base_price?: number;
          cleaning_minutes?: number;
          created_at?: string;
          created_by?: string | null;
          created_by_role?: string | null;
          customer_id?: string | null;
          deposit_amount?: number;
          deposit_paid?: boolean;
          dynamic_reason?: string | null;
          dynamic_surcharge?: number;
          end_at?: string;
          extras_total?: number;
          id?: string;
          internal_notes?: string | null;
          manual_override?: boolean;
          paid_amount?: number;
          people?: number;
          room_id?: string;
          start_at?: string;
          status?: Database["public"]["Enums"]["reservation_status"];
          redsys_order?: string | null;
          total?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reservations_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reservations_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "rooms";
            referencedColumns: ["id"];
          },
        ];
      };
      rooms: {
        Row: {
          active: boolean;
          building: string;
          capacity: number;
          created_at: string;
          description: string | null;
          has_tv: boolean;
          id: string;
          image_url: string | null;
          name: string;
          rate_group_id: string | null;
          sort_order: number;
          status: Database["public"]["Enums"]["room_status"];
        };
        Insert: {
          active?: boolean;
          building: string;
          capacity?: number;
          created_at?: string;
          description?: string | null;
          has_tv?: boolean;
          id?: string;
          image_url?: string | null;
          name: string;
          rate_group_id?: string | null;
          sort_order?: number;
          status?: Database["public"]["Enums"]["room_status"];
        };
        Update: {
          active?: boolean;
          building?: string;
          capacity?: number;
          created_at?: string;
          description?: string | null;
          has_tv?: boolean;
          id?: string;
          image_url?: string | null;
          name?: string;
          rate_group_id?: string | null;
          sort_order?: number;
          status?: Database["public"]["Enums"]["room_status"];
        };
        Relationships: [
          {
            foreignKeyName: "rooms_rate_group_id_fkey";
            columns: ["rate_group_id"];
            isOneToOne: false;
            referencedRelation: "rate_groups";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      extend_cleaning_and_shift: {
        Args: {
          p_reservation_id: string;
          p_cleaning_minutes: number;
        };
        Returns: number;
      };
      archive_expired_promo_codes: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
    };
    Enums: {
      app_role: "admin" | "reception" | "customer";
      dynamic_rule_type: "occupancy" | "date";
      extra_category: "breakfast" | "parking" | "wellness" | "experiences" | "services";
      reservation_status:
        | "confirmed"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "no_show"
        | "pending"
        | "rejected";
      room_status: "available" | "occupied" | "cleaning" | "out_of_service";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "reception", "customer"],
      dynamic_rule_type: ["occupancy", "date"],
      extra_category: ["breakfast", "parking", "wellness", "experiences", "services"],
      reservation_status: [
        "confirmed",
        "in_progress",
        "completed",
        "cancelled",
        "no_show",
        "pending",
        "rejected",
      ],
      room_status: ["available", "occupied", "cleaning", "out_of_service"],
    },
  },
} as const;
