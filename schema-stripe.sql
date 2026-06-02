-- Schema-Update: Stripe-Zahlungen
-- Auszuführen in Supabase SQL Editor

-- Spalten an bookings: Zahlungsstatus + Stripe-Referenz
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'pending', 'paid', 'refunded', 'failed')),
  ADD COLUMN IF NOT EXISTS stripe_session_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS amount_paid NUMERIC;

CREATE INDEX IF NOT EXISTS idx_bookings_stripe_session
  ON bookings (stripe_session_id) WHERE stripe_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_payment_status
  ON bookings (payment_status);

-- Shop-Orders: gleiche Felder
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID,
  product_name TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'CHF',
  discount_code TEXT,
  discount_amount NUMERIC DEFAULT 0,
  payment_status TEXT DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'paid', 'refunded', 'failed')),
  stripe_session_id TEXT,
  stripe_payment_intent_id TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_stripe_session
  ON orders (stripe_session_id) WHERE stripe_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_email ON orders (customer_email);

-- RLS: Service-Role darf alles, Public darf inserten (Checkout-Start)
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can insert orders" ON orders;
CREATE POLICY "Public can insert orders"
  ON orders FOR INSERT WITH CHECK (TRUE);
DROP POLICY IF EXISTS "Auth can read all orders" ON orders;
CREATE POLICY "Auth can read all orders"
  ON orders FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Auth can update orders" ON orders;
CREATE POLICY "Auth can update orders"
  ON orders FOR UPDATE USING (auth.role() = 'authenticated');
