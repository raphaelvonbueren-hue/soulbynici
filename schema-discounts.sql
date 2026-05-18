-- Schema-Update: Rabattcodes (Phase 1: Aktionscodes)
-- Auszuführen in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS discount_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,                -- z.B. 'BLACK24'
  title TEXT NOT NULL,                       -- Aktions-Titel z.B. 'Black Friday'
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value NUMERIC NOT NULL CHECK (discount_value > 0),
  applies_to TEXT NOT NULL DEFAULT 'all' CHECK (applies_to IN ('all', 'bookings', 'shop')),
  valid_from DATE,
  valid_until DATE,
  max_redemptions INTEGER,                   -- NULL = unbegrenzt
  current_redemptions INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discount_codes_code ON discount_codes (code);
CREATE INDEX IF NOT EXISTS idx_discount_codes_active ON discount_codes (active, valid_from, valid_until);

-- Loyalty-Stufen (Stammkundenrabatt — Phase 2)
CREATE TABLE IF NOT EXISTS loyalty_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  min_bookings INTEGER NOT NULL UNIQUE,      -- ab X Buchungen
  discount_percent NUMERIC NOT NULL CHECK (discount_percent > 0 AND discount_percent <= 100),
  label TEXT,                                 -- z.B. 'Stammkundin'
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Default-Stufen einfügen (5/10/15% bei 3/5/10 Buchungen)
INSERT INTO loyalty_tiers (min_bookings, discount_percent, label)
  VALUES (3, 5, 'Vertraut'), (5, 10, 'Verbunden'), (10, 15, 'Verwurzelt')
  ON CONFLICT (min_bookings) DO NOTHING;

-- Tracking welcher Code wo eingelöst wurde (für Statistiken)
CREATE TABLE IF NOT EXISTS discount_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discount_code_id UUID REFERENCES discount_codes(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  order_id UUID,                             -- für Shop-Orders falls vorhanden
  client_email TEXT,
  amount_before NUMERIC,
  amount_after NUMERIC,
  discount_amount NUMERIC,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_redemptions_code ON discount_redemptions (discount_code_id);

-- RLS: Öffentliches Lesen aktiver Codes erlauben (zum Validieren beim Buchen)
ALTER TABLE discount_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can read active discount codes" ON discount_codes;
CREATE POLICY "Public can read active discount codes"
  ON discount_codes FOR SELECT
  USING (active = TRUE);

-- Service-Role kann alles (für Admin-Panel via authentifizierte Calls)
DROP POLICY IF EXISTS "Service role manages discount codes" ON discount_codes;
CREATE POLICY "Service role manages discount codes"
  ON discount_codes FOR ALL
  USING (auth.role() = 'authenticated');

-- Loyalty-Tiers: alle dürfen lesen
ALTER TABLE loyalty_tiers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can read loyalty tiers" ON loyalty_tiers;
CREATE POLICY "Public can read loyalty tiers"
  ON loyalty_tiers FOR SELECT
  USING (active = TRUE);

DROP POLICY IF EXISTS "Auth can manage loyalty tiers" ON loyalty_tiers;
CREATE POLICY "Auth can manage loyalty tiers"
  ON loyalty_tiers FOR ALL
  USING (auth.role() = 'authenticated');

-- Redemptions: nur authentifizierte sehen alles, jeder kann inserten
ALTER TABLE discount_redemptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can insert redemptions" ON discount_redemptions;
CREATE POLICY "Public can insert redemptions"
  ON discount_redemptions FOR INSERT
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS "Auth can read all redemptions" ON discount_redemptions;
CREATE POLICY "Auth can read all redemptions"
  ON discount_redemptions FOR SELECT
  USING (auth.role() = 'authenticated');
