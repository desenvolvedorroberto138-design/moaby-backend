const express = require("express");
const admin = require("firebase-admin");
const axios = require("axios");
const cors = require("cors");

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: "moabyconsultoria"
  });
} else {
  admin.initializeApp({
    projectId: "moabyconsultoria"
  });
}

const db = admin.firestore();

const app = express();
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
  : [];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Origin not allowed by CORS"));
    }
  },
  credentials: true,
}));
app.use(express.json({ limit: "1mb" }));

app.get("/", (req, res) => {
  res.status(200).json({ ok: true, message: "Moaby Backend API online", timestamp: new Date() });
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "healthy", timestamp: new Date() });
});

if (!process.env.PAGBANK_TOKEN) {
  console.warn("PAGBANK_TOKEN não configurado. Pagamentos não funcionarão.");
}

const PAGBANK_TOKEN = process.env.PAGBANK_TOKEN || "";
const PAGBANK_BASE_URL = process.env.PAGBANK_BASE_URL || "https://sandbox.api.pagseguro.com";
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";
const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL || "";
const PORT = process.env.PORT || 3000;

const PRICES = {
  "Plano de Treino Online": 149.9,
  "Avaliação Física Online": 89.9,
  "Avaliação Física Presencial": 129.9,
};

const cleanText = (value) => (value || "").replace(/[!@#$%^&*(),.?":{}|<>]/g, "").trim();

const verifyFirebaseToken = async (req, res, next) => {
  const authHeader = req.headers.authorization || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) {
    return res.status(401).json({ error: "Token de autenticação ausente." });
  }
  try {
    const decoded = await admin.auth().verifyIdToken(match[1]);
    req.user = decoded;
    next();
  } catch (err) {
    console.error("Token inválido:", err.message);
    return res.status(401).json({ error: "Token inválido ou expirado." });
  }
};

const verifyWebhookSecret = (req, res, next) => {
  if (!WEBHOOK_SECRET) {
    if (process.env.NODE_ENV === "production") {
      console.error("ALERTA DE SEGURANÇA: WEBHOOK_SECRET não configurado em ambiente de produção!");
    } else {
      console.warn("Aviso: WEBHOOK_SECRET não configurado. Aceitando webhook.");
    }
    return next();
  }
  const secret = req.headers["x-webhook-secret"] || req.headers["x-webhook-secret".toLowerCase()];
  if (!secret || secret !== WEBHOOK_SECRET) {
    return res.status(401).json({ error: "Segredo do webhook inválido." });
  }
  next();
};

const verifyAdmin = async (req, res, next) => {
  const authHeader = req.headers.authorization || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) {
    return res.status(401).json({ error: "Token de autenticação ausente." });
  }
  try {
    const decoded = await admin.auth().verifyIdToken(match[1]);
    const adminEmails = (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    if (adminEmails.length > 0 && !adminEmails.includes((decoded.email || "").toLowerCase())) {
      return res.status(403).json({ error: "Acesso restrito a administradores." });
    }
    req.user = decoded;
    next();
  } catch (err) {
    console.error("Admin auth error:", err.message);
    return res.status(401).json({ error: "Token inválido ou expirado." });
  }
};

const buildOrderPayload = (orderId, type, customer, dateScheduled) => {
  const amount = PRICES[type];
  if (!amount) throw new Error(`Serviço inválido: ${type}`);

  const name = cleanText(customer?.name) || "Aluno Moaby";
  const email = cleanText(customer?.email) || "aluno@moaby.com";
  const taxId = (customer?.taxId || customer?.tax_id || process.env.PAGBANK_TAX_ID || "08197774051").replace(/\D/g, "");

  const payload = {
    reference_id: orderId,
    customer: {
      name,
      email,
      tax_id: taxId,
    },
    items: [{
      reference_id: orderId,
      name: type,
      quantity: 1,
      unit_amount: Math.round(amount * 100),
    }],
    qr_codes: [{
      amount: {
        value: Math.round(amount * 100)
      },
      expiration_date: new Date(Date.now() + 3600 * 1000).toISOString()
    }],
    metadata: { dateScheduled: dateScheduled ? new Date(dateScheduled).toISOString() : null },
  };

  if (BACKEND_BASE_URL) {
    payload.notification_urls = [`${BACKEND_BASE_URL.replace(/\/$/, "")}/webhook/pagbank`];
  } else {
    console.warn("Aviso: BACKEND_BASE_URL não configurado. PagBank não enviará notificações de webhook para este pedido.");
  }

  return payload;
};

app.post("/createPixOrder", verifyFirebaseToken, async (req, res) => {
  try {
    const { orderId, type, customer, dateScheduled } = req.body || {};
    if (!orderId || !type) {
      return res.status(400).json({ error: "orderId e type são obrigatórios." });
    }

    const orderRef = db.collection("orders").doc(orderId);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      return res.status(404).json({ error: "Pedido não encontrado no banco." });
    }

    const existingData = orderDoc.data() || {};
    if (existingData.userId !== req.user.uid) {
      return res.status(403).json({ error: "Este pedido não pertence ao usuário autenticado." });
    }

    if (existingData.pagbankOrderId && existingData.qrCode) {
      return res.status(200).json({
        ok: true,
        orderId,
        pagbankOrderId: existingData.pagbankOrderId,
        status: existingData.status || "pending",
        qrCode: existingData.qrCode,
        qrCodeImage: existingData.qrCodeImage || null,
      });
    }

    const payload = buildOrderPayload(orderId, type, customer, dateScheduled);
    const { data } = await axios.post(
      `${PAGBANK_BASE_URL}/orders`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${PAGBANK_TOKEN}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        timeout: 30000,
      }
    );

    const firstQr = data.qr_codes?.[0] || {};
    const qrCodeText = firstQr.text || firstQr.content || null;
    const qrCodeImage =
      firstQr.links?.find((l) => l.media === "image/png" || l.rel === "QRCODE")?.href ||
      firstQr.links?.[0]?.href ||
      null;

    await orderRef.set({
      pagbankOrderId: data.id,
      status: data.status || "pending",
      qrCode: qrCodeText,
      qrCodeImage,
      updatedAt: new Date(),
    }, { merge: true });

    return res.status(200).json({
      ok: true,
      orderId,
      pagbankOrderId: data.id,
      status: data.status,
      qrCode: qrCodeText,
      qrCodeImage,
    });
  } catch (err) {
    const details = err.response?.data || err.message;
    console.error("PagBank error", details);
    return res.status(500).json({ error: "Falha ao criar pedido PIX", details });
  }
});

