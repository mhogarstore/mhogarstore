import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCheckoutBody, computeTotals, buildSessionParams, siteUrl } from "../netlify/functions/_shared/shop.mjs";

const A = "6f1c2b3a-1111-4a2b-8c3d-000000000001";
const B = "6f1c2b3a-1111-4a2b-8c3d-000000000002";
const ship = { cost: 2500, freeFrom: 8000 };

test("rechaza cestas vacías, ids raros y demasiadas piezas", () => {
  assert.ok(parseCheckoutBody(null).error);
  assert.ok(parseCheckoutBody({ items: [] }).error);
  assert.ok(parseCheckoutBody({ items: ["1; drop table"] }).error);
  assert.ok(parseCheckoutBody({ items: Array.from({ length: 21 }, (_, i) => A.slice(0, -2) + String(i).padStart(2, "0")) }).error);
});

test("quita duplicados y normaliza la entrega", () => {
  assert.deepEqual(parseCheckoutBody({ items: [A, A, B], delivery: "dron" }), { ids: [A, B], delivery: "recogida" });
  assert.equal(parseCheckoutBody({ items: [A], delivery: "envio" }).delivery, "envio");
});

test("envío: se cobra por debajo del mínimo, gratis desde el mínimo, nunca en recogida", () => {
  assert.deepEqual(computeTotals([{ price_cents: 3800 }], "envio", ship), { subtotal: 3800, shipping: 2500, total: 6300 });
  assert.deepEqual(computeTotals([{ price_cents: 8000 }], "envio", ship), { subtotal: 8000, shipping: 0, total: 8000 });
  assert.deepEqual(computeTotals([{ price_cents: 3800 }], "recogida", ship), { subtotal: 3800, shipping: 0, total: 3800 });
});

test("sesión de Stripe con precios de la base de datos y dirección solo si hay envío", () => {
  const order = { id: "ord-1", number: 1001 };
  const items = [{ id: A, ref: "0001", title: "Aparador", price_cents: 42000 }];
  const now = Date.UTC(2026, 9, 29, 12, 0, 0);
  const p = buildSessionParams({ order, items, delivery: "recogida", totals: computeTotals(items, "recogida", ship), site: "https://mhogarstore.com", now });
  assert.equal(p.line_items[0].price_data.unit_amount, 42000);
  assert.equal(p.line_items[0].price_data.product_data.name, "Aparador · Ref. 0001");
  assert.equal(p.metadata.order_id, "ord-1");
  assert.equal(p.expires_at, now / 1000 + 1800);
  assert.equal(p.success_url, "https://mhogarstore.com/gracias.html?pedido=1001");
  assert.equal(p.shipping_address_collection, undefined);
  const e = buildSessionParams({ order, items, delivery: "envio", totals: computeTotals(items, "envio", ship), site: "x", now });
  assert.deepEqual(e.shipping_address_collection.allowed_countries, ["ES"]);
  assert.equal(e.shipping_options[0].shipping_rate_data.fixed_amount.amount, 0);
});

test("dirección de la web sin barra final", () => {
  assert.equal(siteUrl({ SITE_URL: "https://mhogarstore.com/" }), "https://mhogarstore.com");
  assert.equal(siteUrl({ URL: "https://algo.netlify.app" }), "https://algo.netlify.app");
});
