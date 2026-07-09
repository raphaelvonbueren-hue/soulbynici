# CLAUDE.md — soulbynici

Projekt-Gedächtnis für Claude Code. Bitte vor jeder Arbeit lesen.

## Projekt
Single-File-Website für Nicole Zauta (Energiearbeit / Heilung, Schweiz).
- Live: https://www.soulbynici.ch  (+ soulbynici.vercel.app, Vercel Pro)
- Repo: raphaelvonbueren-hue/soulbynici
- Hauptdatei: index.html (~445 KB, ~12'800 Zeilen, kein Framework — alles inline)
- Inhaber/Dev: Raphael von Büren (FOROL). Admin-Login der Seite: n.zauta@forol.ch

## Stack
- Frontend: eine index.html (HTML/CSS/JS inline), Hosting Vercel, Auto-Deploy bei push auf main (~30s)
- Backend: Supabase (Postgres + Edge Functions + Auth)
- Projekt-ID Supabase: zaieumbmfksnfzbzqqln  (Org "Nicole Zauta", Free-Tier — Status zeigt teils "Unhealthy", funktioniert trotzdem)
- E-Mail: Resend.  Zahlungen: Stripe (Checkout).  Analytics: Vercel (im <head>, muss im Dashboard aktiviert werden)

## Konventionen
- Schweizer Deutsch, "ss" statt "ß". Schweizer Zahlenformat (Apostroph-Tausender).
- Edit-Mode: Texte mit data-edit-Attribut sind im Frontend editierbar; Overrides liegen in der Tabelle site_texts (Keys z.B. config:zoom_link, config:hidden_nav_items). normalizeQuotesInText() erzwingt Schweizer Guillemets «…».
- Autonom arbeiten, sinnvolle Defaults, wenig Rückfragen — ABER bei destruktiven DB-Ops und Deploys vorher kurz fragen.

## Deploy-Workflow
- Frontend: index.html editieren -> git add/commit/push -> Vercel deployt automatisch.
- Vor jedem Frontend-Deploy JS validieren: grössten inline <script> extrahieren und mit `node -e "new Function(script)"` auf Syntax prüfen.
- Live-Check via raw.githubusercontent.com/raphaelvonbueren-hue/soulbynici/main/index.html (vercel.app/.ch geben Bots 403).
- Edge Functions: flache Dateien edge-function-<name>.ts im Repo-Root sind die Quelle. Deploy:
      cp edge-function-<name>.ts supabase/functions/<name>/index.ts
      supabase functions deploy <name> --no-verify-jwt
  (Docker-Warnung ist harmlos; deployt in die Cloud.)
- GitHub-PAT und alle Secrets werden pro Session geliefert und NIE im Repo gespeichert/committed.

## Supabase — Tabellen (Stand aktuell)
- bookings: id,date,time,duration,type,type_name,price + payment_status, stripe_session_id, stripe_payment_intent_id, paid_at, amount_paid, reminder_sent_at, payment_method
- clients: + allowed_payment_methods (jsonb)
- site_texts: Edit-Mode-Text-Overrides + config:*-Keys
- discount_codes / discount_redemptions
- loyalty_tiers: 3 Stufen (Vertraut 3 Buchungen/5%, Verbunden 5/10%, Verwurzelt 10/15%)
- orders: ALT-Struktur aus früherer Session (customer als jsonb, status, stripe_payment_id, vat_rate, vat_amount, invoice_number, invoice_url) PLUS neu ergänzt: product_name, customer_name, customer_email, discount_code, discount_amount, payment_status, stripe_payment_intent_id, paid_at. Aktuell leer. MWST/Rechnungs-Felder absichtlich behalten für spätere Schweizer Rechnung.
- RLS auf allen aktiv.

## Edge Functions (alle 6 deployed, --no-verify-jwt)
- stripe-create-checkout: erstellt Checkout-Session. WICHTIG: Betrag kommt aus dem Request-Body (amount × 100 = unit_amount), wird NICHT aus der DB gelesen. Nutzt dynamische Zahlungsmethoden (keine feste payment_method_types-Liste mehr) -> Twint erscheint automatisch sobald in Stripe aktiv.
- stripe-webhook: verarbeitet checkout.session.completed, payment_intent.payment_failed, charge.refunded; setzt bookings/orders auf paid/refunded. Braucht STRIPE_WEBHOOK_SECRET. NEU: verschickt nach Zahlung eine Quittungs-Mail (Betrag CH-Format) und nach Refund eine Rückerstattungs-Mail via Resend (best-effort in try/catch nach dem DB-Update, damit Mail-Fehler nie ein 500/Stripe-Retry auslösen). Braucht dafür RESEND_API_KEY + FROM_EMAIL.
- stripe-refund
- send-booking-email: Bestätigung mit ICS-Anhang (RFC-5545, Europe/Zurich, VALARM -24h) + Zoom-Link im LOCATION; Admin-Kopie an ADMIN_EMAIL.
- send-reminder-24h
- send-birthday-email

## Secrets in Supabase (nur Namen — Werte NIE committen)
STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, RESEND_API_KEY, FROM_EMAIL, ADMIN_EMAIL (+ Supabase-Built-ins).

## Stripe — Stand
- Live-Modus. Karten-Zahlung funktioniert (Backend-Test gab status 200 + gültige Session).
- Webhook: EIN Endpoint, Snapshot-Nutzlast, 3 Events (checkout.session.completed, payment_intent.payment_failed, charge.refunded), URL https://zaieumbmfksnfzbzqqln.supabase.co/functions/v1/stripe-webhook
- Twint: wird gerade von der Bank verifiziert -> erscheint automatisch im Checkout, sobald aktiv (dank dynamischer Methoden, kein Code-Deploy nötig).
- SICHERHEIT (zuerst erledigen!): Der sk_live-Schlüssel wurde in einem Chat sichtbar -> in Stripe rollen (Entwickler -> API-Schlüssel -> Schlüssel rollen), danach einmal `supabase secrets set STRIPE_SECRET_KEY=...`. Niemals einen Key in eine Datei schreiben.

## E-Mail / Resend — Stand (BLOCKER)
- Resend versendet aktuell NICHT. API-Key gültig, ABER Domain soulbynici.ch ist in Resend NICHT verifiziert (403 "domain is not verified").
- FROM_EMAIL war falsch gesetzt ("Soul by Nici <onboarding@resend.dev>") -> Functions bauen `soulbynici <${FROM_EMAIL}>` -> Doppel-Wrap -> 422 bei JEDEM Versand. Gefixt: FROM_EMAIL = info@soulbynici.ch (bare).
- Resend-Account-Owner: raphael.von.bueren@psp.live (Sandbox onboarding@resend.dev liefert nur an diese Adresse).
- TODO (nur im Resend-Dashboard + DNS möglich): Domain soulbynici.ch bei resend.com/domains hinzufügen, DKIM/SPF-DNS-Records in die soulbynici.ch-Zone eintragen, verifizieren. Danach greift der FROM_EMAIL-Fix und alle Mails (Buchung/Reminder/Geburtstag/Quittung/Refund) senden. Gleicher Blocker-Typ wie SVSS (richis.ch).
- Routing bestätigt: ADMIN_EMAIL = info@soulbynici.ch (Buchungs-Kopie + Geburtstag). info@zauta.ch nur als mailto-Link in der Kontakt-Sektion (Office Management), kein automatischer Versand.

## Gotchas
- SQL: ALTER TABLE ADD COLUMN + CREATE INDEX auf dieselbe neue Spalte im selben Batch -> ganze Transaktion rollt zurück ("column does not exist"). Lösung: erst alle ALTER, dann separat die INDEX.
- orders-Tabelle hat ALT-Struktur (nicht die neue annehmen).
- zsh nimmt # interaktiv NICHT als Kommentar (eingefügte Kommentarzeilen geben harmlose Fehler).
- Edit-Mode-Texte in site_texts überschreiben das HTML.

## OFFENE TODOS (priorisiert)
1. [SICHERHEIT] Stripe sk_live-Key rollen + Secret neu setzen. → NUR im Stripe-Dashboard (Claude kann das nicht). Geprüft: alter Key ist NICHT im Repo/in der Git-History (nur Chat-Exposition). Danach `supabase secrets set STRIPE_SECRET_KEY=...` selbst ausführen.
2. ✅ Cron-Jobs angelegt (via `supabase db query -f cron-jobs.sql`): birthday-email-daily '0 6 * * *' (=08:00 CH Sommer), reminder-24h-hourly '0 * * * *'. pg_cron+pg_net aktiv. OFFEN: `service_role_key` im Vault setzen (`select vault.create_secret('<KEY>','service_role_key');` im SQL-Editor) — sonst 401 am Gateway.
   ⚠️ Bug gefixt + deployed: send-reminder-24h las b.email/b.name/b.session_type, korrekt ist customer.{name,email} + type_name/type (bookings.customer ist jsonb). clients-Tabelle dagegen hat Top-Level name/email/birthday — send-birthday-email ist korrekt.
3. ✅ ADMIN_EMAIL = info@soulbynici.ch gesetzt.
4. Vercel Analytics + Speed Insights: Scripts SIND im <head>. OFFEN: nur noch Dashboard-Toggle aktivieren (nur im Vercel-Dashboard möglich).
5. ✅ Zoom-Link gesetzt (config:zoom_link in site_texts, vorhanden).
6. Geburtstags-Modus: config:birthday_mode leer -> Default 'admin' (nur Nicole). Auf 'client'/'both' umstellen = Owner-Entscheidung (sendet echte Mails an Klient*innen).
7. Zahlpfad: Owner bestätigt, echter Echtgeld-Test lief durch. Code-Audit bestätigt: create-checkout setzt metadata.type+booking_ids/order_id + payment_status='pending'; Webhook matcht darüber und schreibt payment_status='paid' in real existierende Spalten (bookings + orders, beide inkl. stripe_session_id). KEIN Schema-Bug. OFFEN/ungetestet: (a) Refund-Pfad (charge.refunded) real durchspielen, (b) kein persistenter DB-Beleg da bookings/orders leer — definitiver Nachweis via Stripe Dashboard -> Webhooks -> Delivery-Log (200 auf letztes checkout.session.completed), kein neuer Echtgeld-Test nötig.
8. AGB + Widerrufsbelehrung (rechtlich, vor echtem Verkauf).
9. Shop-Kauf-Modal-Texte als data-edit editierbar machen (Buchungs-Flow ist schon erledigt, Shop-Modal noch nicht).
10. Google-Kalender 2-Wege-Sync via OAuth (Doppelbuchungs-Schutz inkl. privater Termine) — eigenes grösseres Projekt.
11. MWST + Schweizer QR-Rechnung als PDF (orders hat vat_-Felder bereit).
12. Shop Phase 3: Abos, Mitglieder-Login.
