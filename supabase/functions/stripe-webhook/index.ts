// Supabase Edge Function: stripe-webhook
// Empfängt Stripe-Events, aktualisiert Buchungs-/Order-Status UND verschickt
// nach Zahlung eine Quittungs-Mail bzw. nach Refund eine Rückerstattungs-Mail.
// Wichtig: Stripe-Signatur muss verifiziert werden!
//
// Stripe Dashboard → Webhooks → URL: https://<project>.supabase.co/functions/v1/stripe-webhook
// Listening events (müssen exakt diese 3 sein, sonst greift die Logik unten nicht):
//   checkout.session.completed, payment_intent.payment_failed, charge.refunded

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "info@soulbynici.ch";

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});

// ---- Mail-Helfer ----

async function sendResendEmail(to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: `soulbynici <${FROM_EMAIL}>`,
      to: [to],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Resend ${res.status}: ${errText}`);
  }
  return res.json();
}

function escapeHtml(s: string | undefined | null): string {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("de-CH", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

// CHF im Schweizer Format (Apostroph-Tausender), z.B. CHF 1'234.00
function formatChf(amount: number): string {
  return new Intl.NumberFormat("de-CH", {
    style: "currency",
    currency: "CHF",
  }).format(amount);
}

function mailShell(headline: string, inner: string): string {
  return `
    <div style="font-family:Inter,Arial,sans-serif;color:#3a4a5a;max-width:600px;margin:0 auto;padding:2rem;">
      <h1 style="font-family:'Cormorant Garamond',serif;font-weight:300;font-size:2rem;color:#4f6c7e;margin-bottom:1rem;">
        ${headline}
      </h1>
      ${inner}
      <p style="margin-top:2rem;font-family:'Cormorant Garamond',serif;font-style:italic;font-size:1.2rem;color:#b08968;">
        Von Herzen, Nicole
      </p>
      <hr style="border:none;border-top:1px solid #e0e0e0;margin:2rem 0;">
      <p style="font-size:0.85rem;color:#888;">
        soulbynici · Energiearbeit · Heilung · Selbstverbindung<br>
        <a href="https://www.soulbynici.ch" style="color:#4f6c7e;">www.soulbynici.ch</a> ·
        <a href="mailto:info@soulbynici.ch" style="color:#4f6c7e;">info@soulbynici.ch</a>
      </p>
    </div>
  `;
}

function buildReceiptMail(
  name: string,
  itemLabel: string,
  amount: number,
  whenLine?: string,
): string {
  const inner = `
    <p style="line-height:1.7;">
      Liebe*r ${escapeHtml(name || "")}, vielen Dank — deine Zahlung ist bei mir eingegangen.
    </p>
    <div style="margin-top:1.5rem;padding:1.5rem;background:#fffaf3;border-radius:8px;">
      <p style="margin:0 0 0.5rem 0;font-size:0.85rem;text-transform:uppercase;letter-spacing:0.1em;color:#888;">
        Zahlungsbestätigung
      </p>
      <p style="font-size:1.1rem;line-height:1.7;margin:0;">
        ${escapeHtml(itemLabel)}<br>
        ${whenLine ? `${escapeHtml(whenLine)}<br>` : ""}
        <strong>Bezahlt: ${formatChf(amount)}</strong>
      </p>
    </div>
    <p style="margin-top:1.5rem;line-height:1.7;">
      Diese E-Mail dient als Zahlungsbestätigung. Die Termin-Details mit Zoom-Link
      hast du in der separaten Buchungsbestätigung erhalten.
    </p>
  `;
  return mailShell("Danke für deine Zahlung", inner);
}

function buildRefundMail(
  name: string,
  itemLabel: string,
  amount: number,
): string {
  const inner = `
    <p style="line-height:1.7;">
      Liebe*r ${escapeHtml(name || "")}, deine Zahlung wurde zurückerstattet.
    </p>
    <div style="margin-top:1.5rem;padding:1.5rem;background:#f5f5f5;border-radius:8px;border-left:3px solid #4f6c7e;">
      <p style="margin:0 0 0.5rem 0;font-size:0.85rem;text-transform:uppercase;letter-spacing:0.1em;color:#888;">
        Rückerstattung
      </p>
      <p style="font-size:1.1rem;line-height:1.7;margin:0;">
        ${escapeHtml(itemLabel)}<br>
        <strong>Erstattet: ${formatChf(amount)}</strong>
      </p>
    </div>
    <p style="margin-top:1.5rem;line-height:1.7;">
      Je nach Bank kann es ein paar Tage dauern, bis der Betrag wieder bei dir sichtbar ist.
      Bei Fragen melde dich jederzeit.
    </p>
  `;
  return mailShell("Deine Rückerstattung", inner);
}

// ---- Event-Verarbeitung ----

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

            // Quittungs-Mail (best-effort)
            try {
              const { data: rows } = await supabase
                .from("bookings")
                .select("customer, type_name, type, date, time")
                .in("id", bookingIds);
              const first = rows?.[0];
              const email = first?.customer?.email;
              if (email) {
                const isPack = (rows?.length || 0) > 1;
                const label = isPack
                  ? "4er-Paket Energiearbeit"
                  : (first?.type_name || first?.type || "Sitzung");
                const whenLine = !isPack && first?.date
                  ? `${formatDate(first.date)}${first.time ? ` um ${first.time} Uhr` : ""}`
                  : (isPack ? `${rows?.length} Termine` : undefined);
                await sendResendEmail(
                  email,
                  "Zahlungsbestätigung",
                  buildReceiptMail(first?.customer?.name, label, amountTotal, whenLine),
                );
                console.log(`Receipt mail sent to ${email}`);
              }
            } catch (mailErr) {
              console.error("[receipt-mail booking]", mailErr);
            }
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

            // Quittungs-Mail (best-effort)
            try {
              const { data: order } = await supabase
                .from("orders")
                .select("customer, customer_email, customer_name, product_name")
                .eq("id", orderId)
                .single();
              const email = order?.customer_email || order?.customer?.email;
              if (email) {
                await sendResendEmail(
                  email,
                  "Zahlungsbestätigung",
                  buildReceiptMail(
                    order?.customer_name || order?.customer?.name,
                    order?.product_name || "Bestellung",
                    amountTotal,
                  ),
                );
                console.log(`Receipt mail sent to ${email}`);
              }
            } catch (mailErr) {
              console.error("[receipt-mail order]", mailErr);
            }
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
          const refundAmount = (charge.amount_refunded ?? 0) / 100;

          await supabase
            .from("bookings")
            .update({ payment_status: "refunded" })
            .eq("stripe_payment_intent_id", piId);
          await supabase
            .from("orders")
            .update({ payment_status: "refunded" })
            .eq("stripe_payment_intent_id", piId);

          // Refund-Mail (best-effort): betroffenen Datensatz finden
          try {
            const { data: bRows } = await supabase
              .from("bookings")
              .select("customer, type_name, type")
              .eq("stripe_payment_intent_id", piId);
            const b = bRows?.[0];
            if (b?.customer?.email) {
              const isPack = (bRows?.length || 0) > 1;
              const label = isPack
                ? "4er-Paket Energiearbeit"
                : (b?.type_name || b?.type || "Sitzung");
              await sendResendEmail(
                b.customer.email,
                "Rückerstattung",
                buildRefundMail(b.customer.name, label, refundAmount),
              );
              console.log(`Refund mail sent to ${b.customer.email}`);
            } else {
              const { data: order } = await supabase
                .from("orders")
                .select("customer, customer_email, customer_name, product_name")
                .eq("stripe_payment_intent_id", piId)
                .maybeSingle();
              const email = order?.customer_email || order?.customer?.email;
              if (email) {
                await sendResendEmail(
                  email,
                  "Rückerstattung",
                  buildRefundMail(
                    order?.customer_name || order?.customer?.name,
                    order?.product_name || "Bestellung",
                    refundAmount,
                  ),
                );
                console.log(`Refund mail sent to ${email}`);
              }
            }
          } catch (mailErr) {
            console.error("[refund-mail]", mailErr);
          }
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
