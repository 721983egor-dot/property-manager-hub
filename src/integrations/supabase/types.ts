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
      properties: {
        Row: {
          address: string
          appliances: string[]
          area: number | null
          bathroom_features: string[]
          bathrooms: number
          commission: number | null
          complex_id: string | null
          complex_name: string
          created_at: string
          deposit: number | null
          description: string
          extra_features: string[]
          floor: number | null
          id: string
          location_description: string
          outdoor_spaces: string[]
          photos: Json
          price_month: number | null
          ref_id: number
          rent_terms: string
          rooms: number
          seasonal_pricing: boolean
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
          bathroom_features?: string[]
          bathrooms?: number
          commission?: number | null
          complex_id?: string | null
          complex_name?: string
          created_at?: string
          deposit?: number | null
          description?: string
          extra_features?: string[]
          floor?: number | null
          id?: string
          location_description?: string
          outdoor_spaces?: string[]
          photos?: Json
          price_month?: number | null
          ref_id?: number
          rent_terms?: string
          rooms?: number
          seasonal_pricing?: boolean
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
          bathroom_features?: string[]
          bathrooms?: number
          commission?: number | null
          complex_id?: string | null
          complex_name?: string
          created_at?: string
          deposit?: number | null
          description?: string
          extra_features?: string[]
          floor?: number | null
          id?: string
          location_description?: string
          outdoor_spaces?: string[]
          photos?: Json
          price_month?: number | null
          ref_id?: number
          rent_terms?: string
          rooms?: number
          seasonal_pricing?: boolean
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      property_status: "free" | "rented" | "booked" | "archived"
      property_type: "apartment" | "aparts" | "house" | "villa" | "townhouse"
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
      property_status: ["free", "rented", "booked", "archived"],
      property_type: ["apartment", "aparts", "house", "villa", "townhouse"],
    },
  },
} as const
