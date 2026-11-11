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
  // Acepta la URL tal cual la copia la clienta, aunque lleve /rest/v1/ al final.
  const url = need("SUPABASE_URL").trim().replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
  db ??= createClient(url, need("SUPABASE_SERVICE_ROLE_KEY").trim(), {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  return db;
}
