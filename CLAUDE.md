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
- stripe-webhook: verarbeitet checkout.session.completed, payment_intent.payment_failed, charge.refunded; setzt bookings/orders auf paid/refunded. Braucht STRIPE_WEBHOOK_SECRET.
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

## Gotchas
- SQL: ALTER TABLE ADD COLUMN + CREATE INDEX auf dieselbe neue Spalte im selben Batch -> ganze Transaktion rollt zurück ("column does not exist"). Lösung: erst alle ALTER, dann separat die INDEX.
- orders-Tabelle hat ALT-Struktur (nicht die neue annehmen).
- zsh nimmt # interaktiv NICHT als Kommentar (eingefügte Kommentarzeilen geben harmlose Fehler).
- Edit-Mode-Texte in site_texts überschreiben das HTML.

## OFFENE TODOS (priorisiert)
1. [SICHERHEIT] Stripe sk_live-Key rollen + Secret neu setzen.
2. Cron-Jobs (Supabase -> Database -> Cron, braucht SERVICE_ROLE_KEY):
   - birthday-email-daily   '0 8 * * *'   -> net.http_post auf .../send-birthday-email
   - reminder-24h-hourly    '0 * * * *'   -> net.http_post auf .../send-reminder-24h
3. ADMIN_EMAIL prüfen/setzen auf info@soulbynici.ch.
4. Vercel Analytics + Speed Insights im Vercel-Dashboard aktivieren.
5. Zoom-Link im Admin -> Einstellungen eintragen.
6. Geburtstags-Modus im Admin -> Klient*innen wählen.
7. Echter End-to-End-Zahlungstest (CHF 1 oder 111) + Refund: prüfen dass Webhook auf paid setzt und Mail mit Zoom+ICS ankommt. Reading-Preis liegt bei CHF 111; für 1-Franken-Test Preis temporär senken (Quelle des Preises noch lokalisieren: Admin-Angebote oder DB).
8. AGB + Widerrufsbelehrung (rechtlich, vor echtem Verkauf).
9. Shop-Kauf-Modal-Texte als data-edit editierbar machen (Buchungs-Flow ist schon erledigt, Shop-Modal noch nicht).
10. Google-Kalender 2-Wege-Sync via OAuth (Doppelbuchungs-Schutz inkl. privater Termine) — eigenes grösseres Projekt.
11. MWST + Schweizer QR-Rechnung als PDF (orders hat vat_-Felder bereit).
12. Shop Phase 3: Abos, Mitglieder-Login.
