// Supabase Edge Function: send-booking-email
// Wird vom Frontend nach erfolgreicher Buchung aufgerufen.
// Liest die Buchung aus der DB, baut eine HTML-Mail und versendet via Resend.
// Inkludiert den Zoom-Link aus site_texts (config:zoom_link).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "info@soulbynici.ch";
const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") || "n.zauta@forol.ch";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Booking {
  id: string;
  name: string;
  email: string;
  phone?: string;
  date: string;
  time: string;
  session_type: string;
  session_name?: string;
  duration?: number;
  price?: number;
  notes?: string;
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

function formatDate(dateStr: string): string {
  // dateStr: YYYY-MM-DD
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("de-CH", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function buildClientMail(
  booking: Booking,
  zoomLink: string,
  isPack: boolean,
  packAll?: Booking[],
): string {
  const dateLabel = formatDate(booking.date);
  const sessionLabel = booking.session_name || booking.session_type;

  const allTerminsHtml = isPack && packAll
    ? `
      <p style="margin-top:1rem;">Deine vier Termine:</p>
      <ul style="line-height:1.8;">
        ${packAll
          .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
          .map((b, i) =>
            `<li>Termin ${i + 1}: <strong>${formatDate(b.date)}</strong> um <strong>${b.time}</strong></li>`
          )
          .join("")}
      </ul>
    `
    : `
      <p style="font-size:1.1rem;line-height:1.7;">
        <strong>${dateLabel}</strong><br>
        um <strong>${booking.time}</strong> Uhr<br>
        ${booking.duration ? `${booking.duration} Minuten` : ""}
      </p>
    `;

  const zoomSection = zoomLink
    ? `
      <div style="margin-top:2rem;padding:1.2rem;background:#f5f5f5;border-radius:8px;border-left:3px solid #4f6c7e;">
        <p style="margin:0 0 0.5rem 0;font-weight:500;color:#3a4a5a;">Zoom-Link zur Sitzung:</p>
        <a href="${zoomLink}" style="color:#4f6c7e;word-break:break-all;">${zoomLink}</a>
        <p style="margin:0.5rem 0 0 0;font-size:0.85rem;color:#888;">
          Du erhältst 24h vor deinem Termin nochmals eine Erinnerung mit diesem Link.
        </p>
      </div>
    `
    : "";

  return `
    <div style="font-family:Inter,Arial,sans-serif;color:#3a4a5a;max-width:600px;margin:0 auto;padding:2rem;">
      <h1 style="font-family:'Cormorant Garamond',serif;font-weight:300;font-size:2rem;color:#4f6c7e;margin-bottom:1rem;">
        Liebe*r ${booking.name},
      </h1>
      <p style="line-height:1.7;">
        Ich freue mich, dass du dich für eine Sitzung entschieden hast. Deine Buchung ist bestätigt:
      </p>

      <div style="margin-top:1.5rem;padding:1.5rem;background:#fffaf3;border-radius:8px;">
        <p style="margin:0 0 0.5rem 0;font-size:0.85rem;text-transform:uppercase;letter-spacing:0.1em;color:#888;">
          ${escapeHtml(sessionLabel)}
        </p>
        ${allTerminsHtml}
      </div>

      ${zoomSection}

      <p style="margin-top:2rem;line-height:1.7;">
        Falls du den Termin verschieben oder absagen möchtest, melde dich bitte mindestens 24h vorher bei mir.
      </p>

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

function buildAdminMail(booking: Booking, isPack: boolean, packAll?: Booking[]): string {
  const dateLabel = formatDate(booking.date);
  const sessionLabel = booking.session_name || booking.session_type;
  const allTerminsHtml = isPack && packAll
    ? `<ul style="line-height:1.8;">
         ${packAll
           .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
           .map((b, i) => `<li>Termin ${i + 1}: ${formatDate(b.date)} um ${b.time}</li>`)
           .join("")}
       </ul>`
    : `<p><strong>${dateLabel}</strong> um <strong>${booking.time}</strong> Uhr</p>`;

  return `
    <div style="font-family:Inter,Arial,sans-serif;color:#3a4a5a;max-width:600px;margin:0 auto;padding:2rem;">
      <h2 style="font-family:'Cormorant Garamond',serif;font-weight:300;color:#4f6c7e;">Neue Buchung</h2>
      <p><strong>${escapeHtml(booking.name)}</strong>${booking.email ? ` &lt;${escapeHtml(booking.email)}&gt;` : ""}</p>
      ${booking.phone ? `<p>Tel: ${escapeHtml(booking.phone)}</p>` : ""}
      <p><strong>Angebot:</strong> ${escapeHtml(sessionLabel)}</p>
      ${allTerminsHtml}
      ${booking.notes ? `<p style="margin-top:1rem;"><strong>Notizen:</strong><br>${escapeHtml(booking.notes)}</p>` : ""}
      ${booking.price ? `<p><strong>Preis:</strong> CHF ${booking.price}</p>` : ""}
    </div>
  `;
}

function escapeHtml(s: string | undefined | null): string {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }
    const body = await req.json();
    const bookingIds: string[] = body.booking_ids || [];
    if (bookingIds.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: "no booking_ids" }), {
        status: 400,
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Zoom-Link aus site_texts holen
    const { data: zoomRow } = await supabase
      .from("site_texts")
      .select("content")
      .eq("text_key", "config:zoom_link")
      .single();
    const zoomLink = zoomRow?.content || "";

    // Buchungen laden
    const { data: bookings, error } = await supabase
      .from("bookings")
      .select("*")
      .in("id", bookingIds);
    if (error) throw error;
    if (!bookings || bookings.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: "bookings not found" }), {
        status: 404,
      });
    }

    const first = bookings[0] as Booking;
    const isPack = bookings.length > 1;

    // Mail an Klient*in
    if (first.email) {
      await sendResendEmail(
        first.email,
        isPack ? "Deine 4 Termine sind gebucht" : "Dein Termin ist gebucht",
        buildClientMail(first, zoomLink, isPack, bookings as Booking[]),
      );
    }

    // Admin-Mail an Nicole
    await sendResendEmail(
      ADMIN_EMAIL,
      isPack
        ? `Neue 4er-Paket-Buchung: ${first.name}`
        : `Neue Buchung: ${first.name} · ${formatDate(first.date)} ${first.time}`,
      buildAdminMail(first, isPack, bookings as Booking[]),
    );

    return new Response(
      JSON.stringify({ ok: true, count: bookings.length, zoom_included: !!zoomLink }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
