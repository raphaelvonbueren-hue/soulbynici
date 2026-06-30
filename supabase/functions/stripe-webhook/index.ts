// Supabase Edge Function: stripe-webhook
// Empfängt Stripe-Events und aktualisiert Buchungs-/Order-Status.
// Wichtig: Stripe-Signatur muss verifiziert werden!
//
// Stripe Dashboard → Webhooks → URL: https://<project>.supabase.co/functions/v1/stripe-webhook
// Listening events: checkout.session.completed, payment_intent.succeeded, payment_intent.payment_failed

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});

serve(async (req) => {
  try {
    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      return new Response("No signature", { status: 400 });
    }
    const body = await req.text();

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        STRIPE_WEBHOOK_SECRET,
      );
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      return new Response("Invalid signature", { status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const type = session.metadata?.type;
        const paymentIntentId = typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id;
        const amountTotal = session.amount_total ? session.amount_total / 100 : 0;
        const paidAt = new Date().toISOString();

        if (type === "booking") {
          const bookingIds = (session.metadata?.booking_ids || "")
            .split(",")
            .filter(Boolean);
          if (bookingIds.length > 0) {
            await supabase
              .from("bookings")
              .update({
                payment_status: "paid",
                stripe_payment_intent_id: paymentIntentId,
                paid_at: paidAt,
                amount_paid: amountTotal,
              })
              .in("id", bookingIds);
            console.log(`Booking(s) ${bookingIds.join(",")} marked as paid`);
          }
        } else if (type === "order") {
          const orderId = session.metadata?.order_id;
          if (orderId) {
            await supabase
              .from("orders")
              .update({
                payment_status: "paid",
                stripe_payment_intent_id: paymentIntentId,
                paid_at: paidAt,
              })
              .eq("id", orderId);
            console.log(`Order ${orderId} marked as paid`);
          }
        }
        break;
      }
      case "payment_intent.payment_failed": {
        const pi = event.data.object as Stripe.PaymentIntent;
        // Buchungen und Orders mit dieser session_id auf 'failed'
        await supabase
          .from("bookings")
          .update({ payment_status: "failed" })
          .eq("stripe_payment_intent_id", pi.id);
        await supabase
          .from("orders")
          .update({ payment_status: "failed" })
          .eq("stripe_payment_intent_id", pi.id);
        break;
      }
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        if (charge.payment_intent) {
          const piId = typeof charge.payment_intent === "string"
            ? charge.payment_intent
            : charge.payment_intent.id;
          await supabase
            .from("bookings")
            .update({ payment_status: "refunded" })
            .eq("stripe_payment_intent_id", piId);
          await supabase
            .from("orders")
            .update({ payment_status: "refunded" })
            .eq("stripe_payment_intent_id", piId);
        }
        break;
      }
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[stripe-webhook]", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
