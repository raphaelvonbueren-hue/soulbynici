# Soul by Nici · Deployment-Anleitung

Diese Anleitung führt dich von 0 auf live. **Plane dafür ca. 60 Minuten ein.**

Alles, was du brauchst:
- Ein **GitHub-Account** (kostenlos) — github.com
- Ein **Supabase-Account** (kostenlos) — supabase.com
- Ein **Vercel-Account** (kostenlos) — vercel.com
- Eine **Domain** (~CHF 15/Jahr) — z.B. bei Infomaniak, Hostpoint oder direkt bei Vercel

---

## Schritt 1 · Supabase-Projekt erstellen (10 Min.)

### 1.1 · Account anlegen
1. Gehe auf **[supabase.com](https://supabase.com)** und klicke "Start your project"
2. Mit GitHub einloggen (einfachster Weg)

### 1.2 · Neues Projekt
1. Klicke "New project"
2. Felder ausfüllen:
   - **Organization:** deine Standard-Organisation
   - **Name:** `soul-by-nici`
   - **Database Password:** **Generiere ein starkes Passwort** und speichere es in einem Passwort-Manager. Du brauchst es selten, aber es ist kritisch.
   - **Region:** wähle **Frankfurt (Central EU)** — nächste zur Schweiz und EU-DSG-konform
   - **Pricing Plan:** Free
3. Klicke "Create new project" und warte ~2 Minuten, bis die Datenbank bereit ist

### 1.3 · Schema einspielen
1. Im linken Menü: **SQL Editor** anklicken
2. Klicke auf "+ New query"
3. **Öffne die Datei `schema.sql`** aus diesem Paket in einem Texteditor
4. **Kopiere den gesamten Inhalt** und füge ihn ins SQL-Editor-Fenster ein
5. Klicke unten rechts auf den grünen "Run"-Button (oder `Ctrl/Cmd + Enter`)
6. Warte bis unten "Success" erscheint und die Erfolgsmeldung "Schema erfolgreich erstellt..." zu sehen ist

### 1.4 · Admin-User für Nicole anlegen
1. Im linken Menü: **Authentication → Users**
2. Klicke oben rechts auf "**Add user**" → "**Create new user**"
3. Eingabe:
   - **Email:** Nicoles E-Mail-Adresse (z.B. `hello@soulbynici.ch`)
   - **Password:** ein starkes Admin-Passwort (mindestens 12 Zeichen)
   - **Auto Confirm User:** ✅ aktivieren (sehr wichtig!)
4. Klicke "Create user"

### 1.5 · API-Keys kopieren
1. Im linken Menü ganz unten: **Project Settings** (Zahnrad-Icon)
2. Klicke auf **API** in der Seiten-Navigation
3. Du siehst zwei Felder, die du brauchst:
   - **Project URL** — sieht aus wie `https://abcdefghijklmnop.supabase.co`
   - **anon · public** — ein langer String beginnend mit `eyJ...`
4. **Kopiere beide Werte** — du brauchst sie gleich

---

## Schritt 2 · API-Keys in `index.html` einsetzen (2 Min.)

1. Öffne `index.html` in einem Texteditor (VSCode, Sublime, oder einfach TextEdit)
2. Drücke `Ctrl/Cmd + F` und suche nach `YOUR_SUPABASE_URL`
3. Du findest folgenden Block:
   ```javascript
   window.SUPABASE_CONFIG = {
     url: 'YOUR_SUPABASE_URL',
     anonKey: 'YOUR_SUPABASE_ANON_KEY'
   };
   ```
4. Ersetze die beiden Platzhalter mit deinen Werten:
   ```javascript
   window.SUPABASE_CONFIG = {
     url: 'https://abcdefghijklmnop.supabase.co',
     anonKey: 'eyJhbGciOiJIUzI1NiIsInR5...'
   };
   ```
5. **Speichern**

> **Sicherheits-Hinweis:** Beide Werte sind designt, um öffentlich zu sein. Der Schutz deiner Daten passiert auf Datenbank-Ebene durch Row-Level-Security-Regeln, die das Schema bereits eingerichtet hat. Niemand kann an die Klient*innen-Daten ohne gültiges Login.

---

## Schritt 3 · GitHub-Repository erstellen (5 Min.)

1. Auf **[github.com](https://github.com)** einloggen
2. Klicke oben rechts auf "+" → "**New repository**"
3. Felder:
   - **Repository name:** `soul-by-nici`
   - **Description:** "Webseite Soul by Nici"
   - **Public** oder **Private** — beides geht (privat empfohlen)
   - **Initialize this repository** — **NICHTS** anhaken
4. Klicke "Create repository"

### 3.1 · Dateien hochladen
1. Auf der frischen Repository-Seite siehst du oben "**uploading an existing file**" — klicke darauf
2. Ziehe folgende **3 Dateien** ins Browser-Fenster:
   - `index.html` (mit deinen Supabase-Keys von Schritt 2!)
   - `vercel.json`
   - `DEPLOYMENT.md` (diese Datei, optional)
3. Unten "Commit changes" klicken

> Alternativ via Kommandozeile, falls dir das geläufiger ist: `git clone`, Files reinpacken, `git push`.

---

## Schritt 4 · Vercel verbinden & deployen (5 Min.)

1. Auf **[vercel.com](https://vercel.com)** einloggen (mit GitHub einloggen)
2. Auf dem Dashboard: "**Add New** → **Project**"
3. Vercel zeigt deine GitHub-Repos. Wähle `soul-by-nici` und klicke "**Import**"
4. Configure-Page:
   - **Framework Preset:** "Other" (Vercel erkennt static automatisch)
   - **Root Directory:** `./`
   - **Build & Output Settings:** alle leer lassen
   - **Environment Variables:** keine nötig (Keys sind im HTML)
5. Klicke "**Deploy**" → ~30 Sekunden warten
6. **Fertig!** Vercel zeigt eine URL wie `soul-by-nici-xyz.vercel.app` — die ist live

### 4.1 · Erster Test
1. Öffne die Vercel-URL im Browser
2. **Prüfe:**
   - ✅ Seite lädt normal, alle Bilder, Text, Stimmen, FAQ sichtbar
   - ✅ Footer scrollen, klicke "Admin"
   - ✅ Login-Modal: gib Nicoles E-Mail + das Passwort aus Schritt 1.4 ein
   - ✅ Admin-Panel öffnet sich
   - ✅ Klicke einen leeren Tag im Buchungs-Kalender → mache eine Test-Buchung mit deiner eigenen E-Mail
   - ✅ Geh ins Admin-Panel zurück → "Buchungen" → die Test-Buchung sollte erscheinen

### 4.2 · Test-Buchung wieder löschen
Im Admin-Panel "Buchungen" → "Endgültig löschen" — sonst blockiert sie den Slot.

---

## Schritt 5 · Eigene Domain anbinden (10 Min.)

### Wenn du die Domain bei Vercel kaufst:
1. Vercel-Dashboard → dein Projekt → "**Settings** → **Domains**"
2. Gib `soulbynici.ch` ein → "Add"
3. Vercel führt dich durch den Kauf (~CHF 25/Jahr)

### Wenn du die Domain bei Infomaniak/Hostpoint hast:
1. Vercel-Dashboard → dein Projekt → "**Settings** → **Domains**"
2. Gib `soulbynici.ch` ein → "Add"
3. Vercel zeigt dir DNS-Einstellungen, die du beim Domain-Anbieter setzen musst:
   - **Typ A** für `@` → `76.76.21.21`
   - **Typ CNAME** für `www` → `cname.vercel-dns.com`
4. Bei Infomaniak/Hostpoint einloggen → Domain → DNS-Einstellungen → diese beiden Einträge eintragen
5. Warten (5 Minuten bis 24 Stunden, meistens unter 30 Min.) bis Vercel "✓ Valid" anzeigt
6. SSL/HTTPS wird automatisch eingerichtet (Let's Encrypt)

---

## Schritt 6 · Erste echte Konfiguration (10 Min.)

Logge dich nun mit Nicole-Account ins Admin-Panel ein und mache:

### 6.1 · Verfügbarkeit anpassen
"**Verfügbarkeit**" Tab — die Default-Tage/Zeiten passen vermutlich nicht zu Nicoles echtem Plan. Stelle hier ein, an welchen Wochentagen und zu welchen Uhrzeiten sie verfügbar ist.

### 6.2 · Texte anpassen
"**Texte**" Tab → Anleitung lesen → Modus aktivieren → alle Texte direkt anklicken und bearbeiten.

Wichtigste Stellen für den Anfang:
- Hero (Startseite-Titel + Untertitel)
- About-Mich-Sektion
- Im Business-Bereich: Standort, Kontakt-Daten, Stat-Zahlen

### 6.3 · Links pflegen
"**Links**" Tab → Telefonnummer eintragen, WhatsApp-Nummer eintragen, Social-Media-URLs prüfen.

### 6.4 · Stimmen ergänzen / entfernen
"**Stimmen**" Tab → die 3 Standard-Testimonials sind Platzhalter. Schreibe echtes Klient*innen-Feedback hier ein (mit Einverständnis natürlich).

---

## Was funktioniert jetzt automatisch

✅ **Echte Buchungen** werden in der Datenbank gespeichert — Nicole sieht sie auf jedem Gerät
✅ **Race-Condition-Schutz**: Niemand kann denselben Slot doppelt buchen (Datenbank-Constraint)
✅ **Atomare Pack-Buchungen**: Entweder alle 4 Termine werden gebucht, oder keiner
✅ **Klient*innen-Akten** sind verschlüsselt in der Cloud, nur mit Login einsehbar
✅ **Datenschutz**: Public sieht nur freie/belegte Slot-Zeiten, niemals Namen/E-Mails anderer Klient*innen
✅ **HTTPS** ist überall erzwungen
✅ **Backup**: Supabase macht automatische tägliche Backups (Free-Plan: 7 Tage Retention)

---

## Was noch nicht automatisch passiert (Phase 2)

❌ **E-Mail-Versand bei Buchung** — Nicole muss aktuell von Hand bestätigen
❌ **Zoom-Link-Generierung** — muss manuell in der Bestätigungs-E-Mail mitgegeben werden
❌ **Kalender-Sync** mit Google/iCloud-Kalender
❌ **Erinnerungs-E-Mails** vor Sitzung
❌ **Calendar-Invites (.ics-Datei)** im Bestätigungs-Mail

Diese Features lassen sich später per Supabase Edge Functions + Resend (E-Mail-Service) ergänzen — sag Bescheid, wenn das relevant wird.

**Workflow für Nicole bis dahin:**
1. Sie checkt täglich das Admin-Panel auf neue Buchungen
2. Sie schreibt manuell eine Bestätigungs-E-Mail mit Zoom-Link
3. Vor jeder Sitzung schickt sie eine Erinnerung mit dem Zoom-Link

---

## Wartung & Updates

### Code ändern
1. Lokale Änderung in `index.html`
2. Im GitHub-Repo: alte Datei löschen, neue hochladen → Commit
3. Vercel deployt automatisch in ~30 Sekunden

### Datenbank-Backup
Supabase macht automatisch täglich Backups. Manuell auch via:
- Supabase Dashboard → Database → Backups → Download

### Daten exportieren
Im Admin-Panel:
- **Buchungen** → "CSV exportieren" (für Buchhaltung)
- **Newsletter** → "CSV exportieren" (für externes Newsletter-Tool)

---

## Probleme?

### "Backend nicht konfiguriert" beim Login
→ Du hast `YOUR_SUPABASE_URL` oder `YOUR_SUPABASE_ANON_KEY` im HTML nicht ersetzt. Schritt 2 nochmals.

### Login funktioniert nicht
→ Hast du in Supabase Auth den User mit "Auto Confirm User" angelegt? (Schritt 1.4)
→ Alternativ: `Supabase Dashboard → Authentication → Users` → klicke den User → "Send password recovery"

### Buchungen kommen nicht an
→ Browser-Konsole öffnen (F12) → Tab "Console" → Fehler ansehen
→ Häufiger Fehler: "permission denied" → Schema wurde unvollständig ausgeführt → Schritt 1.3 wiederholen

### "RLS Policy violation"
→ Eine Row-Level-Security-Regel wurde nicht richtig erstellt. Im SQL-Editor das Schema noch einmal komplett ausführen.

### Test-Klient*innen sehen Fehler beim Buchen
→ Wenn die Test-User nicht eingeloggt sind: das ist normal, sie können trotzdem buchen (`anon_insert`-Policy)
→ Wenn ein Slot bereits belegt ist: erwarteter Fehler, Person soll anderen Slot wählen

---

## Kosten-Überblick (in CHF/Monat)

| Service | Free-Tier (jetzt) | Pro-Plan (bei Bedarf) |
|---------|---|---|
| Supabase | bis ~50.000 Anfragen/Mt., 500 MB DB | ~CHF 25/Mt. |
| Vercel | unlimited static traffic | nur bei extrem hohem Verkehr |
| Domain | — | CHF 1-2/Mt. |
| **Total** | **kostenlos** | **~CHF 25-30/Mt. wenn skaliert** |

Für Soul by Nici reicht der Free-Tier locker. Selbst bei 100 Buchungen/Monat bist du noch deutlich unter den Limits.

---

## Sicherheits-Checkliste vor Live-Gang

- [ ] Admin-Passwort ist mindestens 12 Zeichen lang, mit Sonderzeichen
- [ ] Datenbank-Passwort liegt im Passwort-Manager
- [ ] Eine Test-Buchung wurde erfolgreich angelegt und wieder entfernt
- [ ] Datenschutzerklärung wurde aktualisiert (Adresse, Kontakt, etc.)
- [ ] Impressum hat die korrekten Daten
- [ ] Newsletter-Anmeldung wurde getestet
- [ ] Pack-Buchung mit 4 Terminen wurde getestet
- [ ] Buchungen werden im Admin-Panel sichtbar
- [ ] Klient*innen-Akte mit Notiz wurde angelegt und gelöscht
- [ ] Bei Logout sind alle Admin-Funktionen wirklich nicht mehr zugänglich

Wenn alle Punkte ✓ sind: **Live-Gang!**
