const express = require("express");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const axios = require("axios");
const cors = require("cors");

initializeApp();
const db = getFirestore();

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// Pega o token direto da variável de ambiente configurada no Render
const PAGBANK_TOKEN = process.env.PAGBANK_TOKEN;
const PAGBANK_BASE_URL = "https://sandbox.api.pagseguro.com";

const PRICES = {
  "Plano de Treino Online": 149.9,
  "Avaliação Física Online": 89.9,
  "Avaliação Física Presencial": 129.9,
};

const buildOrderPayload = (orderId, type, customer, dateScheduled) => {
  const amount = PRICES[type];
  if (!amount) throw new Error(`Serviço inválido: ${type}`);
  const items = [{
    reference_id: orderId,
    name: type,
    quantity: 1,
    unit_amount: Math.round(amount * 100),
  }];
  return {
    reference_id: orderId,
    customer: {
      name: customer?.name || "Aluno Moaby",
      email: customer?.email || "aluno@moaby.com",
      tax_id: customer?.taxId || "11111111111",
    },
    items,
    shipping: { address: { country: "BRA" } },
    notification_urls: [
      "https://moaby-backend.onrender.com/pagbankWebhook", // Atualize com sua URL do Render depois se precisar
    ],
    payment_method: {
      type: "CHECKOUT_PIX",
      installments: 1,
      capture: true,
    },
    metadata: { dateScheduled: dateScheduled ? new Date(dateScheduled).toISOString() : null },
  };
};

// Rota equivalente ao onCall 'createPixOrder'
app.post("/createPixOrder", async (req, res) => {
  try {
    const { orderId, type, customer, dateScheduled } = req.body || {};
    if (!orderId || !type) {
      return res.status(400).json({ error: "orderId e type são obrigatórios." });
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
        timeout: 15000,
      }
    );

    await db.collection("orders").doc(orderId).set(
      {
        pagbankOrderId: data.id,
        status: data.status || "pending",
        qrCode: data.qr_codes?.[0]?.text || null,
        qrCodeImage: data.qr_codes?.[0]?.links?.find((l) => l.media === "image/png")?.href || null,
        updatedAt: new Date(),
      },
      { merge: true }
    );

    return res.status(200).json({
      ok: true,
      orderId,
      pagbankOrderId: data.id,
      status: data.status,
      qrCode: data.qr_codes?.[0]?.text || null,
      qrCodeImage: data.qr_codes?.[0]?.links?.find((l) => l.media === "image/png")?.href || null,
    });
  } catch (err) {
    const details = err.response?.data || err.message;
    console.error("PagBank error", details);
    return res.status(500).json({ error: "Falha ao criar pedido PIX", details });
  }
});

// Rota equivalente ao onRequest 'pagbankWebhook'
app.post("/pagbankWebhook", async (req, res) => {
  try {
    const notifications = Array.isArray(req.body) ? req.body : [req.body];
    for (const n of notifications) {
      const orderId = n.reference_id || n.id;
      if (!orderId) continue;

      const { data } = await axios.get(
        `${PAGBANK_BASE_URL}/orders/${orderId}`,
        {
          headers: {
            Authorization: `Bearer ${PAGBANK_TOKEN}`,
            Accept: "application/json",
          },
          timeout: 10000,
        }
      );

      const status = data.status || "pending";
      await db.collection("orders").doc(orderId).set(
        {
          status,
          charges: data.charges || null,
          paidAt: status === "PAID" ? new Date() : null,
          updatedAt: new Date(),
        },
        { merge: true }
      );
    }
    return res.status(200).send("OK");
  } catch (err) {
    console.error("Webhook error", err.response?.data || err.message);
    return res.status(200).send("OK");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});