import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

function need(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Falta la variable de entorno ${name}`);
  return v;
}

let stripe, db;

export function getStripe() {
  stripe ??= new Stripe(need("STRIPE_SECRET_KEY"));
  return stripe;
}

// Cliente con la clave service_role: salta la seguridad por filas. Solo en el servidor.
export function getDb() {
  db ??= createClient(need("SUPABASE_URL"), need("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  return db;
}
