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
      activity_log: {
        Row: {
          action: string
          actor_email: string
          actor_id: string | null
          changes: Json
          created_at: string
          id: string
          record_id: string | null
          source: string
          summary: string
          table_name: string
        }
        Insert: {
          action: string
          actor_email?: string
          actor_id?: string | null
          changes?: Json
          created_at?: string
          id?: string
          record_id?: string | null
          source?: string
          summary?: string
          table_name: string
        }
        Update: {
          action?: string
          actor_email?: string
          actor_id?: string | null
          changes?: Json
          created_at?: string
          id?: string
          record_id?: string | null
          source?: string
          summary?: string
          table_name?: string
        }
        Relationships: []
      }
      ai_action_proposals: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          id: string
          input: Json
          result: string
          status: string
          summary: string
          tool_name: string
          updated_at: string
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          input?: Json
          result?: string
          status?: string
          summary?: string
          tool_name: string
          updated_at?: string
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          input?: Json
          result?: string
          status?: string
          summary?: string
          tool_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      assistant_messages: {
        Row: {
          actions: Json
          content: string
          created_at: string
          id: string
          role: string
          user_id: string | null
        }
        Insert: {
          actions?: Json
          content?: string
          created_at?: string
          id?: string
          role: string
          user_id?: string | null
        }
        Update: {
          actions?: Json
          content?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string | null
        }
        Relationships: []
      }
      assistant_skills: {
        Row: {
          active: boolean
          created_at: string
          created_by: string
          id: string
          text: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string
          id?: string
          text: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string
          id?: string
          text?: string
          updated_at?: string
        }
        Relationships: []
      }
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
          show_in_site_filter: boolean
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
          show_in_site_filter?: boolean
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
          show_in_site_filter?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      deal_comments: {
        Row: {
          author_id: string | null
          author_name: string
          body: string
          created_at: string
          deal_id: string
          id: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          author_name?: string
          body?: string
          created_at?: string
          deal_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          author_name?: string
          body?: string
          created_at?: string
          deal_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_comments_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_fields: {
        Row: {
          archived: boolean
          created_at: string
          field_type: string
          id: string
          key: string
          label: string
          options: string[]
          position: number
          show_in_card: boolean
          updated_at: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          field_type?: string
          id?: string
          key: string
          label: string
          options?: string[]
          position?: number
          show_in_card?: boolean
          updated_at?: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          field_type?: string
          id?: string
          key?: string
          label?: string
          options?: string[]
          position?: number
          show_in_card?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      deal_showings: {
        Row: {
          author_id: string | null
          author_name: string
          created_at: string
          deal_id: string
          id: string
          note: string
          property_id: string
          shown_at: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          author_name?: string
          created_at?: string
          deal_id: string
          id?: string
          note?: string
          property_id: string
          shown_at?: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          author_name?: string
          created_at?: string
          deal_id?: string
          id?: string
          note?: string
          property_id?: string
          shown_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_showings_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_showings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_stages: {
        Row: {
          color: string
          created_at: string
          id: string
          kind: string
          name: string
          position: number
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          kind?: string
          name: string
          position?: number
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          kind?: string
          name?: string
          position?: number
          updated_at?: string
        }
        Relationships: []
      }
      deals: {
        Row: {
          adults: number
          budget: number | null
          children: number
          client_id: string | null
          closed_property_id: string | null
          comment: string
          commission: number | null
          created_at: string
          custom: Json
          deposit: number | null
          end_date: string | null
          id: string
          lead_id: string | null
          payment_day: number | null
          position: number
          price_month: number | null
          property_id: string | null
          responsible_id: string | null
          source: string
          stage_id: string
          start_date: string | null
          title: string
          updated_at: string
        }
        Insert: {
          adults?: number
          budget?: number | null
          children?: number
          client_id?: string | null
          closed_property_id?: string | null
          comment?: string
          commission?: number | null
          created_at?: string
          custom?: Json
          deposit?: number | null
          end_date?: string | null
          id?: string
          lead_id?: string | null
          payment_day?: number | null
          position?: number
          price_month?: number | null
          property_id?: string | null
          responsible_id?: string | null
          source?: string
          stage_id: string
          start_date?: string | null
          title?: string
          updated_at?: string
        }
        Update: {
          adults?: number
          budget?: number | null
          children?: number
          client_id?: string | null
          closed_property_id?: string | null
          comment?: string
          commission?: number | null
          created_at?: string
          custom?: Json
          deposit?: number | null
          end_date?: string | null
          id?: string
          lead_id?: string | null
          payment_day?: number | null
          position?: number
          price_month?: number | null
          property_id?: string | null
          responsible_id?: string | null
          source?: string
          stage_id?: string
          start_date?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_closed_property_id_fkey"
            columns: ["closed_property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "deal_stages"
            referencedColumns: ["id"]
          },
        ]
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
      platform_secrets: {
        Row: {
          name: string
          updated_at: string
          value: string
        }
        Insert: {
          name: string
          updated_at?: string
          value?: string
        }
        Update: {
          name?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          birth_date: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          phone: string
          photo_path: string
          updated_at: string
        }
        Insert: {
          birth_date?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id: string
          phone?: string
          photo_path?: string
          updated_at?: string
        }
        Update: {
          birth_date?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          phone?: string
          photo_path?: string
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
          beds_count: number | null
          card_highlights: string[]
          cian_jk_id: number | null
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
          is_apartments: boolean | null
          land_area: number | null
          land_status: string
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
          repair_type: string
          rooms: number
          seasonal_pricing: boolean
          service_type: Database["public"]["Enums"]["property_service_type"]
          sort_order: number | null
          source_url: string | null
          status: Database["public"]["Enums"]["property_status"]
          summer_price_month: number | null
          title: string
          total_floors: number | null
          type: Database["public"]["Enums"]["property_type"]
          updated_at: string
          utilities_month: number | null
          wc_location_type: string
        }
        Insert: {
          address?: string
          appliances?: string[]
          area?: number | null
          availability_note?: string
          bathroom_features?: string[]
          bathrooms?: number
          beds_count?: number | null
          card_highlights?: string[]
          cian_jk_id?: number | null
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
          is_apartments?: boolean | null
          land_area?: number | null
          land_status?: string
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
          repair_type?: string
          rooms?: number
          seasonal_pricing?: boolean
          service_type?: Database["public"]["Enums"]["property_service_type"]
          sort_order?: number | null
          source_url?: string | null
          status?: Database["public"]["Enums"]["property_status"]
          summer_price_month?: number | null
          title: string
          total_floors?: number | null
          type?: Database["public"]["Enums"]["property_type"]
          updated_at?: string
          utilities_month?: number | null
          wc_location_type?: string
        }
        Update: {
          address?: string
          appliances?: string[]
          area?: number | null
          availability_note?: string
          bathroom_features?: string[]
          bathrooms?: number
          beds_count?: number | null
          card_highlights?: string[]
          cian_jk_id?: number | null
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
          is_apartments?: boolean | null
          land_area?: number | null
          land_status?: string
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
          repair_type?: string
          rooms?: number
          seasonal_pricing?: boolean
          service_type?: Database["public"]["Enums"]["property_service_type"]
          sort_order?: number | null
          source_url?: string | null
          status?: Database["public"]["Enums"]["property_status"]
          summer_price_month?: number | null
          title?: string
          total_floors?: number | null
          type?: Database["public"]["Enums"]["property_type"]
          updated_at?: string
          utilities_month?: number | null
          wc_location_type?: string
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
      telegram_accounts: {
        Row: {
          active: boolean
          chat_id: number
          created_at: string
          display_name: string
          id: string
          last_seen_at: string | null
          telegram_user_id: number
          updated_at: string
          user_id: string | null
          username: string
        }
        Insert: {
          active?: boolean
          chat_id: number
          created_at?: string
          display_name?: string
          id?: string
          last_seen_at?: string | null
          telegram_user_id: number
          updated_at?: string
          user_id?: string | null
          username?: string
        }
        Update: {
          active?: boolean
          chat_id?: number
          created_at?: string
          display_name?: string
          id?: string
          last_seen_at?: string | null
          telegram_user_id?: number
          updated_at?: string
          user_id?: string | null
          username?: string
        }
        Relationships: []
      }
      telegram_link_codes: {
        Row: {
          code: string
          created_at: string
          created_by_email: string
          expires_at: string
          used_at: string | null
          used_by_telegram_id: number | null
          user_id: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by_email?: string
          expires_at: string
          used_at?: string | null
          used_by_telegram_id?: number | null
          user_id?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by_email?: string
          expires_at?: string
          used_at?: string | null
          used_by_telegram_id?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      telegram_messages: {
        Row: {
          chat_id: number
          content: string
          created_at: string
          id: string
          role: string
          transcript: string
        }
        Insert: {
          chat_id: number
          content?: string
          created_at?: string
          id?: string
          role: string
          transcript?: string
        }
        Update: {
          chat_id?: number
          content?: string
          created_at?: string
          id?: string
          role?: string
          transcript?: string
        }
        Relationships: []
      }
      telegram_updates: {
        Row: {
          created_at: string
          update_id: number
        }
        Insert: {
          created_at?: string
          update_id: number
        }
        Update: {
          created_at?: string
          update_id?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "manager"
      booking_price_type: "fixed" | "periodic"
      booking_source: "avito" | "cian" | "website" | "social" | "referral"
      booking_status: "active" | "cancelled" | "completed"
      lead_status: "new" | "in_work" | "done" | "rejected"
      listing_platform: "site" | "avito" | "cian" | "yandex"
      management_fee_type: "percent" | "amount"
      property_event_type:
        | "page_view"
        | "contact_click"
        | "lead_submit"
        | "selection_add"
      property_service_type: "management" | "commission_only"
      property_status: "free" | "rented" | "booked" | "archived" | "soon_free"
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
      app_role: ["admin", "manager"],
      booking_price_type: ["fixed", "periodic"],
      booking_source: ["avito", "cian", "website", "social", "referral"],
      booking_status: ["active", "cancelled", "completed"],
      lead_status: ["new", "in_work", "done", "rejected"],
      listing_platform: ["site", "avito", "cian", "yandex"],
      management_fee_type: ["percent", "amount"],
      property_event_type: [
        "page_view",
        "contact_click",
        "lead_submit",
        "selection_add",
      ],
      property_service_type: ["management", "commission_only"],
      property_status: ["free", "rented", "booked", "archived", "soon_free"],
      property_type: ["apartment", "aparts", "house", "villa", "townhouse"],
      rental_status: ["booked", "rented", "blocked"],
    },
  },
} as const
