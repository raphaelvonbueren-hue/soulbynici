-- Schema-Update: Erlaubte Zahlungsmethoden pro Klient
-- Auszuführen in Supabase SQL Editor

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS allowed_payment_methods JSONB DEFAULT '[]'::jsonb;

-- Optional: bookings.payment_method als String speichern (für Admin-Übersicht)
-- (kann auch im customer-JSON bleiben, wir machen einen optional separat indizierten Mirror)
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS payment_method TEXT;

COMMENT ON COLUMN clients.allowed_payment_methods IS
  'Array von erlaubten Zahlungsmethoden: cash, twint_local, invoice. Online (Stripe) ist immer erlaubt.';

COMMENT ON COLUMN bookings.payment_method IS
  'Gewählte Methode: now (Stripe), later_cash, later_twint, later_invoice';
