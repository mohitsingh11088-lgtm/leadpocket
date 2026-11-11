export type LeadStage = "New" | "Qualified" | "Meeting" | "Proposal" | "Won";
export type LeadSourceChannel =
  | "manual"
  | "website"
  | "whatsapp"
  | "facebook_lead_ads"
  | "instagram"
  | "google_forms"
  | "email"
  | "phone";
export type IntegrationProvider = Exclude<LeadSourceChannel, "manual">;
export type IntegrationStatus = "connected" | "disconnected" | "needs_attention";

export type WebsiteFormField = {
  key: "name" | "email" | "phone" | "company" | "enquiry";
  label: string;
  required: boolean;
};

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      activities: {
        Row: {
          id: string;
          user_id: string;
          lead_id: string;
          activity_type: "call" | "meeting" | "note" | "reminder" | "whatsapp_message";
          title: string;
          details: string;
          occurred_at: string;
          source_connection_id: string | null;
          external_event_id: string | null;
          content_expires_at: string | null;
          content_redacted_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          lead_id: string;
          activity_type: "call" | "meeting" | "note" | "reminder" | "whatsapp_message";
          title: string;
          details?: string;
          occurred_at?: string;
          source_connection_id?: string | null;
          external_event_id?: string | null;
          content_expires_at?: string | null;
          content_redacted_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          lead_id?: string;
          activity_type?: "call" | "meeting" | "note" | "reminder" | "whatsapp_message";
          title?: string;
          details?: string;
          occurred_at?: string;
          source_connection_id?: string | null;
          external_event_id?: string | null;
          content_expires_at?: string | null;
          content_redacted_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      integration_connections: {
        Row: {
          id: string;
          user_id: string;
          provider: IntegrationProvider;
          status: IntegrationStatus;
          display_name: string;
          metadata: Json;
          last_success_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          provider: IntegrationProvider;
          status?: IntegrationStatus;
          display_name?: string;
          metadata?: Json;
          last_success_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          provider?: IntegrationProvider;
          status?: IntegrationStatus;
          display_name?: string;
          metadata?: Json;
          last_success_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      integration_webhook_credentials: {
        Row: {
          id: string;
          connection_id: string;
          user_id: string;
          credential_hash: string;
          created_at: string;
          last_used_at: string | null;
          revoked_at: string | null;
        };
        Insert: {
          id?: string;
          connection_id: string;
          user_id: string;
          credential_hash: string;
          created_at?: string;
          last_used_at?: string | null;
          revoked_at?: string | null;
        };
        Update: {
          id?: string;
          connection_id?: string;
          user_id?: string;
          credential_hash?: string;
          created_at?: string;
          last_used_at?: string | null;
          revoked_at?: string | null;
        };
        Relationships: [];
      };
      integration_webhook_rate_limits: {
        Row: {
          window_start: string;
          scope_hash: string;
          submission_count: number;
        };
        Insert: {
          window_start: string;
          scope_hash: string;
          submission_count?: number;
        };
        Update: {
          window_start?: string;
          scope_hash?: string;
          submission_count?: number;
        };
        Relationships: [];
      };
      leads: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          company: string;
          email: string;
          phone: string;
          source: string;
          stage: LeadStage;
          amount: number;
          enquiry: string;
          source_channel: LeadSourceChannel;
          source_connection_id: string | null;
          source_form_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          name: string;
          company?: string;
          email?: string;
          phone?: string;
          source?: string;
          stage?: LeadStage;
          amount?: number;
          enquiry?: string;
          source_channel?: LeadSourceChannel;
          source_connection_id?: string | null;
          source_form_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          company?: string;
          email?: string;
          phone?: string;
          source?: string;
          stage?: LeadStage;
          amount?: number;
          enquiry?: string;
          source_channel?: LeadSourceChannel;
          source_connection_id?: string | null;
          source_form_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      whatsapp_accounts: {
        Row: {
          id: string;
          connection_id: string;
          user_id: string;
          waba_id: string;
          phone_number_id: string;
          display_phone_number: string;
          last_message_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          connection_id: string;
          user_id: string;
          waba_id: string;
          phone_number_id: string;
          display_phone_number?: string;
          last_message_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          connection_id?: string;
          user_id?: string;
          waba_id?: string;
          phone_number_id?: string;
          display_phone_number?: string;
          last_message_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      website_forms: {
        Row: {
          id: string;
          user_id: string;
          connection_id: string;
          public_id: string;
          title: string;
          fields: Json;
          source_channel: "website" | "whatsapp";
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          connection_id: string;
          public_id?: string;
          title?: string;
          fields?: Json;
          source_channel?: "website" | "whatsapp";
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          connection_id?: string;
          public_id?: string;
          title?: string;
          fields?: Json;
          source_channel?: "website" | "whatsapp";
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      whatsapp_click_to_chat_settings: {
        Row: {
          user_id: string;
          phone_number: string;
          default_message: string;
          capture_form_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          phone_number: string;
          default_message?: string;
          capture_form_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          phone_number?: string;
          default_message?: string;
          capture_form_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      webhook_events: {
        Row: {
          id: string;
          user_id: string;
          source_channel: Exclude<LeadSourceChannel, "manual">;
          connection_id: string | null;
          form_id: string | null;
          external_event_id: string;
          payload_hash: string;
          status: "received" | "processing" | "processed" | "failed" | "rate_limited";
          lead_id: string | null;
          received_at: string;
          processed_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          source_channel: Exclude<LeadSourceChannel, "manual">;
          connection_id?: string | null;
          form_id?: string | null;
          external_event_id: string;
          payload_hash: string;
          status?: "received" | "processing" | "processed" | "failed" | "rate_limited";
          lead_id?: string | null;
          received_at?: string;
          processed_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          source_channel?: Exclude<LeadSourceChannel, "manual">;
          connection_id?: string | null;
          form_id?: string | null;
          external_event_id?: string;
          payload_hash?: string;
          status?: "received" | "processing" | "processed" | "failed" | "rate_limited";
          lead_id?: string | null;
          received_at?: string;
          processed_at?: string | null;
        };
        Relationships: [];
      };
      website_form_rate_limits: {
        Row: {
          window_start: string;
          scope_hash: string;
          submission_count: number;
        };
        Insert: {
          window_start: string;
          scope_hash: string;
          submission_count?: number;
        };
        Update: {
          window_start?: string;
          scope_hash?: string;
          submission_count?: number;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      submit_website_form: {
        Args: {
          p_public_id: string;
          p_event_id: string;
          p_ip_hash: string;
          p_payload_hash: string;
          p_data: Json;
        };
        Returns: Json;
      };
      submit_google_forms_lead: {
        Args: {
          p_credential_hash: string;
          p_event_id: string;
          p_payload_hash: string;
          p_data: Json;
        };
        Returns: Json;
      };
      process_whatsapp_message: {
        Args: {
          p_phone_number_id: string;
          p_sender_id: string;
          p_sender_phone: string;
          p_sender_name: string;
          p_message_id: string;
          p_message_type: string;
          p_message_content: string;
          p_occurred_at: string;
          p_payload_hash: string;
        };
        Returns: Json;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