app.post("/webhook/pagbank", verifyWebhookSecret, async (req, res) => {
  try {
    const notification = req.body;
    const charge = notification.charges && notification.charges[0];

    if (!charge) {
      return res.status(400).send({ error: "Nenhuma cobrança encontrada" });
    }

    const orderId = notification.reference_id || charge.reference_id;
    const paymentStatus = charge.status;

    if (!orderId) {
      return res.status(400).send({ error: "ID do pedido não identificado" });
    }

    let newStatus = "pending";
    if (paymentStatus === "PAID" || paymentStatus === "AUTHORIZED") {
      newStatus = "paid";
    } else if (paymentStatus === "DECLINED" || paymentStatus === "CANCELED") {
      newStatus = "cancelled";
    }

    const orderRef = db.collection("orders").doc(orderId);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      return res.status(404).send({ error: "Pedido não encontrado" });
    }

    await orderRef.update({
      status: newStatus,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(200).send({ success: true });
  } catch (error) {
    console.error("Erro no webhook:", error);
    return res.status(500).send({ error: "Erro interno" });
  }
});

app.get("/admin/orders", verifyAdmin, async (req, res) => {
  try {
    const snap = await db.collection("orders").orderBy("createdAt", "desc").get();
    const orders = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return res.status(200).json({ orders });
  } catch (err) {
    console.error("Erro ao buscar pedidos:", err);
    return res.status(500).json({ error: "Erro ao buscar pedidos." });
  }
});

app.post("/admin/workouts", verifyAdmin, async (req, res) => {
  try {
    const { userId, title, content } = req.body || {};
    if (!userId || !title || !content) {
      return res.status(400).json({ error: "userId, title e content são obrigatórios." });
    }
    const docRef = await db.collection("workouts").add({
      userId,
      title,
      content,
      createdAt: new Date(),
    });
    return res.status(201).json({ id: docRef.id, userId, title, content });
  } catch (err) {
    console.error("Erro ao salvar ficha:", err);
    return res.status(500).json({ error: "Erro ao salvar ficha." });
  }
});

app.get("/admin/workouts", verifyAdmin, async (req, res) => {
  try {
    const snap = await db.collection("workouts").orderBy("createdAt", "desc").get();
    const workouts = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return res.status(200).json({ workouts });
  } catch (err) {
    console.error("Erro ao buscar fichas:", err);
    return res.status(500).json({ error: "Erro ao buscar fichas." });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
