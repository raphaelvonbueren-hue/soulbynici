// Supabase Edge Function: send-reminder-24h
// Wird stündlich via pg_cron aufgerufen.
// Sucht Buchungen die in ~24h stattfinden und schickt eine Erinnerung mit Zoom-Link.
// Setzt reminder_sent_at damit jede Buchung nur EINMAL erinnert wird.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "info@soulbynici.ch";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Booking {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  type?: string;
  type_name?: string;
  duration?: number;
  reminder_sent_at?: string | null;
  customer?: {
    name?: string;
    email?: string;
  };
}

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
  });
}

// Ersetzt Platzhalter {name} etc. in editierbaren Textblöcken (aus site_texts).
function fill(tpl: string, vars: Record<string, string>): string {
  return String(tpl).replace(/\{(\w+)\}/g, (_m, k) => (k in vars ? vars[k] : `{${k}}`));
}

// Lädt alle E-Mail-Text-Overrides (email:*) in eine Map. Fehlt ein Key -> Default greift.
async function loadEmailTexts(
  // deno-lint-ignore no-explicit-any
  supabase: any,
): Promise<Record<string, string>> {
  const { data } = await supabase
    .from("site_texts")
    .select("text_key, content")
    .like("text_key", "email:%");
  const m: Record<string, string> = {};
  (data || []).forEach((r: { text_key: string; content: string }) => {
    if (r.content != null && r.content !== "") m[r.text_key] = r.content;
  });
  return m;
}

function buildReminderMail(
  booking: Booking,
  zoomLink: string,
  T: Record<string, string>,
): string {
  const dateLabel = formatDate(booking.date);
  const sessionLabel = booking.type_name || booking.type || "Sitzung";
  const customerName = (booking.customer && booking.customer.name) || "";
  const v = { name: escapeHtml(customerName) };
  const heading = fill(T["email:reminder_heading"] ?? "Erinnerung: deine Sitzung morgen", v);
  const intro = fill(T["email:reminder_intro"] ?? "Liebe*r {name}, ich freue mich auf unsere Sitzung morgen.", v);
  const prep = fill(T["email:reminder_prep"] ?? "Nimm dir vor der Sitzung etwas Zeit für dich. Ein ruhiger Raum, ein Glas Wasser, vielleicht ein paar tiefe Atemzüge — alles was dir hilft, anzukommen.", v);
  const signature = fill(T["email:reminder_signature"] ?? "Bis morgen, Nicole", v);
  const footer = fill(T["email:footer"] ?? "soulbynici · Energiearbeit · Heilung · Selbstverbindung", v);

  const zoomSection = zoomLink
    ? `
      <div style="margin-top:2rem;padding:1.5rem;background:#f5f5f5;border-radius:8px;border-left:3px solid #4f6c7e;">
        <p style="margin:0 0 0.8rem 0;font-weight:500;color:#3a4a5a;">Zoom-Link zur Sitzung:</p>
        <a href="${zoomLink}" style="display:inline-block;padding:0.8rem 1.5rem;background:#4f6c7e;color:white;text-decoration:none;border-radius:6px;">In Zoom öffnen</a>
        <p style="margin:1rem 0 0 0;font-size:0.85rem;color:#888;word-break:break-all;">
          Oder kopieren: ${zoomLink}
        </p>
      </div>
    `
    : "";

  return `
    <div style="font-family:Inter,Arial,sans-serif;color:#3a4a5a;max-width:600px;margin:0 auto;padding:2rem;">
      <h1 style="font-family:'Cormorant Garamond',serif;font-weight:300;font-size:2rem;color:#4f6c7e;margin-bottom:1rem;">
        ${heading}
      </h1>
      <p style="line-height:1.7;">
        ${intro}
      </p>

      <div style="margin-top:1.5rem;padding:1.5rem;background:#fffaf3;border-radius:8px;">
        <p style="margin:0 0 0.5rem 0;font-size:0.85rem;text-transform:uppercase;letter-spacing:0.1em;color:#888;">
          ${escapeHtml(sessionLabel)}
        </p>
        <p style="font-size:1.1rem;line-height:1.7;margin:0;">
          <strong>${dateLabel}</strong><br>
          um <strong>${booking.time}</strong> Uhr
          ${booking.duration ? `<br>${booking.duration} Minuten` : ""}
        </p>
      </div>

      ${zoomSection}

      <p style="margin-top:2rem;line-height:1.7;font-style:italic;color:#5a6a7a;">
        ${prep}
      </p>

      <p style="margin-top:2rem;font-family:'Cormorant Garamond',serif;font-style:italic;font-size:1.2rem;color:#b08968;">
        ${signature}
      </p>

      <hr style="border:none;border-top:1px solid #e0e0e0;margin:2rem 0;">
      <p style="font-size:0.85rem;color:#888;">
        ${footer}<br>
        <a href="https://www.soulbynici.ch" style="color:#4f6c7e;">www.soulbynici.ch</a> ·
        <a href="mailto:info@soulbynici.ch" style="color:#4f6c7e;">info@soulbynici.ch</a>
      </p>
    </div>
  `;
}

serve(async (_req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Zoom-Link
    const { data: zoomRow } = await supabase
      .from("site_texts")
      .select("content")
      .eq("text_key", "config:zoom_link")
      .single();
    const zoomLink = zoomRow?.content || "";

    // Editierbare E-Mail-Texte laden (Admin -> E-Mail-Texte)
    const T = await loadEmailTexts(supabase);
    const subject = T["email:reminder_subject"] ?? "Erinnerung: deine Sitzung morgen";

    // Fenster: Buchungen die zwischen 23h und 25h von jetzt stattfinden
    // (toleranter Bereich, falls Cron mal um eine Stunde versetzt läuft)
    const now = new Date();
    const targetStart = new Date(now.getTime() + 23 * 60 * 60 * 1000);
    const targetEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000);

    // ISO-Strings für Vergleich
    const fmt = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };

    // Hol alle Buchungen mit Datum im Zielfenster, die noch keine Reminder bekommen haben
    const { data: bookings, error } = await supabase
      .from("bookings")
      .select("*")
      .gte("date", fmt(targetStart))
      .lte("date", fmt(targetEnd))
      .is("reminder_sent_at", null);
    if (error) throw error;

    const results: string[] = [];

    for (const b of (bookings || []) as Booking[]) {
      // Genaue Zeit prüfen: ist Buchung wirklich in 23-25h?
      const [bh, bm] = b.time.split(":").map(Number);
      const [y, m, d] = b.date.split("-").map(Number);
      const bookingDate = new Date(y, m - 1, d, bh, bm);
      const diffMs = bookingDate.getTime() - now.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);

      if (diffHours < 23 || diffHours > 25) continue;
      const email = b.customer?.email;
      if (!email) continue;

      try {
        await sendResendEmail(
          email,
          subject,
          buildReminderMail(b, zoomLink, T),
        );
        // Reminder als versendet markieren
        await supabase
          .from("bookings")
          .update({ reminder_sent_at: new Date().toISOString() })
          .eq("id", b.id);
        results.push(`OK ${email} → ${b.date} ${b.time}`);
      } catch (e) {
        results.push(`ERR ${email}: ${(e as Error).message}`);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        checked: bookings?.length || 0,
        sent: results.filter((r) => r.startsWith("OK")).length,
        results,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
