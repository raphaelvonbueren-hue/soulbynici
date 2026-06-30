// Supabase Edge Function: send-birthday-email
// Wird täglich um 08:00 via pg_cron aufgerufen
// Sucht Klient*innen mit Geburtstag heute und sendet entweder:
// - eine Erinnerung an Nicole (admin) ODER
// - eine Glückwunsch-Mail direkt an die Klientin (je nach Setting)
//
// Setting wird über Supabase Table `settings` gesteuert (key="birthday_mode")
// mode: "admin" (Nicole bekommt Erinnerung) | "client" (Klient*in bekommt Mail) | "both"

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "info@soulbynici.ch";
const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") || "n.zauta@forol.ch";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Client {
  id: string;
  name: string;
  email: string | null;
  birthday: string; // YYYY-MM-DD
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

function buildAdminMail(clients: Client[]): string {
  const list = clients
    .map((c) => {
      const age = c.birthday
        ? new Date().getFullYear() - new Date(c.birthday).getFullYear()
        : "";
      return `<li><strong>${c.name}</strong>${
        c.email ? ` &lt;${c.email}&gt;` : ""
      }${age ? ` — wird ${age}` : ""}</li>`;
    })
    .join("");
  return `
    <div style="font-family:Inter,Arial,sans-serif;color:#3a4a5a;max-width:600px;margin:0 auto;padding:2rem;">
      <h2 style="font-family:'Cormorant Garamond',serif;font-weight:300;color:#4f6c7e;">Heute hat Geburtstag</h2>
      <p>Folgende Klient*innen haben heute Geburtstag:</p>
      <ul style="line-height:1.8;">${list}</ul>
      <p style="margin-top:2rem;font-size:0.85rem;color:#888;">
        Diese Erinnerung kommt von deiner soulbynici-Webseite. Du kannst die Benachrichtigung im Admin-Panel einstellen.
      </p>
    </div>
  `;
}

function buildClientMail(client: Client): string {
  return `
    <div style="font-family:Inter,Arial,sans-serif;color:#3a4a5a;max-width:600px;margin:0 auto;padding:2rem;text-align:center;">
      <h1 style="font-family:'Cormorant Garamond',serif;font-weight:300;font-size:2.5rem;color:#4f6c7e;margin-bottom:1rem;">
        Alles Liebe, ${client.name}!
      </h1>
      <p style="font-size:1.1rem;line-height:1.7;font-style:italic;color:#5a6a7a;">
        Ich wünsche dir von Herzen einen wunderschönen Geburtstag — voller Liebe, Klarheit
        und Verbundenheit mit dir selbst.
      </p>
      <p style="margin-top:2rem;line-height:1.7;">
        Mögest du heute spüren, wie wertvoll und einzigartig du bist.
      </p>
      <p style="margin-top:2rem;font-family:'Cormorant Garamond',serif;font-style:italic;font-size:1.2rem;color:#b08968;">
        Von Herzen, Nicole
      </p>
      <hr style="border:none;border-top:1px solid #e0e0e0;margin:2rem 0;">
      <p style="font-size:0.85rem;color:#888;">
        soulbynici · Energiearbeit · Heilung · Selbstverbindung<br>
        <a href="https://www.soulbynici.ch" style="color:#4f6c7e;">www.soulbynici.ch</a>
      </p>
    </div>
  `;
}

serve(async (_req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Heutiges Datum (Schweizer Zeit, MM-DD)
    const today = new Date();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    const todayMD = `${m}-${d}`;

    // Birthday-Mode aus Settings holen
    const { data: settingRow } = await supabase
      .from("site_texts")
      .select("content")
      .eq("text_key", "config:birthday_mode")
      .single();
    const mode = settingRow?.content || "admin"; // default: nur Nicole

    // Alle Klient*innen mit Geburtstag heute (MM-DD)
    const { data: clients, error } = await supabase
      .from("clients")
      .select("id, name, email, birthday")
      .not("birthday", "is", null);
    if (error) throw error;

    const todays = (clients || []).filter((c: Client) => {
      if (!c.birthday) return false;
      return c.birthday.slice(5) === todayMD; // YYYY-MM-DD → MM-DD
    });

    if (todays.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, today: todayMD, count: 0, mode }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    const results: string[] = [];

    // Admin-Mail (Erinnerung an Nicole)
    if (mode === "admin" || mode === "both") {
      try {
        await sendResendEmail(
          ADMIN_EMAIL,
          `🎂 Geburtstag heute: ${todays.map((c: Client) => c.name).join(", ")}`,
          buildAdminMail(todays),
        );
        results.push(`Admin-Mail an ${ADMIN_EMAIL} versendet`);
      } catch (e) {
        results.push(`Admin-Mail FEHLER: ${(e as Error).message}`);
      }
    }

    // Mails an die Klient*innen
    if (mode === "client" || mode === "both") {
      for (const c of todays) {
        if (!c.email) continue;
        try {
          await sendResendEmail(
            c.email,
            "Alles Liebe zum Geburtstag",
            buildClientMail(c),
          );
          results.push(`Klient-Mail an ${c.email} versendet`);
        } catch (e) {
          results.push(`Klient-Mail an ${c.email} FEHLER: ${(e as Error).message}`);
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: true, today: todayMD, count: todays.length, mode, results }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
