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
      booking_price_periods: {
        Row: {
          booking_id: string
          created_at: string
          end_date: string
          id: string
          price_month: number
          start_date: string
          updated_at: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          end_date: string
          id?: string
          price_month: number
          start_date: string
          updated_at?: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          end_date?: string
          id?: string
          price_month?: number
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_price_periods_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          client_id: string
          comment: string
          created_at: string
          deposit: number | null
          end_date: string
          id: string
          payment_day: number
          price_month: number | null
          price_type: Database["public"]["Enums"]["booking_price_type"]
          property_id: string
          source: Database["public"]["Enums"]["booking_source"] | null
          start_date: string
          status: Database["public"]["Enums"]["booking_status"]
          updated_at: string
        }
        Insert: {
          client_id: string
          comment?: string
          created_at?: string
          deposit?: number | null
          end_date: string
          id?: string
          payment_day?: number
          price_month?: number | null
          price_type?: Database["public"]["Enums"]["booking_price_type"]
          property_id: string
          source?: Database["public"]["Enums"]["booking_source"] | null
          start_date: string
          status?: Database["public"]["Enums"]["booking_status"]
          updated_at?: string
        }
        Update: {
          client_id?: string
          comment?: string
          created_at?: string
          deposit?: number | null
          end_date?: string
          id?: string
          payment_day?: number
          price_month?: number | null
          price_type?: Database["public"]["Enums"]["booking_price_type"]
          property_id?: string
          source?: Database["public"]["Enums"]["booking_source"] | null
          start_date?: string
          status?: Database["public"]["Enums"]["booking_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          body: string
          created_at: string
          direction: string
          id: string
          read_at: string | null
          thread_id: string
        }
        Insert: {
          body: string
          created_at?: string
          direction: string
          id?: string
          read_at?: string | null
          thread_id: string
        }
        Update: {
          body?: string
          created_at?: string
          direction?: string
          id?: string
          read_at?: string | null
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_threads: {
        Row: {
          created_at: string
          first_page: string
          id: string
          last_message_at: string
          last_visitor_message_at: string | null
          name: string
          phone: string
          status: string
          unread_count: number
          updated_at: string
          visitor_key: string
        }
        Insert: {
          created_at?: string
          first_page?: string
          id?: string
          last_message_at?: string
          last_visitor_message_at?: string | null
          name?: string
          phone?: string
          status?: string
          unread_count?: number
          updated_at?: string
          visitor_key: string
        }
        Update: {
          created_at?: string
          first_page?: string
          id?: string
          last_message_at?: string
          last_visitor_message_at?: string | null
          name?: string
          phone?: string
          status?: string
          unread_count?: number
          updated_at?: string
          visitor_key?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          blacklist_reason: string
          blacklisted: boolean
          comment: string
          created_at: string
          full_name: string
          id: string
          phone: string
          updated_at: string
        }
        Insert: {
          blacklist_reason?: string
          blacklisted?: boolean
          comment?: string
          created_at?: string
          full_name: string
          id?: string
          phone?: string
          updated_at?: string
        }
        Update: {
          blacklist_reason?: string
          blacklisted?: boolean
          comment?: string
          created_at?: string
          full_name?: string
          id?: string
          phone?: string
          updated_at?: string
        }
        Relationships: []
      }
      complexes: {
        Row: {
          created_at: string
          description: string
          id: string
          infrastructure: string[]
          location_description: string
          main_photo: string | null
          name: string
          photos: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          infrastructure?: string[]
          location_description?: string
          main_photo?: string | null
          name: string
          photos?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          infrastructure?: string[]
          location_description?: string
          main_photo?: string | null
          name?: string
          photos?: Json
          updated_at?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          created_at: string
          id: string
          message: string
          name: string
          phone: string
          source: string
          status: Database["public"]["Enums"]["lead_status"]
          topic: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string
          name: string
          phone?: string
          source?: string
          status?: Database["public"]["Enums"]["lead_status"]
          topic?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          name?: string
          phone?: string
          source?: string
          status?: Database["public"]["Enums"]["lead_status"]
          topic?: string
          updated_at?: string
        }
        Relationships: []
      }
      listing_messages: {
        Row: {
          author: string
          body: string
          created_at: string
          direction: string
          external_chat_id: string
          external_message_id: string
          id: string
          platform: Database["public"]["Enums"]["listing_platform"]
          property_id: string
          sent_at: string
        }
        Insert: {
          author?: string
          body?: string
          created_at?: string
          direction?: string
          external_chat_id?: string
          external_message_id?: string
          id?: string
          platform: Database["public"]["Enums"]["listing_platform"]
          property_id: string
          sent_at?: string
        }
        Update: {
          author?: string
          body?: string
          created_at?: string
          direction?: string
          external_chat_id?: string
          external_message_id?: string
          id?: string
          platform?: Database["public"]["Enums"]["listing_platform"]
          property_id?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_messages_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_stats: {
        Row: {
          calls: number
          contact_views: number
          created_at: string
          date: string
          favorites: number
          id: string
          impressions: number
          messages: number
          platform: Database["public"]["Enums"]["listing_platform"]
          property_id: string
          updated_at: string
          views: number
        }
        Insert: {
          calls?: number
          contact_views?: number
          created_at?: string
          date: string
          favorites?: number
          id?: string
          impressions?: number
          messages?: number
          platform: Database["public"]["Enums"]["listing_platform"]
          property_id: string
          updated_at?: string
          views?: number
        }
        Update: {
          calls?: number
          contact_views?: number
          created_at?: string
          date?: string
          favorites?: number
          id?: string
          impressions?: number
          messages?: number
          platform?: Database["public"]["Enums"]["listing_platform"]
          property_id?: string
          updated_at?: string
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "listing_stats_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_credentials: {
        Row: {
          account_id: string
          account_label: string
          auto_publish: boolean
          connected_at: string | null
          created_at: string
          id: string
          last_checked_at: string | null
          last_error: string
          platform: Database["public"]["Enums"]["listing_platform"]
          updated_at: string
        }
        Insert: {
          account_id?: string
          account_label?: string
          auto_publish?: boolean
          connected_at?: string | null
          created_at?: string
          id?: string
          last_checked_at?: string | null
          last_error?: string
          platform: Database["public"]["Enums"]["listing_platform"]
          updated_at?: string
        }
        Update: {
          account_id?: string
          account_label?: string
          auto_publish?: boolean
          connected_at?: string | null
          created_at?: string
          id?: string
          last_checked_at?: string | null
          last_error?: string
          platform?: Database["public"]["Enums"]["listing_platform"]
          updated_at?: string
        }
        Relationships: []
      }
      properties: {
        Row: {
          address: string
          appliances: string[]
          area: number | null
          availability_note: string
          bathroom_features: string[]
          bathrooms: number
          card_highlights: string[]
          commission: number | null
          complex_id: string | null
          complex_name: string
          created_at: string
          deposit: number | null
          description: string
          extra_features: string[]
          floor: number | null
          id: string
          internal_name: string
          land_area: number | null
          latitude: number | null
          location_description: string
          longitude: number | null
          management_fee_type: Database["public"]["Enums"]["management_fee_type"]
          management_fee_value: number | null
          outdoor_spaces: string[]
          photos: Json
          price_month: number | null
          published: boolean
          ref_id: number
          rent_terms: string
          rooms: number
          seasonal_pricing: boolean
          service_type: Database["public"]["Enums"]["property_service_type"]
          source_url: string | null
          status: Database["public"]["Enums"]["property_status"]
          summer_price_month: number | null
          title: string
          total_floors: number | null
          type: Database["public"]["Enums"]["property_type"]
          updated_at: string
          utilities_month: number | null
        }
        Insert: {
          address?: string
          appliances?: string[]
          area?: number | null
          availability_note?: string
          bathroom_features?: string[]
          bathrooms?: number
          card_highlights?: string[]
          commission?: number | null
          complex_id?: string | null
          complex_name?: string
          created_at?: string
          deposit?: number | null
          description?: string
          extra_features?: string[]
          floor?: number | null
          id?: string
          internal_name?: string
          land_area?: number | null
          latitude?: number | null
          location_description?: string
          longitude?: number | null
          management_fee_type?: Database["public"]["Enums"]["management_fee_type"]
          management_fee_value?: number | null
          outdoor_spaces?: string[]
          photos?: Json
          price_month?: number | null
          published?: boolean
          ref_id?: number
          rent_terms?: string
          rooms?: number
          seasonal_pricing?: boolean
          service_type?: Database["public"]["Enums"]["property_service_type"]
          source_url?: string | null
          status?: Database["public"]["Enums"]["property_status"]
          summer_price_month?: number | null
          title: string
          total_floors?: number | null
          type?: Database["public"]["Enums"]["property_type"]
          updated_at?: string
          utilities_month?: number | null
        }
        Update: {
          address?: string
          appliances?: string[]
          area?: number | null
          availability_note?: string
          bathroom_features?: string[]
          bathrooms?: number
          card_highlights?: string[]
          commission?: number | null
          complex_id?: string | null
          complex_name?: string
          created_at?: string
          deposit?: number | null
          description?: string
          extra_features?: string[]
          floor?: number | null
          id?: string
          internal_name?: string
          land_area?: number | null
          latitude?: number | null
          location_description?: string
          longitude?: number | null
          management_fee_type?: Database["public"]["Enums"]["management_fee_type"]
          management_fee_value?: number | null
          outdoor_spaces?: string[]
          photos?: Json
          price_month?: number | null
          published?: boolean
          ref_id?: number
          rent_terms?: string
          rooms?: number
          seasonal_pricing?: boolean
          service_type?: Database["public"]["Enums"]["property_service_type"]
          source_url?: string | null
          status?: Database["public"]["Enums"]["property_status"]
          summer_price_month?: number | null
          title?: string
          total_floors?: number | null
          type?: Database["public"]["Enums"]["property_type"]
          updated_at?: string
          utilities_month?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "properties_complex_id_fkey"
            columns: ["complex_id"]
            isOneToOne: false
            referencedRelation: "complexes"
            referencedColumns: ["id"]
          },
        ]
      }
      property_events: {
        Row: {
          event_type: Database["public"]["Enums"]["property_event_type"]
          id: string
          occurred_at: string
          property_id: string
          referrer: string
          source: string
          visitor_hash: string
        }
        Insert: {
          event_type: Database["public"]["Enums"]["property_event_type"]
          id?: string
          occurred_at?: string
          property_id: string
          referrer?: string
          source?: string
          visitor_hash?: string
        }
        Update: {
          event_type?: Database["public"]["Enums"]["property_event_type"]
          id?: string
          occurred_at?: string
          property_id?: string
          referrer?: string
          source?: string
          visitor_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_events_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_listings: {
        Row: {
          created_at: string
          external_id: string
          external_url: string
          id: string
          last_synced_at: string | null
          platform: Database["public"]["Enums"]["listing_platform"]
          property_id: string
          published: boolean
          published_at: string | null
          sync_error: string
          sync_status: string
          unpublished_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          external_id?: string
          external_url?: string
          id?: string
          last_synced_at?: string | null
          platform: Database["public"]["Enums"]["listing_platform"]
          property_id: string
          published?: boolean
          published_at?: string | null
          sync_error?: string
          sync_status?: string
          unpublished_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          external_id?: string
          external_url?: string
          id?: string
          last_synced_at?: string | null
          platform?: Database["public"]["Enums"]["listing_platform"]
          property_id?: string
          published?: boolean
          published_at?: string | null
          sync_error?: string
          sync_status?: string
          unpublished_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_listings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      rentals: {
        Row: {
          comment: string
          created_at: string
          end_date: string
          id: string
          property_id: string
          start_date: string
          status: Database["public"]["Enums"]["rental_status"]
          tenant_id: string | null
          tenant_name: string
          updated_at: string
        }
        Insert: {
          comment?: string
          created_at?: string
          end_date: string
          id?: string
          property_id: string
          start_date: string
          status?: Database["public"]["Enums"]["rental_status"]
          tenant_id?: string | null
          tenant_name?: string
          updated_at?: string
        }
        Update: {
          comment?: string
          created_at?: string
          end_date?: string
          id?: string
          property_id?: string
          start_date?: string
          status?: Database["public"]["Enums"]["rental_status"]
          tenant_id?: string | null
          tenant_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rentals_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      selection_items: {
        Row: {
          created_at: string
          id: string
          position: number
          property_id: string
          selection_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          position?: number
          property_id: string
          selection_id: string
        }
        Update: {
          created_at?: string
          id?: string
          position?: number
          property_id?: string
          selection_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "selection_items_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "selection_items_selection_id_fkey"
            columns: ["selection_id"]
            isOneToOne: false
            referencedRelation: "selections"
            referencedColumns: ["id"]
          },
        ]
      }
      selections: {
        Row: {
          client_name: string
          code: string
          comment: string
          created_at: string
          id: string
          name: string
          saved: boolean
          updated_at: string
        }
        Insert: {
          client_name?: string
          code: string
          comment?: string
          created_at?: string
          id?: string
          name?: string
          saved?: boolean
          updated_at?: string
        }
        Update: {
          client_name?: string
          code?: string
          comment?: string
          created_at?: string
          id?: string
          name?: string
          saved?: boolean
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      booking_price_type: "fixed" | "periodic"
      booking_source: "avito" | "cian" | "website" | "social" | "referral"
      booking_status: "active" | "cancelled" | "completed"
      lead_status: "new" | "in_work" | "done" | "rejected"
      listing_platform: "site" | "avito" | "cian"
      management_fee_type: "percent" | "amount"
      property_event_type:
        | "page_view"
        | "contact_click"
        | "lead_submit"
        | "selection_add"
      property_service_type: "management" | "commission_only"
      property_status: "free" | "rented" | "booked" | "archived"
      property_type: "apartment" | "aparts" | "house" | "villa" | "townhouse"
      rental_status: "booked" | "rented" | "blocked"
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
      booking_price_type: ["fixed", "periodic"],
      booking_source: ["avito", "cian", "website", "social", "referral"],
      booking_status: ["active", "cancelled", "completed"],
      lead_status: ["new", "in_work", "done", "rejected"],
      listing_platform: ["site", "avito", "cian"],
      management_fee_type: ["percent", "amount"],
      property_event_type: [
        "page_view",
        "contact_click",
        "lead_submit",
        "selection_add",
      ],
      property_service_type: ["management", "commission_only"],
      property_status: ["free", "rented", "booked", "archived"],
      property_type: ["apartment", "aparts", "house", "villa", "townhouse"],
      rental_status: ["booked", "rented", "blocked"],
    },
  },
} as const
