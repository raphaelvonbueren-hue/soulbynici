// Supabase Edge Function: stripe-refund
// Erstattet eine Zahlung über Stripe.
// Request body: { kind: 'booking' | 'order', id: string }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders });
    }
    const { kind, id } = await req.json();
    if (!kind || !id) {
      return new Response(
        JSON.stringify({ ok: false, error: "kind und id sind Pflicht" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const table = kind === "booking" ? "bookings" : "orders";

    // Datensatz holen + Payment Intent
    const { data: row, error } = await supabase
      .from(table)
      .select("stripe_payment_intent_id, payment_status")
      .eq("id", id)
      .single();
    if (error) throw error;
    if (!row?.stripe_payment_intent_id) {
      return new Response(
        JSON.stringify({ ok: false, error: "Keine Stripe-Payment-Intent ID gefunden" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (row.payment_status === "refunded") {
      return new Response(
        JSON.stringify({ ok: false, error: "Bereits erstattet" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Refund auslösen
    const refund = await stripe.refunds.create({
      payment_intent: row.stripe_payment_intent_id,
    });

    // Webhook setzt den Status — hier nur Bestätigung
    return new Response(
      JSON.stringify({ ok: true, refund_id: refund.id, status: refund.status }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[stripe-refund]", e);
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
