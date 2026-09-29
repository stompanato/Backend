const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS"
};

const LOGIN_ID = "vesuviovolley";
const LOGIN_PASSWORD = "Vesuvio-7J1xqbEG!";

function response(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS
    }
  });
}

function error(message, status = 400) {
  return response({ error: message }, status);
}

function auth(request) {
  const value = request.headers.get("Authorization") || "";
  return value === "Bearer VESUVIO-MANAGER-2026";
}

function sectionInfo(section) {
  if (section === "nuovo-membro") {
    return {
      products: "new_member_products",
      orders: "new_member_orders",
      items: "new_member_order_items",
      settings: "new_member_settings"
    };
  }

  if (section === "extra") {
    return {
      products: "extra_products",
      orders: "extra_orders",
      items: "extra_order_items",
      settings: "extra_settings"
    };
  }

  return null;
}

async function initDB(db) {
  await db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS new_member_products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        price REAL NOT NULL DEFAULT 0,
        image TEXT,
        sizes TEXT NOT NULL DEFAULT '["XS","S","M","L","XL","XXL","XXXL"]',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),

    db.prepare(`
      CREATE TABLE IF NOT EXISTS new_member_orders (
        id TEXT PRIMARY KEY,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        total REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'nuovo',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),

    db.prepare(`
      CREATE TABLE IF NOT EXISTS new_member_order_items (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        size TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        unit_price REAL NOT NULL DEFAULT 0
      )
    `),

    db.prepare(`
      CREATE TABLE IF NOT EXISTS new_member_settings (
        id INTEGER PRIMARY KEY,
        orders_enabled INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),

    db.prepare(`
      CREATE TABLE IF NOT EXISTS extra_products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        price REAL NOT NULL DEFAULT 0,
        image TEXT,
        sizes TEXT NOT NULL DEFAULT '["XS","S","M","L","XL","XXL","XXXL"]',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),

    db.prepare(`
      CREATE TABLE IF NOT EXISTS extra_orders (
        id TEXT PRIMARY KEY,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        total REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'nuovo',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),

    db.prepare(`
      CREATE TABLE IF NOT EXISTS extra_order_items (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        size TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        unit_price REAL NOT NULL DEFAULT 0
      )
    `),

    db.prepare(`
      CREATE TABLE IF NOT EXISTS extra_settings (
        id INTEGER PRIMARY KEY,
        orders_enabled INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),

    db.prepare(`
      INSERT OR IGNORE INTO new_member_settings
      (id, orders_enabled) VALUES (1, 1)
    `),

    db.prepare(`
      INSERT OR IGNORE INTO extra_settings
      (id, orders_enabled) VALUES (1, 1)
    `)
  ]);
}

async function getSettings(db, info) {
  const row = await db
    .prepare(`SELECT * FROM ${info.settings} WHERE id = 1`)
    .first();

  return {
    orders_enabled: Number(row?.orders_enabled ?? 1) === 1
  };
}

function normalizeSizes(sizes) {
  if (Array.isArray(sizes) && sizes.length) {
    return JSON.stringify(sizes);
  }

  return JSON.stringify([
    "XS",
    "S",
    "M",
    "L",
    "XL",
    "XXL",
    "XXXL"
  ]);
}

function productFromRow(row) {
  return {
    ...row,
    price: Number(row.price || 0),
    sizes: (() => {
      try {
        return JSON.parse(row.sizes || "[]");
      } catch {
        return [];
      }
    })()
  };
}

async function handleProducts(request, db, info, manager) {
  const method = request.method;

  if (method === "GET") {
    const result = await db
      .prepare(`SELECT * FROM ${info.products} ORDER BY created_at DESC`)
      .all();

    return response({
      products: (result.results || []).map(productFromRow)
    });
  }

  if (!manager) {
    return error("Accesso non autorizzato.", 401);
  }

  if (method === "POST") {
    const body = await request.json();

    const id = crypto.randomUUID();
    const name = String(body.name || "").trim();
    const price = Number(body.price || 0);
    const image = body.image || null;
    const sizes = normalizeSizes(body.sizes);

    if (!name) return error("Nome prodotto obbligatorio.");
    if (!Number.isFinite(price) || price < 0) {
      return error("Prezzo non valido.");
    }

    await db.prepare(`
      INSERT INTO ${info.products}
      (id, name, price, image, sizes)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      id,
      name,
      price,
      image,
      sizes
    ).run();

    return response({
      ok: true,
      product: {
        id,
        name,
        price,
        image,
        sizes: JSON.parse(sizes)
      }
    }, 201);
  }

  if (method === "PUT") {
    const body = await request.json();

    const id = String(body.id || "");
    const name = String(body.name || "").trim();
    const price = Number(body.price || 0);
    const image = body.image ?? null;
    const sizes = normalizeSizes(body.sizes);

    if (!id) return error("ID prodotto mancante.");
    if (!name) return error("Nome prodotto obbligatorio.");
    if (!Number.isFinite(price) || price < 0) {
      return error("Prezzo non valido.");
    }

    const result = await db.prepare(`
      UPDATE ${info.products}
      SET name = ?, price = ?, image = ?, sizes = ?
      WHERE id = ?
    `).bind(
      name,
      price,
      image,
      sizes,
      id
    ).run();

    if (!result.meta.changes) {
      return error("Prodotto non trovato.", 404);
    }

    return response({ ok: true });
  }

  if (method === "DELETE") {
    if (!manager) return error("Accesso non autorizzato.", 401);

    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (!id) return error("ID prodotto mancante.");

    await db
      .prepare(`DELETE FROM ${info.products} WHERE id = ?`)
      .bind(id)
      .run();

    return response({ ok: true });
  }

  return error("Metodo non supportato.", 405);
}

