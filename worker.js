const ORDERS_URL = "https://test.ooobs.ru/api/orders";

function normalizePhone(value) {
  let digits = String(value ?? "").replace(/\D/g, "");

  // A ten-digit Russian subscriber number is missing its country code.
  if (digits.length === 10) digits = `7${digits}`;
  if (digits.length !== 11) return null;

  if (digits[0] === "8") digits = `7${digits.slice(1)}`;
  if (digits[0] !== "7") return null;
  return `+${digits}`;
}

function toClients(orders) {
  const winners = new Map();
  let valid = 0;

  for (const order of orders) {
    const phone = normalizePhone(order.phone);
    if (!phone) continue;
    valid += 1;

    const candidate = {
      name: String(order.name ?? ""),
      phone,
      email: String(order.email ?? ""),
      amount: Number(order.amount) || 0,
      created_at: String(order.created_at ?? ""),
    };
    const current = winners.get(phone);

    if (
      !current ||
      candidate.amount > current.amount ||
      (candidate.amount === current.amount &&
        Date.parse(candidate.created_at) > Date.parse(current.created_at))
    ) {
      winners.set(phone, candidate);
    }
  }

  const clients = Array.from(winners.values(), ({ name, phone, email, amount }) => ({
    name,
    phone,
    email,
    amount,
  }));

  return {
    clients,
    stats: {
      received: orders.length,
      unique: clients.length,
      duplicates_merged: valid - clients.length,
      invalid_dropped: orders.length - valid,
    },
  };
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (request.method !== "GET") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    try {
      const response = await fetch(ORDERS_URL, { cache: "no-store" });
      if (!response.ok) {
        return Response.json({ error: "Orders source unavailable" }, { status: 502 });
      }
      const orders = await response.json();
      if (!Array.isArray(orders)) {
        return Response.json({ error: "Orders source returned invalid data" }, { status: 502 });
      }

      return Response.json(toClients(orders), {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store, max-age=0",
        },
      });
    } catch {
      return Response.json({ error: "Unable to synchronize orders" }, { status: 502 });
    }
  },
};
