// Supabase Edge Function: stripe-create-checkout
// Erstellt eine Stripe Checkout-Session für eine Buchung oder Shop-Order.
// Returns: { url: string } — Frontend redirected dorthin.
//
// Request body:
// {
//   type: 'booking' | 'order',
//   booking_ids?: string[],   // bei type=booking: ein oder vier IDs (Pack)
//   order_id?: string,         // bei type=order
//   amount: number,            // CHF
//   description: string,       // wird in Stripe-Checkout angezeigt
//   customer_email: string,
//   success_url: string,
//   cancel_url: string
// }

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

    const body = await req.json();
    const {
      type,
      booking_ids = [],
      order_id,
      amount,
      description,
      customer_email,
      success_url,
      cancel_url,
    } = body;

    if (!amount || amount <= 0) {
      return new Response(
        JSON.stringify({ error: "Ungültiger Betrag" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Stripe-Betrag in Rappen (CHF * 100)
    const amountInRappen = Math.round(amount * 100);

    // Metadaten für späteren Webhook-Match
    const metadata: Record<string, string> = { type };
    if (booking_ids.length > 0) {
      metadata.booking_ids = booking_ids.join(",");
    }
    if (order_id) {
      metadata.order_id = order_id;
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      currency: "chf",
      line_items: [
        {
          price_data: {
            currency: "chf",
            product_data: {
              name: description || "soulbynici",
            },
            unit_amount: amountInRappen,
          },
          quantity: 1,
        },
      ],
      customer_email: customer_email || undefined,
      success_url: success_url || "https://www.soulbynici.ch/?paid=1",
      cancel_url: cancel_url || "https://www.soulbynici.ch/?paid=0",
      metadata,
      locale: "de",
    });

    // Stripe-Session-ID in DB speichern
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    if (type === "booking" && booking_ids.length > 0) {
      await supabase
        .from("bookings")
        .update({
          stripe_session_id: session.id,
          payment_status: "pending",
        })
        .in("id", booking_ids);
    } else if (type === "order" && order_id) {
      await supabase
        .from("orders")
        .update({
          stripe_session_id: session.id,
          payment_status: "pending",
        })
        .eq("id", order_id);
    }

    return new Response(
      JSON.stringify({ url: session.url, session_id: session.id }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    console.error("[stripe-create-checkout]", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
