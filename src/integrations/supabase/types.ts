export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string;
          actor_id: string | null;
          detail: string | null;
          id: string;
          occurred_at: string;
          target_user_id: string | null;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          detail?: string | null;
          id?: string;
          occurred_at?: string;
          target_user_id?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          detail?: string | null;
          id?: string;
          occurred_at?: string;
          target_user_id?: string | null;
        };
        Relationships: [];
      };
      attendance_breaks: {
        Row: {
          attendance_log_id: string;
          break_end: string | null;
          break_start: string;
          created_at: string;
          id: string;
          user_id: string;
        };
        Insert: {
          attendance_log_id: string;
          break_end?: string | null;
          break_start?: string;
          created_at?: string;
          id?: string;
          user_id: string;
        };
        Update: {
          attendance_log_id?: string;
          break_end?: string | null;
          break_start?: string;
          created_at?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attendance_breaks_attendance_log_id_fkey";
            columns: ["attendance_log_id"];
            isOneToOne: false;
            referencedRelation: "attendance_logs";
            referencedColumns: ["id"];
          },
        ];
      };
      attendance_logs: {
        Row: {
          clock_in: string;
          clock_out: string | null;
          created_at: string;
          edit_note: string | null;
          edited_by: string | null;
          id: string;
          note: string | null;
          user_id: string;
        };
        Insert: {
          clock_in?: string;
          clock_out?: string | null;
          created_at?: string;
          edit_note?: string | null;
          edited_by?: string | null;
          id?: string;
          note?: string | null;
          user_id: string;
        };
        Update: {
          clock_in?: string;
          clock_out?: string | null;
          created_at?: string;
          edit_note?: string | null;
          edited_by?: string | null;
          id?: string;
          note?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      calendar_events: {
        Row: {
          created_at: string;
          created_by: string;
          description: string | null;
          end_time: string;
          id: string;
          start_time: string;
          title: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          description?: string | null;
          end_time: string;
          id?: string;
          start_time: string;
          title: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          description?: string | null;
          end_time?: string;
          id?: string;
          start_time?: string;
          title?: string;
        };
        Relationships: [];
      };
      event_attendees: {
        Row: {
          event_id: string;
          response: string;
          user_id: string;
        };
        Insert: {
          event_id: string;
          response?: string;
          user_id: string;
        };
        Update: {
          event_id?: string;
          response?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "event_attendees_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "calendar_events";
            referencedColumns: ["id"];
          },
        ];
      };
      holidays: {
        Row: {
          created_at: string;
          date: string;
          id: string;
          name: string;
        };
        Insert: {
          created_at?: string;
          date: string;
          id?: string;
          name: string;
        };
        Update: {
          created_at?: string;
          date?: string;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      leave_balances: {
        Row: {
          id: string;
          leave_type: Database["public"]["Enums"]["leave_type"];
          total_days: number;
          used_days: number;
          user_id: string;
        };
        Insert: {
          id?: string;
          leave_type: Database["public"]["Enums"]["leave_type"];
          total_days?: number;
          used_days?: number;
          user_id: string;
        };
        Update: {
          id?: string;
          leave_type?: Database["public"]["Enums"]["leave_type"];
          total_days?: number;
          used_days?: number;
          user_id?: string;
        };
        Relationships: [];
      };
      leave_requests: {
        Row: {
          created_at: string;
          end_date: string;
          id: string;
          is_bulk_schedule: boolean;
          is_emergency: boolean;
          leave_type: Database["public"]["Enums"]["leave_type"];
          medical_certificate_provided: boolean;
          reason: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          start_date: string;
          status: Database["public"]["Enums"]["leave_status"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          end_date: string;
          id?: string;
          is_bulk_schedule?: boolean;
          is_emergency?: boolean;
          leave_type: Database["public"]["Enums"]["leave_type"];
          medical_certificate_provided?: boolean;
          reason?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          start_date: string;
          status?: Database["public"]["Enums"]["leave_status"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          end_date?: string;
          id?: string;
          is_bulk_schedule?: boolean;
          is_emergency?: boolean;
          leave_type?: Database["public"]["Enums"]["leave_type"];
          medical_certificate_provided?: boolean;
          reason?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          start_date?: string;
          status?: Database["public"]["Enums"]["leave_status"];
          user_id?: string;
        };
        Relationships: [];
      };
      messages: {
        Row: {
          content: string;
          created_at: string;
          id: string;
          read_at: string | null;
          receiver_id: string;
          sender_id: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          id?: string;
          read_at?: string | null;
          receiver_id: string;
          sender_id: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          id?: string;
          read_at?: string | null;
          receiver_id?: string;
          sender_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          allowed_tabs: string[];
          avatar_url: string | null;
          created_at: string;
          current_task: string | null;
          department: string | null;
          email: string;
          full_name: string;
          id: string;
          outlook_connected: boolean;
          updated_at: string;
          work_days: number[];
          work_start_time: string;
        };
        Insert: {
          allowed_tabs?: string[];
          avatar_url?: string | null;
          created_at?: string;
          current_task?: string | null;
          department?: string | null;
          email: string;
          full_name?: string;
          id: string;
          outlook_connected?: boolean;
          updated_at?: string;
          work_days?: number[];
          work_start_time?: string;
        };
        Update: {
          allowed_tabs?: string[];
          avatar_url?: string | null;
          created_at?: string;
          current_task?: string | null;
          department?: string | null;
          email?: string;
          full_name?: string;
          id?: string;
          work_days?: number[];
          work_start_time?: string;
          outlook_connected?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      ticket_assignment_history: {
        Row: {
          changed_at: string;
          changed_by: string | null;
          from_user: string | null;
          id: string;
          ticket_id: string;
          to_user: string | null;
        };
        Insert: {
          changed_at?: string;
          changed_by?: string | null;
          from_user?: string | null;
          id?: string;
          ticket_id: string;
          to_user?: string | null;
        };
        Update: {
          changed_at?: string;
          changed_by?: string | null;
          from_user?: string | null;
          id?: string;
          ticket_id?: string;
          to_user?: string | null;
        };
        Relationships: [];
      };
      ticket_updates: {
        Row: {
          content: string;
          created_at: string;
          id: string;
          ticket_id: string;
          user_id: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          id?: string;
          ticket_id: string;
          user_id: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          id?: string;
          ticket_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ticket_updates_ticket_id_fkey";
            columns: ["ticket_id"];
            isOneToOne: false;
            referencedRelation: "tickets";
            referencedColumns: ["id"];
          },
        ];
      };
      tickets: {
        Row: {
          assigned_to: string | null;
          category: string | null;
          client: string | null;
          created_at: string;
          created_by: string;
          description: string | null;
          due_at: string | null;
          first_response_at: string | null;
          id: string;
          priority: Database["public"]["Enums"]["ticket_priority"];
          status: Database["public"]["Enums"]["ticket_status"];
          title: string;
          updated_at: string;
        };
        Insert: {
          assigned_to?: string | null;
          category?: string | null;
          client?: string | null;
          created_at?: string;
          created_by: string;
          description?: string | null;
          due_at?: string | null;
          first_response_at?: string | null;
          id?: string;
          priority?: Database["public"]["Enums"]["ticket_priority"];
          status?: Database["public"]["Enums"]["ticket_status"];
          title: string;
          updated_at?: string;
        };
        Update: {
          assigned_to?: string | null;
          category?: string | null;
          client?: string | null;
          created_at?: string;
          created_by?: string;
          description?: string | null;
          due_at?: string | null;
          first_response_at?: string | null;
          id?: string;
          priority?: Database["public"]["Enums"]["ticket_priority"];
          status?: Database["public"]["Enums"]["ticket_status"];
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      telegram_config: {
        Row: {
          bot_token: string | null;
          ceo_chat_id: string | null;
          id: string;
          link_code: string | null;
          link_code_expires_at: string | null;
          updated_at: string;
        };
        Insert: {
          bot_token?: string | null;
          ceo_chat_id?: string | null;
          id?: string;
          link_code?: string | null;
          link_code_expires_at?: string | null;
          updated_at?: string;
        };
        Update: {
          bot_token?: string | null;
          ceo_chat_id?: string | null;
          id?: string;
          link_code?: string | null;
          link_code_expires_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
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
      get_profiles_directory: {
        Args: never;
        Returns: {
          current_task: string;
          department: string;
          full_name: string;
          id: string;
        }[];
      };
      get_active_today: {
        Args: Record<string, never>;
        Returns: {
          user_id: string;
          full_name: string;
          status: string;
        }[];
      };
      get_team_leave: {
        Args: {
          from_date: string;
          to_date: string;
        };
        Returns: {
          id: string;
          user_id: string;
          full_name: string;
          leave_type: Database["public"]["Enums"]["leave_type"];
          start_date: string;
          end_date: string;
        }[];
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_event_participant: {
        Args: { _event_id: string; _user_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      app_role: "admin" | "consultant" | "ceo";
      leave_status: "pending" | "approved" | "rejected";
      leave_type:
        | "vacation"
        | "sick"
        | "personal"
        | "birthday"
        | "maternity"
        | "paternity"
        | "lieu"
        | "solo_parent";
      ticket_priority: "low" | "medium" | "high" | "urgent";
      ticket_status: "open" | "in_progress" | "done" | "waiting_client";
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "consultant", "ceo"],
      leave_status: ["pending", "approved", "rejected"],
      leave_type: [
        "vacation",
        "sick",
        "personal",
        "birthday",
        "maternity",
        "paternity",
        "lieu",
        "solo_parent",
      ],
      ticket_priority: ["low", "medium", "high", "urgent"],
      ticket_status: ["open", "in_progress", "done", "waiting_client"],
    },
  },
} as const;
