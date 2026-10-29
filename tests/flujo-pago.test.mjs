// Prueba el flujo completo de pago con una base de datos y un Stripe simulados en memoria.
import { test, mock } from "node:test";
import assert from "node:assert/strict";

const A = "6f1c2b3a-1111-4a2b-8c3d-000000000001";
const B = "6f1c2b3a-1111-4a2b-8c3d-000000000002";

// --- Base de datos simulada -------------------------------------------------
const state = { items: [], orders: [], order_items: [] };
function reset() {
  state.items = [
    { id: A, ref: "0001", title: "Aparador", price_cents: 42000, status: "disponible" },
    { id: B, ref: "0002", title: "Jarrón", price_cents: 3800, status: "disponible" }
  ];
  state.orders = []; state.order_items = [];
}
const fakeDb = {
  async rpc(name, { item_ids }) {
    const rows = state.items.filter((i) => item_ids.includes(i.id));
    if (name === "reserve_items") {
      if (rows.length !== item_ids.length || rows.some((r) => r.status !== "disponible")) return { data: [] };
      rows.forEach((r) => { r.status = "reservado"; r.reserved_until = new Date(Date.now() + 9e5).toISOString(); });
      return { data: rows };
    }
    if (name === "release_items") rows.forEach((r) => { if (r.status === "reservado") r.status = "disponible"; });
    if (name === "mark_items_sold") rows.forEach((r) => { r.status = "vendido"; });
    return { data: null };
  },
  from(table) {
    const rows = state[table];
    const q = {
      _f: [], _patch: null, _ins: null,
      select() { return q; },
      in(col, vals) { q._f.push((r) => vals.includes(r[col])); return q; },
      eq(col, val) { q._f.push((r) => r[col] === val); return q; },
      insert(v) {
        const list = (Array.isArray(v) ? v : [v]).map((x) => table === "orders" ? { id: "ord-" + (rows.length + 1), number: 1001 + rows.length, status: "pendiente", ...x } : x);
        rows.push(...list); q._ins = list; return q;
      },
      update(p) { q._patch = p; return q; },
      single() { return q.then((r) => ({ data: r.data?.[0] ?? null })); },
      then(res, rej) {
        if (q._ins) return Promise.resolve({ data: q._ins }).then(res, rej);
        const hit = rows.filter((r) => q._f.every((f) => f(r)));
        if (q._patch) hit.forEach((r) => Object.assign(r, q._patch));
        return Promise.resolve({ data: hit }).then(res, rej);
      }
    };
    return q;
  }
};

// --- Stripe simulado ----------------------------------------------------------
let lastParams;
const fakeStripe = {
  checkout: { sessions: { async create(p) { lastParams = p; return { id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" }; } } },
  webhooks: { constructEvent(raw, sig) { if (sig !== "firma-ok") throw new Error("bad sig"); return JSON.parse(raw); } }
};

mock.module("../netlify/functions/_shared/clients.mjs", {
  namedExports: { getDb: () => fakeDb, getStripe: () => fakeStripe }
});
const checkout = (await import("../netlify/functions/checkout.mjs")).default;
const webhook = (await import("../netlify/functions/stripe-webhook.mjs")).default;

const post = (body) => new Request("http://x/api/checkout", { method: "POST", body: JSON.stringify(body) });
const hook = (type, extra = {}, sig = "firma-ok") => new Request("http://x/api/stripe-webhook", {
  method: "POST", headers: { "stripe-signature": sig },
  body: JSON.stringify({ type, data: { object: { metadata: { order_id: "ord-1" }, payment_status: "paid", customer_details: { email: "c@x.com", name: "Ana", phone: "+34600" }, ...extra } } })
});

test("pago completo: reserva, cobra con precios del servidor y marca vendido", async () => {
  reset();
  const r = await checkout(post({ items: [A, B], delivery: "envio" }));
  assert.equal(r.status, 200);
  assert.equal((await r.json()).url, "https://checkout.stripe.com/c/pay/cs_test_1");
  assert.deepEqual(state.items.map((i) => i.status), ["reservado", "reservado"]);
  assert.equal(state.orders[0].total_cents, 45800);           // 420 + 38, envío gratis
  assert.equal(state.orders[0].stripe_session_id, "cs_test_1");
  assert.deepEqual(lastParams.line_items.map((l) => l.price_data.unit_amount), [42000, 3800]);

  // Otra persona intenta comprar el jarrón mientras tanto
  const r2 = await checkout(post({ items: [B] }));
  assert.equal(r2.status, 409);

  assert.equal((await webhook(hook("checkout.session.completed", {}, "falsa"))).status, 400);
  assert.equal((await webhook(hook("checkout.session.completed"))).status, 200);
  assert.equal(state.orders[0].status, "pagado");
  assert.equal(state.orders[0].customer_email, "c@x.com");
  assert.deepEqual(state.items.map((i) => i.status), ["vendido", "vendido"]);

  // Un aviso repetido de Stripe no cambia nada
  await webhook(hook("checkout.session.expired"));
  assert.equal(state.orders[0].status, "pagado");
});

test("pago abandonado: la sesión caduca y las piezas vuelven a estar disponibles", async () => {
  reset();
  await checkout(post({ items: [A] }));
  assert.equal(state.items[0].status, "reservado");
  await webhook(hook("checkout.session.expired"));
  assert.equal(state.orders[0].status, "cancelado");
  assert.equal(state.items[0].status, "disponible");
});

test("cesta no válida", async () => {
  reset();
  assert.equal((await checkout(post({ items: [] }))).status, 400);
  assert.equal((await checkout(new Request("http://x", { method: "GET" }))).status, 405);
});