async function handleOrders(request, db, info, manager) {
  const method = request.method;

  if (method === "GET") {
    if (!manager) {
      return error("Accesso non autorizzato.", 401);
    }

    const orders = await db
      .prepare(`
        SELECT *
        FROM ${info.orders}
        ORDER BY datetime(created_at) DESC
      `)
      .all();

    const result = [];

    for (const order of orders.results || []) {
      const items = await db
        .prepare(`
          SELECT *
          FROM ${info.items}
          WHERE order_id = ?
        `)
        .bind(order.id)
        .all();

      result.push({
        ...order,
        total: Number(order.total || 0),
        items: (items.results || []).map(item => ({
          ...item,
          quantity: Number(item.quantity || 0),
          unit_price: Number(item.unit_price || 0)
        }))
      });
    }

    return response({ orders: result });
  }

  if (method === "POST") {
    const body = await request.json();

    const settings = await getSettings(db, info);

    if (!settings.orders_enabled) {
      return error(
        "Le ordinazioni di questa sezione sono temporaneamente chiuse.",
        403
      );
    }

    const firstName = String(body.first_name || "").trim();
    const lastName = String(body.last_name || "").trim();
    const items = Array.isArray(body.items) ? body.items : [];

    if (!firstName || !lastName) {
      return error("Nome e cognome sono obbligatori.");
    }

    if (!items.length) {
      return error("Il carrello è vuoto.");
    }

    const productsResult = await db
      .prepare(`SELECT * FROM ${info.products}`)
      .all();

    const products = new Map(
      (productsResult.results || []).map(p => [p.id, productFromRow(p)])
    );

    let total = 0;
    const checkedItems = [];

    for (const item of items) {
      const product = products.get(String(item.product_id || ""));

      if (!product) {
        return error("Uno dei prodotti non esiste più.");
      }

      const sizes = product.sizes || [];

      if (!sizes.includes(String(item.size || ""))) {
        return error(`Taglia non disponibile per ${product.name}.`);
      }

      let quantity = Number(item.quantity || 1);

      if (info.products === "new_member_products") {
        quantity = 1;
      }

      if (!Number.isInteger(quantity) || quantity < 1) {
        return error("Quantità non valida.");
      }

      const unitPrice = Number(product.price || 0);

      total += unitPrice * quantity;

      checkedItems.push({
        product_name: product.name,
        size: String(item.size),
        quantity,
        unit_price: unitPrice
      });
    }

    const orderId = crypto.randomUUID();

    const statements = [
      db.prepare(`
        INSERT INTO ${info.orders}
        (id, first_name, last_name, total, status)
        VALUES (?, ?, ?, ?, 'nuovo')
      `).bind(
        orderId,
        firstName,
        lastName,
        total
      )
    ];

    for (const item of checkedItems) {
      statements.push(
        db.prepare(`
          INSERT INTO ${info.items}
          (id, order_id, product_name, size, quantity, unit_price)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(
          crypto.randomUUID(),
          orderId,
          item.product_name,
          item.size,
          item.quantity,
          item.unit_price
        )
      );
    }

    await db.batch(statements);

    return response({
      ok: true,
      order_id: orderId,
      total
    }, 201);
  }

  if (method === "PUT") {
    if (!manager) {
      return error("Accesso non autorizzato.", 401);
    }

    const body = await request.json();
    const id = String(body.id || "");
    const status = String(body.status || "");

    if (!id) return error("ID ordine mancante.");

    if (!["nuovo", "completato"].includes(status)) {
      return error("Stato non valido.");
    }

    await db.prepare(`
      UPDATE ${info.orders}
      SET status = ?
      WHERE id = ?
    `).bind(status, id).run();

    return response({ ok: true });
  }

  if (method === "DELETE") {
    if (!manager) {
      return error("Accesso non autorizzato.", 401);
    }

    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (!id) return error("ID ordine mancante.");

    await db.batch([
      db.prepare(`
        DELETE FROM ${info.items}
        WHERE order_id = ?
      `).bind(id),

      db.prepare(`
        DELETE FROM ${info.orders}
        WHERE id = ?
      `).bind(id)
    ]);

    return response({ ok: true });
  }

  return error("Metodo non supportato.", 405);
}

async function handleSettings(request, db, info, manager) {
  if (request.method === "GET") {
    return response(await getSettings(db, info));
  }

  if (!manager) {
    return error("Accesso non autorizzato.", 401);
  }

  if (request.method === "PUT") {
    const body = await request.json();

    const enabled = Boolean(body.orders_enabled);

    await db.prepare(`
      UPDATE ${info.settings}
      SET orders_enabled = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).bind(enabled ? 1 : 0).run();

    return response({
      ok: true,
      orders_enabled: enabled
    });
  }

  return error("Metodo non supportato.", 405);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS
      });
    }

    try {
      await initDB(env.DB);

      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/, "");

      // TEST
      if (path === "" || path === "/") {
        return response({
          ok: true,
          service: "Vesuvio Volley API",
          database: "D1",
          status: "online"
        });
      }

      // LOGIN GESTORE
      if (path === "/api/login" && request.method === "POST") {
        const body = await request.json();

        if (
          String(body.id || "") === LOGIN_ID &&
          String(body.password || "") === LOGIN_PASSWORD
        ) {
          return response({
            ok: true,
            token: "VESUVIO-MANAGER-2026"
          });
        }

        return error("ID o password non corretti.", 401);
      }

      const match = path.match(
        /^\/api\/(nuovo-membro|extra)\/(products|orders|settings)$/
      );

      if (!match) {
        return error("Endpoint non trovato.", 404);
      }

      const section = match[1];
      const resource = match[2];

      const info = sectionInfo(section);

      if (!info) {
        return error("Sezione non valida.", 400);
      }

      const manager = auth(request);

      if (resource === "products") {
        return await handleProducts(
          request,
          env.DB,
          info,
          manager
        );
      }

      if (resource === "orders") {
        return await handleOrders(
          request,
          env.DB,
          info,
          manager
        );
      }

      if (resource === "settings") {
        return await handleSettings(
          request,
          env.DB,
          info,
          manager
        );
      }

      return error("Endpoint non trovato.", 404);

    } catch (err) {
      console.error(err);

      return response({
        error: "Errore interno del server.",
        details: String(err?.message || err)
      }, 500);
    }
  }
};