// Supabase Edge Function: send-booking-email
// Wird vom Frontend nach erfolgreicher Buchung aufgerufen.
// Liest die Buchung aus der DB, baut eine HTML-Mail mit ICS-Anhang und versendet via Resend.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "info@soulbynici.ch";
const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") || "n.zauta@forol.ch";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Booking {
  id: string;
  date: string;
  time: string;
  duration?: number;
  type?: string;
  type_name?: string;
  price?: number;
  customer?: {
    name?: string;
    email?: string;
    phone?: string;
    notes?: string;
    discount?: {
      label?: string;
      original_price?: number;
      final_price?: number;
      discount_amount?: number;
    };
  };
}

interface Attachment {
  filename: string;
  content: string; // base64
  contentType?: string;
}

async function sendResendEmail(
  to: string,
  subject: string,
  html: string,
  attachments?: Attachment[],
) {
  const body: Record<string, unknown> = {
    from: `soulbynici <${FROM_EMAIL}>`,
    to: [to],
    subject,
    html,
  };
  if (attachments && attachments.length > 0) {
    body.attachments = attachments.map((a) => ({
      filename: a.filename,
      content: a.content,
    }));
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Resend ${res.status}: ${errText}`);
  }
  return res.json();
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

function escapeHtml(s: string | undefined | null): string {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function escapeIcs(s: string): string {
  return String(s)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function buildIcs(bookings: Booking[], zoomLink: string): string {
  const now = new Date();
  const dtstamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

  const header = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//soulbynici//Booking//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VTIMEZONE",
    "TZID:Europe/Zurich",
    "BEGIN:STANDARD",
    "DTSTART:19701025T030000",
    "TZOFFSETFROM:+0200",
    "TZOFFSETTO:+0100",
    "TZNAME:CET",
    "RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10",
    "END:STANDARD",
    "BEGIN:DAYLIGHT",
    "DTSTART:19700329T020000",
    "TZOFFSETFROM:+0100",
    "TZOFFSETTO:+0200",
    "TZNAME:CEST",
    "RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3",
    "END:DAYLIGHT",
    "END:VTIMEZONE",
  ];

  const events: string[] = [];
  const isPack = bookings.length > 1;

  bookings.forEach((b, i) => {
    const [y, m, d] = b.date.split("-").map(Number);
    const [hh, mm] = b.time.split(":").map(Number);
    const start = `${y}${pad2(m)}${pad2(d)}T${pad2(hh)}${pad2(mm)}00`;
    const startDate = new Date(y, m - 1, d, hh, mm);
    const dur = b.duration || 75;
    const endDate = new Date(startDate.getTime() + dur * 60 * 1000);
    const end = `${endDate.getFullYear()}${pad2(endDate.getMonth() + 1)}${pad2(endDate.getDate())}T${pad2(endDate.getHours())}${pad2(endDate.getMinutes())}00`;

    const title = isPack
      ? `soulbynici · 4er-Paket · Termin ${i + 1}/4`
      : `soulbynici · ${b.type_name || "Sitzung"}`;

    const customerName = (b.customer && b.customer.name) || "";
    let description =
      "Energiearbeit mit Nicole Zauta\\n\\n" +
      (customerName ? `Klient*in: ${customerName}\\n` : "") +
      `Buchungs-Nr.: ${b.id || "-"}\\n\\n`;
    if (zoomLink) {
      description += `Zoom-Link: ${zoomLink}\\n\\n`;
    }
    description += "Bei Fragen: info@soulbynici.ch";

    const location = zoomLink
      ? `Online via Zoom: ${zoomLink}`
      : "soulbynici · Online via Zoom (Link folgt)";

    events.push(
      "BEGIN:VEVENT",
      `UID:${b.id}@soulbynici.ch`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;TZID=Europe/Zurich:${start}`,
      `DTEND;TZID=Europe/Zurich:${end}`,
      `SUMMARY:${escapeIcs(title)}`,
      `DESCRIPTION:${escapeIcs(description)}`,
      `LOCATION:${escapeIcs(location)}`,
      "STATUS:CONFIRMED",
      "BEGIN:VALARM",
      "TRIGGER:-PT24H",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeIcs("Erinnerung: " + title)}`,
      "END:VALARM",
      "END:VEVENT",
    );
  });

  return [...header, ...events, "END:VCALENDAR"].join("\r\n");
}

function icsToBase64(ics: string): string {
  // Deno-native UTF-8 -> base64
  return btoa(unescape(encodeURIComponent(ics)));
}

function buildClientMail(
  booking: Booking,
  zoomLink: string,
  isPack: boolean,
  packAll?: Booking[],
): string {
  const dateLabel = formatDate(booking.date);
  const sessionLabel = booking.type_name || booking.type || "Sitzung";
  const customerName = (booking.customer && booking.customer.name) || "";

  const allTerminsHtml = isPack && packAll
    ? `
      <p style="margin-top:1rem;">Deine vier Termine:</p>
      <ul style="line-height:1.8;">
        ${
      packAll
        .slice()
        .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
        .map((b, i) =>
          `<li>Termin ${i + 1}: <strong>${
            formatDate(b.date)
          }</strong> um <strong>${b.time}</strong></li>`
        )
        .join("")
    }
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

  const calendarHint = `
    <div style="margin-top:1.5rem;padding:1.2rem;background:#fffaf3;border-radius:8px;border-left:3px solid #b08968;">
      <p style="margin:0;font-size:0.95rem;line-height:1.6;">
        📅 Im Anhang findest du eine Kalender-Datei (.ics) — öffne sie, um den Termin direkt in deinen
        Google Calendar, Apple Calendar oder Outlook zu speichern.
      </p>
    </div>
  `;

  return `
    <div style="font-family:Inter,Arial,sans-serif;color:#3a4a5a;max-width:600px;margin:0 auto;padding:2rem;">
      <h1 style="font-family:'Cormorant Garamond',serif;font-weight:300;font-size:2rem;color:#4f6c7e;margin-bottom:1rem;">
        Liebe*r ${escapeHtml(customerName)},
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
      ${calendarHint}

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

function buildAdminMail(
  booking: Booking,
  isPack: boolean,
  packAll?: Booking[],
): string {
  const dateLabel = formatDate(booking.date);
  const sessionLabel = booking.type_name || booking.type;
  const customer = booking.customer || {};
  const customerName = customer.name || "";
  const customerEmail = customer.email || "";
  const customerPhone = customer.phone || "";
  const customerNotes = customer.notes || "";

  const allTerminsHtml = isPack && packAll
    ? `<ul style="line-height:1.8;">
         ${
      packAll
        .slice()
        .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
        .map((b, i) =>
          `<li>Termin ${
            i + 1
          }: ${formatDate(b.date)} um ${b.time}</li>`
        )
        .join("")
    }
       </ul>`
    : `<p><strong>${dateLabel}</strong> um <strong>${booking.time}</strong> Uhr</p>`;

  return `
    <div style="font-family:Inter,Arial,sans-serif;color:#3a4a5a;max-width:600px;margin:0 auto;padding:2rem;">
      <h2 style="font-family:'Cormorant Garamond',serif;font-weight:300;color:#4f6c7e;">Neue Buchung</h2>
      <p><strong>${escapeHtml(customerName)}</strong>${
    customerEmail ? ` &lt;${escapeHtml(customerEmail)}&gt;` : ""
  }</p>
      ${customerPhone ? `<p>Tel: ${escapeHtml(customerPhone)}</p>` : ""}
      <p><strong>Angebot:</strong> ${escapeHtml(sessionLabel || "")}</p>
      ${allTerminsHtml}
      ${
    customerNotes
      ? `<p style="margin-top:1rem;"><strong>Notizen:</strong><br>${
        escapeHtml(customerNotes)
      }</p>`
      : ""
  }
      ${booking.price ? `<p><strong>Preis:</strong> CHF ${booking.price}</p>` : ""}
      <p style="margin-top:1.5rem;font-size:0.85rem;color:#888;">
        📅 Im Anhang findest du eine Kalender-Datei (.ics) zum direkten Speichern in deinem Kalender.
      </p>
    </div>
  `;
}

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }
    const body = await req.json();
    const bookingIds: string[] = body.booking_ids || [];
    if (bookingIds.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: "no booking_ids" }),
        { status: 400 },
      );
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
      return new Response(
        JSON.stringify({ ok: false, error: "bookings not found" }),
        { status: 404 },
      );
    }

    const first = bookings[0] as Booking;
    const isPack = bookings.length > 1;
    const customerEmail = first.customer?.email;

    // ICS bauen
    const icsContent = buildIcs(bookings as Booking[], zoomLink);
    const icsBase64 = icsToBase64(icsContent);
    const icsFilename = isPack
      ? "soulbynici-4er-paket.ics"
      : `soulbynici-${first.date.replace(/-/g, "")}.ics`;

    // Mail an Klient*in
    if (customerEmail) {
      await sendResendEmail(
        customerEmail,
        isPack ? "Deine 4 Termine sind gebucht" : "Dein Termin ist gebucht",
        buildClientMail(first, zoomLink, isPack, bookings as Booking[]),
        [{ filename: icsFilename, content: icsBase64 }],
      );
    }

    // Admin-Mail an Nicole
    await sendResendEmail(
      ADMIN_EMAIL,
      isPack
        ? `Neue 4er-Paket-Buchung: ${first.customer?.name || "?"}`
        : `Neue Buchung: ${first.customer?.name || "?"} · ${
          formatDate(first.date)
        } ${first.time}`,
      buildAdminMail(first, isPack, bookings as Booking[]),
      [{ filename: icsFilename, content: icsBase64 }],
    );

    return new Response(
      JSON.stringify({
        ok: true,
        count: bookings.length,
        zoom_included: !!zoomLink,
        ics_attached: true,
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
