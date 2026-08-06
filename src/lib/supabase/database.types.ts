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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      admin_mfa_challenges: {
        Row: {
          last_challenge_ip: unknown
          last_challenge_ua: string | null
          last_challenged_at: string
          user_id: string
        }
        Insert: {
          last_challenge_ip?: unknown
          last_challenge_ua?: string | null
          last_challenged_at?: string
          user_id: string
        }
        Update: {
          last_challenge_ip?: unknown
          last_challenge_ua?: string | null
          last_challenged_at?: string
          user_id?: string
        }
        Relationships: []
      }
      archived_waiver_signatures: {
        Row: {
          archived_at: string
          archived_by: string | null
          id: number
          ip_address: string | null
          member_email: string
          member_id: number
          member_name: string
          original_id: number
          signature_path: string | null
          signature_type: string | null
          signed_at: string
          snapshot_md: string
          template_id: number | null
          template_version: number
          typed_initials: string | null
        }
        Insert: {
          archived_at?: string
          archived_by?: string | null
          id?: number
          ip_address?: string | null
          member_email: string
          member_id: number
          member_name: string
          original_id: number
          signature_path?: string | null
          signature_type?: string | null
          signed_at: string
          snapshot_md: string
          template_id?: number | null
          template_version: number
          typed_initials?: string | null
        }
        Update: {
          archived_at?: string
          archived_by?: string | null
          id?: number
          ip_address?: string | null
          member_email?: string
          member_id?: number
          member_name?: string
          original_id?: number
          signature_path?: string | null
          signature_type?: string | null
          signed_at?: string
          snapshot_md?: string
          template_id?: number | null
          template_version?: number
          typed_initials?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "archived_waiver_signatures_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "waiver_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          alt_text: string
          created_at: string
          filename: string
          id: number
          mime_type: string
          public_url: string
          size_bytes: number
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          alt_text?: string
          created_at?: string
          filename: string
          id?: number
          mime_type: string
          public_url: string
          size_bytes?: number
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          alt_text?: string
          created_at?: string
          filename?: string
          id?: number
          mime_type?: string
          public_url?: string
          size_bytes?: number
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: number
          metadata: Json
          payload: Json
          record_id: string | null
          table_name: string
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: number
          metadata?: Json
          payload?: Json
          record_id?: string | null
          table_name: string
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: number
          metadata?: Json
          payload?: Json
          record_id?: string | null
          table_name?: string
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      auth_attempt_log: {
        Row: {
          attempted_at: string
          email: string
          failure_code: string | null
          id: number
          ip: unknown
          ok: boolean
          user_agent: string | null
        }
        Insert: {
          attempted_at?: string
          email: string
          failure_code?: string | null
          id?: number
          ip?: unknown
          ok: boolean
          user_agent?: string | null
        }
        Update: {
          attempted_at?: string
          email?: string
          failure_code?: string | null
          id?: number
          ip?: unknown
          ok?: boolean
          user_agent?: string | null
        }
        Relationships: []
      }
      banners: {
        Row: {
          active: boolean
          color: string
          created_at: string
          display_order: number
          expanded: boolean
          expires_at: string | null
          id: number
          section: string
          starts_at: string | null
          text: string
        }
        Insert: {
          active?: boolean
          color?: string
          created_at?: string
          display_order?: number
          expanded?: boolean
          expires_at?: string | null
          id?: number
          section?: string
          starts_at?: string | null
          text?: string
        }
        Update: {
          active?: boolean
          color?: string
          created_at?: string
          display_order?: number
          expanded?: boolean
          expires_at?: string | null
          id?: number
          section?: string
          starts_at?: string | null
          text?: string
        }
        Relationships: []
      }
      belt_history: {
        Row: {
          belt: string
          created_at: string
          event_type: string
          id: number
          member_id: number
          notes: string | null
          promoted_at: string
          promoted_by: string | null
          promoted_by_name: string | null
          stripes: number
        }
        Insert: {
          belt: string
          created_at?: string
          event_type: string
          id?: number
          member_id: number
          notes?: string | null
          promoted_at?: string
          promoted_by?: string | null
          promoted_by_name?: string | null
          stripes?: number
        }
        Update: {
          belt?: string
          created_at?: string
          event_type?: string
          id?: number
          member_id?: number
          notes?: string | null
          promoted_at?: string
          promoted_by?: string | null
          promoted_by_name?: string | null
          stripes?: number
        }
        Relationships: [
          {
            foreignKeyName: "belt_history_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_posts: {
        Row: {
          author: string
          body: string
          created_at: string
          display_order: number
          excerpt: string
          expires_at: string | null
          id: number
          published: boolean
          slug: string
          starts_at: string | null
          tag: string
          title: string
        }
        Insert: {
          author?: string
          body?: string
          created_at?: string
          display_order?: number
          excerpt?: string
          expires_at?: string | null
          id?: number
          published?: boolean
          slug: string
          starts_at?: string | null
          tag?: string
          title: string
        }
        Update: {
          author?: string
          body?: string
          created_at?: string
          display_order?: number
          excerpt?: string
          expires_at?: string | null
          id?: number
          published?: boolean
          slug?: string
          starts_at?: string | null
          tag?: string
          title?: string
        }
        Relationships: []
      }
      check_in_audiences: {
        Row: {
          audience_id: number | null
          audience_kind: string | null
          audience_name: string | null
          check_in_id: number
          sort_order: number
        }
        Insert: {
          audience_id?: number | null
          audience_kind?: string | null
          audience_name?: string | null
          check_in_id: number
          sort_order?: number
        }
        Update: {
          audience_id?: number | null
          audience_kind?: string | null
          audience_name?: string | null
          check_in_id?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "check_in_audiences_audience_id_fkey"
            columns: ["audience_id"]
            isOneToOne: false
            referencedRelation: "class_audiences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_in_audiences_check_in_id_fkey"
            columns: ["check_in_id"]
            isOneToOne: false
            referencedRelation: "check_ins"
            referencedColumns: ["id"]
          },
        ]
      }
      check_in_focuses: {
        Row: {
          check_in_id: number
          focus_id: number | null
          focus_name: string | null
          sort_order: number
        }
        Insert: {
          check_in_id: number
          focus_id?: number | null
          focus_name?: string | null
          sort_order?: number
        }
        Update: {
          check_in_id?: number
          focus_id?: number | null
          focus_name?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "check_in_focuses_check_in_id_fkey"
            columns: ["check_in_id"]
            isOneToOne: false
            referencedRelation: "check_ins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_in_focuses_focus_id_fkey"
            columns: ["focus_id"]
            isOneToOne: false
            referencedRelation: "class_focuses"
            referencedColumns: ["id"]
          },
        ]
      }
      check_in_instructors: {
        Row: {
          check_in_id: number
          instructor_id: number | null
          instructor_name: string | null
          sort_order: number
        }
        Insert: {
          check_in_id: number
          instructor_id?: number | null
          instructor_name?: string | null
          sort_order?: number
        }
        Update: {
          check_in_id?: number
          instructor_id?: number | null
          instructor_name?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "check_in_instructors_check_in_id_fkey"
            columns: ["check_in_id"]
            isOneToOne: false
            referencedRelation: "check_ins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_in_instructors_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors"
            referencedColumns: ["id"]
          },
        ]
      }
      check_ins: {
        Row: {
          checked_in_at: string
          class_date: string
          class_name: string
          created_at: string
          id: number
          instructor_id: number | null
          instructor_name: string | null
          level_id: number | null
          level_name: string | null
          member_id: number
          modality_id: number | null
          modality_name: string | null
          schedule_slot_id: number | null
          source: string
        }
        Insert: {
          checked_in_at?: string
          class_date?: string
          class_name: string
          created_at?: string
          id?: number
          instructor_id?: number | null
          instructor_name?: string | null
          level_id?: number | null
          level_name?: string | null
          member_id: number
          modality_id?: number | null
          modality_name?: string | null
          schedule_slot_id?: number | null
          source?: string
        }
        Update: {
          checked_in_at?: string
          class_date?: string
          class_name?: string
          created_at?: string
          id?: number
          instructor_id?: number | null
          instructor_name?: string | null
          level_id?: number | null
          level_name?: string | null
          member_id?: number
          modality_id?: number | null
          modality_name?: string | null
          schedule_slot_id?: number | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "check_ins_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_ins_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "class_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_ins_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_ins_modality_id_fkey"
            columns: ["modality_id"]
            isOneToOne: false
            referencedRelation: "class_modalities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_ins_schedule_slot_id_fkey"
            columns: ["schedule_slot_id"]
            isOneToOne: false
            referencedRelation: "schedule_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      class_audiences: {
        Row: {
          active: boolean
          created_at: string
          gender: string | null
          id: number
          kind: string
          max_age: number | null
          min_age: number | null
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          gender?: string | null
          id?: number
          kind: string
          max_age?: number | null
          min_age?: number | null
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          gender?: string | null
          id?: number
          kind?: string
          max_age?: number | null
          min_age?: number | null
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      class_focuses: {
        Row: {
          active: boolean
          created_at: string
          id: number
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: number
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: number
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      class_levels: {
        Row: {
          active: boolean
          created_at: string
          id: number
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: number
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: number
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      class_modalities: {
        Row: {
          active: boolean
          color: string | null
          created_at: string
          id: number
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          color?: string | null
          created_at?: string
          id?: number
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          color?: string | null
          created_at?: string
          id?: number
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      contact_submissions: {
        Row: {
          created_at: string
          email: string
          first_name: string
          id: number
          last_name: string
          message: string
          read: boolean
        }
        Insert: {
          created_at?: string
          email: string
          first_name: string
          id?: number
          last_name: string
          message: string
          read?: boolean
        }
        Update: {
          created_at?: string
          email?: string
          first_name?: string
          id?: number
          last_name?: string
          message?: string
          read?: boolean
        }
        Relationships: []
      }
      data_requests: {
        Row: {
          created_at: string
          email_verified: boolean
          export_s3_key: string | null
          id: number
          member_id: number | null
          message: string | null
          request_email: string
          request_type: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          verification_token: string | null
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          email_verified?: boolean
          export_s3_key?: string | null
          id?: number
          member_id?: number | null
          message?: string | null
          request_email: string
          request_type: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          verification_token?: string | null
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          email_verified?: boolean
          export_s3_key?: string | null
          id?: number
          member_id?: number | null
          message?: string | null
          request_email?: string
          request_type?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          verification_token?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "data_requests_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      email_suppressions: {
        Row: {
          bounce_subtype: string | null
          bounce_type: string | null
          email: string
          raw_payload: Json | null
          reason: string
          source: string
          suppressed_at: string
        }
        Insert: {
          bounce_subtype?: string | null
          bounce_type?: string | null
          email: string
          raw_payload?: Json | null
          reason: string
          source?: string
          suppressed_at?: string
        }
        Update: {
          bounce_subtype?: string | null
          bounce_type?: string | null
          email?: string
          raw_payload?: Json | null
          reason?: string
          source?: string
          suppressed_at?: string
        }
        Relationships: []
      }
      faq_items: {
        Row: {
          active: boolean
          answer: string
          created_at: string
          display_order: number
          expires_at: string | null
          id: number
          question: string
          starts_at: string | null
        }
        Insert: {
          active?: boolean
          answer: string
          created_at?: string
          display_order?: number
          expires_at?: string | null
          id?: number
          question: string
          starts_at?: string | null
        }
        Update: {
          active?: boolean
          answer?: string
          created_at?: string
          display_order?: number
          expires_at?: string | null
          id?: number
          question?: string
          starts_at?: string | null
        }
        Relationships: []
      }
      footer_items: {
        Row: {
          active: boolean
          created_at: string
          display_order: number
          group_name: string
          href: string
          id: number
          label: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_order?: number
          group_name?: string
          href: string
          id?: number
          label: string
        }
        Update: {
          active?: boolean
          created_at?: string
          display_order?: number
          group_name?: string
          href?: string
          id?: number
          label?: string
        }
        Relationships: []
      }
      instructors: {
        Row: {
          active: boolean
          created_at: string
          id: number
          name: string
          slug: string
          team_member_id: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: number
          name: string
          slug: string
          team_member_id?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: number
          name?: string
          slug?: string
          team_member_id?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "instructors_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team"
            referencedColumns: ["id"]
          },
        ]
      }
      member_memberships: {
        Row: {
          canceled_at: string | null
          created_at: string
          current_period_end: string | null
          effective_price_cents: number | null
          ends_at: string | null
          id: number
          is_comp: boolean
          locked_price_cents: number
          member_id: number
          override_note: string | null
          override_price_cents: number | null
          paused_until: string | null
          plan_billing_interval: string | null
          plan_id: number
          plan_name: string | null
          started_at: string
          status: Database["public"]["Enums"]["membership_status"]
          stripe_price_id: string | null
          stripe_subscription_id: string | null
        }
        Insert: {
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          effective_price_cents?: number | null
          ends_at?: string | null
          id?: number
          is_comp?: boolean
          locked_price_cents: number
          member_id: number
          override_note?: string | null
          override_price_cents?: number | null
          paused_until?: string | null
          plan_billing_interval?: string | null
          plan_id: number
          plan_name?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["membership_status"]
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
        }
        Update: {
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          effective_price_cents?: number | null
          ends_at?: string | null
          id?: number
          is_comp?: boolean
          locked_price_cents?: number
          member_id?: number
          override_note?: string | null
          override_price_cents?: number | null
          paused_until?: string | null
          plan_billing_interval?: string | null
          plan_id?: number
          plan_name?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["membership_status"]
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "member_memberships_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_memberships_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "membership_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      member_purchases: {
        Row: {
          created_at: string
          id: number
          member_id: number
          notes: string | null
          plan_billing_interval: string
          plan_id: number
          plan_name: string
          price_cents: number
          purchased_at: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          member_id: number
          notes?: string | null
          plan_billing_interval?: string
          plan_id: number
          plan_name: string
          price_cents: number
          purchased_at?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          member_id?: number
          notes?: string | null
          plan_billing_interval?: string
          plan_id?: number
          plan_name?: string
          price_cents?: number
          purchased_at?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "member_purchases_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_purchases_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "membership_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          belt: string | null
          belt_awarded_at: string | null
          birth_month: number | null
          birth_year: number | null
          communication_opt_in: boolean
          created_at: string
          email: string
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relationship: string | null
          first_name: string
          gender: string | null
          id: number
          last_name: string
          notes: string | null
          phone: string | null
          status: Database["public"]["Enums"]["member_status"]
          stripe_customer_id: string | null
          stripes: number
          training_started_at: string | null
          user_id: string | null
          waiver_signed_at: string | null
          waiver_status: string
        }
        Insert: {
          belt?: string | null
          belt_awarded_at?: string | null
          birth_month?: number | null
          birth_year?: number | null
          communication_opt_in?: boolean
          created_at?: string
          email: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          first_name: string
          gender?: string | null
          id?: number
          last_name: string
          notes?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["member_status"]
          stripe_customer_id?: string | null
          stripes?: number
          training_started_at?: string | null
          user_id?: string | null
          waiver_signed_at?: string | null
          waiver_status?: string
        }
        Update: {
          belt?: string | null
          belt_awarded_at?: string | null
          birth_month?: number | null
          birth_year?: number | null
          communication_opt_in?: boolean
          created_at?: string
          email?: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          first_name?: string
          gender?: string | null
          id?: number
          last_name?: string
          notes?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["member_status"]
          stripe_customer_id?: string | null
          stripes?: number
          training_started_at?: string | null
          user_id?: string | null
          waiver_signed_at?: string | null
          waiver_status?: string
        }
        Relationships: []
      }
      membership_plans: {
        Row: {
          billing_interval: string
          created_at: string
          cta_href: string
          cta_label: string
          description: string | null
          display_order: number
          features: Json
          highlight: boolean
          highlight_color: string | null
          highlight_label: string | null
          id: number
          max_classes_per_week: number | null
          name: string
          period_display: string | null
          price_cents: number
          status: string
          stripe_default_price_id: string | null
          stripe_product_id: string | null
          trial_days: number
          visible: boolean
        }
        Insert: {
          billing_interval?: string
          created_at?: string
          cta_href?: string
          cta_label?: string
          description?: string | null
          display_order?: number
          features?: Json
          highlight?: boolean
          highlight_color?: string | null
          highlight_label?: string | null
          id?: number
          max_classes_per_week?: number | null
          name: string
          period_display?: string | null
          price_cents: number
          status?: string
          stripe_default_price_id?: string | null
          stripe_product_id?: string | null
          trial_days?: number
          visible?: boolean
        }
        Update: {
          billing_interval?: string
          created_at?: string
          cta_href?: string
          cta_label?: string
          description?: string | null
          display_order?: number
          features?: Json
          highlight?: boolean
          highlight_color?: string | null
          highlight_label?: string | null
          id?: number
          max_classes_per_week?: number | null
          name?: string
          period_display?: string | null
          price_cents?: number
          status?: string
          stripe_default_price_id?: string | null
          stripe_product_id?: string | null
          trial_days?: number
          visible?: boolean
        }
        Relationships: []
      }
      mfa_recovery_codes: {
        Row: {
          code_hash: string
          created_at: string
          id: number
          label: string | null
          replaced_at: string | null
          used_at: string | null
          user_id: string
        }
        Insert: {
          code_hash: string
          created_at?: string
          id?: number
          label?: string | null
          replaced_at?: string | null
          used_at?: string | null
          user_id: string
        }
        Update: {
          code_hash?: string
          created_at?: string
          id?: number
          label?: string | null
          replaced_at?: string | null
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      nav_items: {
        Row: {
          active: boolean
          created_at: string
          display_order: number
          href: string
          id: number
          label: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_order?: number
          href: string
          id?: number
          label: string
        }
        Update: {
          active?: boolean
          created_at?: string
          display_order?: number
          href?: string
          id?: number
          label?: string
        }
        Relationships: []
      }
      plan_price_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          excluded_member_ids: number[]
          id: number
          new_price_cents: number
          old_price_cents: number
          plan_id: number
          scope: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          excluded_member_ids?: number[]
          id?: number
          new_price_cents: number
          old_price_cents: number
          plan_id: number
          scope: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          excluded_member_ids?: number[]
          id?: number
          new_price_cents?: number
          old_price_cents?: number
          plan_id?: number
          scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_price_history_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "membership_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_plans: {
        Row: {
          active: boolean
          created_at: string
          cta: string
          cta_href: string
          display_order: number
          expires_at: string | null
          featured: boolean
          features: Json
          highlight_color: string | null
          highlight_label: string | null
          id: number
          period: string
          price: string
          starts_at: string | null
          tier: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          cta?: string
          cta_href?: string
          display_order?: number
          expires_at?: string | null
          featured?: boolean
          features?: Json
          highlight_color?: string | null
          highlight_label?: string | null
          id?: number
          period?: string
          price: string
          starts_at?: string | null
          tier: string
        }
        Update: {
          active?: boolean
          created_at?: string
          cta?: string
          cta_href?: string
          display_order?: number
          expires_at?: string | null
          featured?: boolean
          features?: Json
          highlight_color?: string | null
          highlight_label?: string | null
          id?: number
          period?: string
          price?: string
          starts_at?: string | null
          tier?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_admin: boolean
          mfa_enrolled: boolean
          mfa_enrolled_at: string | null
          role: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          is_admin?: boolean
          mfa_enrolled?: boolean
          mfa_enrolled_at?: string | null
          role?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_admin?: boolean
          mfa_enrolled?: boolean
          mfa_enrolled_at?: string | null
          role?: string
        }
        Relationships: []
      }
      schedule_slot_audiences: {
        Row: {
          audience_id: number
          schedule_slot_id: number
        }
        Insert: {
          audience_id: number
          schedule_slot_id: number
        }
        Update: {
          audience_id?: number
          schedule_slot_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "schedule_slot_audiences_audience_id_fkey"
            columns: ["audience_id"]
            isOneToOne: false
            referencedRelation: "class_audiences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_slot_audiences_schedule_slot_id_fkey"
            columns: ["schedule_slot_id"]
            isOneToOne: false
            referencedRelation: "schedule_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_slot_focuses: {
        Row: {
          focus_id: number
          schedule_slot_id: number
          sort_order: number
        }
        Insert: {
          focus_id: number
          schedule_slot_id: number
          sort_order?: number
        }
        Update: {
          focus_id?: number
          schedule_slot_id?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "schedule_slot_focuses_focus_id_fkey"
            columns: ["focus_id"]
            isOneToOne: false
            referencedRelation: "class_focuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_slot_focuses_schedule_slot_id_fkey"
            columns: ["schedule_slot_id"]
            isOneToOne: false
            referencedRelation: "schedule_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_slot_instructors: {
        Row: {
          instructor_id: number
          schedule_slot_id: number
          sort_order: number
        }
        Insert: {
          instructor_id: number
          schedule_slot_id: number
          sort_order?: number
        }
        Update: {
          instructor_id?: number
          schedule_slot_id?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "schedule_slot_instructors_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_slot_instructors_schedule_slot_id_fkey"
            columns: ["schedule_slot_id"]
            isOneToOne: false
            referencedRelation: "schedule_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_slots: {
        Row: {
          active: boolean
          area: string | null
          day_of_week: number
          end_time: string
          id: number
          instructor_id: number | null
          instructor_name: string | null
          instructor_name_display: string
          level_id: number | null
          link_label: string | null
          link_url: string | null
          modality_id: number
          show_instructor: boolean
          sort_order: number
          start_time: string
          title: string
        }
        Insert: {
          active?: boolean
          area?: string | null
          day_of_week: number
          end_time: string
          id?: number
          instructor_id?: number | null
          instructor_name?: string | null
          instructor_name_display?: string
          level_id?: number | null
          link_label?: string | null
          link_url?: string | null
          modality_id: number
          show_instructor?: boolean
          sort_order?: number
          start_time: string
          title: string
        }
        Update: {
          active?: boolean
          area?: string | null
          day_of_week?: number
          end_time?: string
          id?: number
          instructor_id?: number | null
          instructor_name?: string | null
          instructor_name_display?: string
          level_id?: number | null
          link_label?: string | null
          link_url?: string | null
          modality_id?: number
          show_instructor?: boolean
          sort_order?: number
          start_time?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_slots_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_slots_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "class_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_slots_modality_id_fkey"
            columns: ["modality_id"]
            isOneToOne: false
            referencedRelation: "class_modalities"
            referencedColumns: ["id"]
          },
        ]
      }
      site_sections: {
        Row: {
          display_description: string | null
          display_order: number
          display_subtitle: string | null
          display_title: string | null
          id: number
          key: string
          label: string
          visible: boolean
        }
        Insert: {
          display_description?: string | null
          display_order?: number
          display_subtitle?: string | null
          display_title?: string | null
          id?: number
          key: string
          label: string
          visible?: boolean
        }
        Update: {
          display_description?: string | null
          display_order?: number
          display_subtitle?: string | null
          display_title?: string | null
          id?: number
          key?: string
          label?: string
          visible?: boolean
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          key: string
          value: string
        }
        Insert: {
          key: string
          value?: string
        }
        Update: {
          key?: string
          value?: string
        }
        Relationships: []
      }
      stripe_events: {
        Row: {
          created_at: string | null
          id: string
          payload: Json | null
          processed_at: string | null
          status: string
          type: string
        }
        Insert: {
          created_at?: string | null
          id: string
          payload?: Json | null
          processed_at?: string | null
          status?: string
          type: string
        }
        Update: {
          created_at?: string | null
          id?: string
          payload?: Json | null
          processed_at?: string | null
          status?: string
          type?: string
        }
        Relationships: []
      }
      subscribers: {
        Row: {
          created_at: string
          id: number
          mode: string
          value: string
        }
        Insert: {
          created_at?: string
          id?: number
          mode: string
          value: string
        }
        Update: {
          created_at?: string
          id?: number
          mode?: string
          value?: string
        }
        Relationships: []
      }
      team: {
        Row: {
          active: boolean
          belt: string
          bio: string
          id: number
          name: string
          order: number
          photo_url: string | null
          role: string
          slug: string
          type: string
          visible_on_public_team: boolean
          visible_until: string | null
        }
        Insert: {
          active?: boolean
          belt?: string
          bio?: string
          id?: number
          name: string
          order?: number
          photo_url?: string | null
          role?: string
          slug: string
          type?: string
          visible_on_public_team?: boolean
          visible_until?: string | null
        }
        Update: {
          active?: boolean
          belt?: string
          bio?: string
          id?: number
          name?: string
          order?: number
          photo_url?: string | null
          role?: string
          slug?: string
          type?: string
          visible_on_public_team?: boolean
          visible_until?: string | null
        }
        Relationships: []
      }
      updates: {
        Row: {
          body: string
          date: string
          display_order: number
          expires_at: string | null
          id: number
          published: boolean
          starts_at: string | null
          title: string
          type: string
        }
        Insert: {
          body?: string
          date?: string
          display_order?: number
          expires_at?: string | null
          id?: number
          published?: boolean
          starts_at?: string | null
          title: string
          type: string
        }
        Update: {
          body?: string
          date?: string
          display_order?: number
          expires_at?: string | null
          id?: number
          published?: boolean
          starts_at?: string | null
          title?: string
          type?: string
        }
        Relationships: []
      }
      waiver_signatures: {
        Row: {
          id: number
          ip_address: string | null
          member_id: number
          signature_data: string | null
          signature_path: string | null
          signature_type: string | null
          signed_at: string
          snapshot_md: string
          template_id: number
          template_version: number
          typed_initials: string | null
        }
        Insert: {
          id?: number
          ip_address?: string | null
          member_id: number
          signature_data?: string | null
          signature_path?: string | null
          signature_type?: string | null
          signed_at?: string
          snapshot_md: string
          template_id: number
          template_version: number
          typed_initials?: string | null
        }
        Update: {
          id?: number
          ip_address?: string | null
          member_id?: number
          signature_data?: string | null
          signature_path?: string | null
          signature_type?: string | null
          signed_at?: string
          snapshot_md?: string
          template_id?: number
          template_version?: number
          typed_initials?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "waiver_signatures_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiver_signatures_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "waiver_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      waiver_templates: {
        Row: {
          active: boolean
          body_md: string
          created_at: string
          id: number
          title: string
          version: number
        }
        Insert: {
          active?: boolean
          body_md: string
          created_at?: string
          id?: number
          title: string
          version?: number
        }
        Update: {
          active?: boolean
          body_md?: string
          created_at?: string
          id?: number
          title?: string
          version?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activate_waiver_template_tx: {
        Args: { p_template_id: number }
        Returns: undefined
      }
      add_stripe_tx: {
        Args: {
          p_admin_email: string
          p_admin_name: string
          p_member_id: number
          p_note: string
        }
        Returns: Json
      }
      correct_belt_tx: {
        Args: {
          p_admin_email: string
          p_member_id: number
          p_new_belt: string
          p_new_stripes: number
          p_note: string
        }
        Returns: Json
      }
      create_member_profile_tx: {
        Args: {
          p_belt: string
          p_belt_awarded_at: string
          p_birth_month: number
          p_birth_year: number
          p_communication_opt_in: boolean
          p_email: string
          p_emergency_contact_name: string
          p_emergency_contact_phone: string
          p_emergency_contact_relationship: string
          p_first_name: string
          p_gender: string
          p_last_name: string
          p_phone: string
          p_status: string
          p_stripes: number
          p_training_started_at: string
          p_user_id: string
          p_waiver_signature_path: string
          p_waiver_signature_type: string
          p_waiver_snapshot_md: string
          p_waiver_template_id: number
          p_waiver_template_version: number
          p_waiver_typed_initials: string
        }
        Returns: Json
      }
      create_schedule_slot_tx: {
        Args: {
          p_active: boolean
          p_area: string
          p_audience_ids: number[]
          p_day_of_week: number
          p_end_time: string
          p_focus_ids: number[]
          p_instructor_name_display: string
          p_level_id: number
          p_link_label: string
          p_link_url: string
          p_modality_id: number
          p_show_instructor: boolean
          p_sort_order: number
          p_start_time: string
          p_title: string
        }
        Returns: number
      }
      delete_member_tx: {
        Args: {
          p_archived_by: string
          p_member_id: number
          p_preserve_waivers: boolean
        }
        Returns: Json
      }
      enroll_trial_membership_tx: {
        Args: {
          p_locked_price_cents: number
          p_member_id: number
          p_plan_billing_interval: string
          p_plan_id: number
          p_plan_name: string
        }
        Returns: Json
      }
      get_member_consistency_rank: {
        Args: { p_member_id: number }
        Returns: {
          rank: number
          total: number
        }[]
      }
      get_member_gym_rankings: {
        Args: { p_member_id: number; p_today: string }
        Returns: {
          alltime_rank: number
          alltime_total: number
          month_rank: number
          month_total: number
          streak_rank: number
          streak_total: number
          week_rank: number
          week_total: number
        }[]
      }
      get_member_motivational_stats: {
        Args: { p_member_id: number; p_today: string }
        Returns: {
          all_time_classes: number
          classes_last_28d: number
          classes_this_month: number
          classes_this_week: number
          last_class_date: string
          last_class_name: string
          month_rank: number
          month_total: number
          week_streak: number
        }[]
      }
      has_role: { Args: { required_role: string }; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_owner: { Args: never; Returns: boolean }
      promote_member_tx: {
        Args: {
          p_admin_email: string
          p_admin_name: string
          p_member_id: number
          p_new_belt: string
          p_note: string
        }
        Returns: Json
      }
      sign_waiver_tx: {
        Args: {
          p_member_id: number
          p_signature_path: string
          p_signature_type: string
          p_snapshot_md: string
          p_template_id: number
          p_template_version: number
          p_typed_initials: string
        }
        Returns: Json
      }
      snapshot_check_in_taxonomy: {
        Args: { p_check_in_id: number; p_slot_id: number }
        Returns: undefined
      }
      update_member_belt_details_tx: {
        Args: {
          p_admin_email: string
          p_admin_name: string
          p_belt_awarded_at: string
          p_event_type: string
          p_member_id: number
          p_new_belt: string
          p_new_stripes: number
          p_note: string
          p_training_started_at: string
        }
        Returns: Json
      }
      update_schedule_slot_tx: {
        Args: {
          p_active: boolean
          p_area: string
          p_audience_ids: number[]
          p_day_of_week: number
          p_end_time: string
          p_focus_ids: number[]
          p_instructor_name_display: string
          p_level_id: number
          p_link_label: string
          p_link_url: string
          p_modality_id: number
          p_show_instructor: boolean
          p_slot_id: number
          p_sort_order: number
          p_start_time: string
          p_title: string
        }
        Returns: undefined
      }
      verify_kiosk_token: { Args: { p_token: string }; Returns: boolean }
    }
    Enums: {
      member_status: "prospect" | "trial" | "active" | "inactive" | "suspended"
      membership_status:
        | "trialing"
        | "active"
        | "paused"
        | "canceled"
        | "past_due"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      member_status: ["prospect", "trial", "active", "inactive", "suspended"],
      membership_status: [
        "trialing",
        "active",
        "paused",
        "canceled",
        "past_due",
      ],
    },
  },
} as const
