const { onRequest } = require("firebase-functions/v2/https");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret, defineString } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const axios = require("axios");
const cors = require("cors")({ origin: true });

initializeApp();
const db = getFirestore();

const PAGBANK_TOKEN = defineSecret("PAGBANK_TOKEN");
const PAGBANK_BASE_URL = "https://api.pagseguro.com";

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
      email: customer?.email || "[email protected]",
      tax_id: customer?.taxId || "11111111111",
    },
    items,
    shipping: { address: { country: "BRA" } },
    notification_urls: [
      "https://us-central1-moabyconsultoria.cloudfunctions.net/pagbankWebhook",
    ],
    payment_method: {
      type: "CHECKOUT_PIX",
      installments: 1,
      capture: true,
    },
    metadata: { dateScheduled: dateScheduled ? new Date(dateScheduled).toISOString() : null },
  };
};

exports.createPixOrder = onCall(
  { secrets: [PAGBANK_TOKEN], cors: true },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Usuário não autenticado.");
    }
    const { orderId, type, customer, dateScheduled } = request.data || {};
    if (!orderId || !type) {
      throw new HttpsError("invalid-argument", "orderId e type são obrigatórios.");
    }

    try {
      const payload = buildOrderPayload(orderId, type, customer, dateScheduled);
      const { data } = await axios.post(
        `${PAGBANK_BASE_URL}/orders`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${PAGBANK_TOKEN.value()}`,
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

      return {
        ok: true,
        orderId,
        pagbankOrderId: data.id,
        status: data.status,
        qrCode: data.qr_codes?.[0]?.text || null,
        qrCodeImage: data.qr_codes?.[0]?.links?.find((l) => l.media === "image/png")?.href || null,
      };
    } catch (err) {
      const details = err.response?.data || err.message;
      console.error("PagBank error", details);
      throw new HttpsError("internal", "Falha ao criar pedido PIX", details);
    }
  }
);

exports.pagbankWebhook = onRequest(
  { secrets: [PAGBANK_TOKEN] },
  async (req, res) => {
    cors(req, res, async () => {
      try {
        const notifications = Array.isArray(req.body) ? req.body : [req.body];
        for (const n of notifications) {
          const orderId = n.reference_id || n.id;
          if (!orderId) continue;

          const { data } = await axios.get(
            `${PAGBANK_BASE_URL}/orders/${orderId}`,
            {
              headers: {
                Authorization: `Bearer ${PAGBANK_TOKEN.value()}`,
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
        res.status(200).send("OK");
      } catch (err) {
        console.error("Webhook error", err.response?.data || err.message);
        res.status(200).send("OK");
      }
    });
  }
);