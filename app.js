import { auth, db } from "./firebase.js"; // Removido 'functions' daqui
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
// Removida a importação do firebase-functions

const authSection = document.getElementById("authSection");
const servicesSection = document.getElementById("servicesSection");
const logoutBtn = document.getElementById("logoutBtn");
const authMsg = document.getElementById("authMsg");
const buyMsg = document.getElementById("buyMsg");
const pixModal = document.getElementById("pixModal");
const pixQrImg = document.getElementById("pixQrImg");
const pixCopiaCola = document.getElementById("pixCopiaCola");
const pixOrderId = document.getElementById("pixOrderId");
const pixCloseBtn = document.getElementById("pixCloseBtn");
const pixCopyBtn = document.getElementById("pixCopyBtn");

const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const regName = document.getElementById("regName");
const regEmail = document.getElementById("regEmail");
const regPassword = document.getElementById("regPassword");

// URL do seu backend hospedado no Render
const RENDER_BACKEND_URL = "https://moaby-backend.onrender.com";

document.getElementById("loginBtn").addEventListener("click", async () => {
  authMsg.textContent = "";
  try {
    await signInWithEmailAndPassword(auth, loginEmail.value, loginPassword.value);
  } catch (err) {
    authMsg.textContent = err.message;
  }
});

document.getElementById("registerBtn").addEventListener("click", async () => {
  authMsg.textContent = "";
  try {
    const cred = await createUserWithEmailAndPassword(auth, regEmail.value, regPassword.value);
    await updateProfile(cred.user, { displayName: regName.value });
  } catch (err) {
    authMsg.textContent = err.message;
  }
});

logoutBtn.addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, (user) => {
  if (user) {
    authSection.classList.add("hidden");
    servicesSection.classList.remove("hidden");
    logoutBtn.classList.remove("hidden");
  } else {
    authSection.classList.remove("hidden");
    servicesSection.classList.add("hidden");
    logoutBtn.classList.add("hidden");
  }
});

function showPixModal({ qrCodeImage, qrCode, orderId }) {
  pixOrderId.textContent = orderId;
  pixQrImg.src = qrCodeImage || "";
  pixQrImg.classList.toggle("hidden", !qrCodeImage);
  pixCopiaCola.value = qrCode || "";
  pixModal.classList.remove("hidden");
}

pixCloseBtn.addEventListener("click", () => pixModal.classList.add("hidden"));
pixCopyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(pixCopiaCola.value);
    pixCopyBtn.textContent = "Copiado!";
    setTimeout(() => (pixCopyBtn.textContent = "Copiar"), 2000);
  } catch {
    pixCopiaCola.select();
    document.execCommand("copy");
  }
});

document.querySelectorAll(".buyBtn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    buyMsg.className = "text-sm mt-4";
    buyMsg.textContent = "Processando...";
    const user = auth.currentUser;
    if (!user) {
      buyMsg.className = "text-sm mt-4 text-red-600";
      buyMsg.textContent = "Você precisa estar logado.";
      return;
    }
    const type = btn.dataset.buy;
    const needsSchedule = ["Avaliação Física Online", "Avaliação Física Presencial"].includes(type);
    let dateScheduled = null;
    if (needsSchedule) {
      const input = document.querySelector(`[data-schedule="${CSS.escape(type)}"]`);
      if (!input.value) {
        buyMsg.className = "text-sm mt-4 text-red-600";
        buyMsg.textContent = "Selecione data e hora para agendar.";
        return;
      }
      dateScheduled = new Date(input.value);
    }
    try {
      const orderRef = await addDoc(collection(db, "orders"), {
        userId: user.uid,
        userEmail: user.email,
        type,
        status: "pending",
        dateScheduled,
        createdAt: serverTimestamp()
      });

      // Substituído o httpsCallable por uma requisição fetch padrão para o Render
      const response = await fetch(`${RENDER_BACKEND_URL}/createPixOrder`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          orderId: orderRef.id,
          type,
          customer: {
            name: user.displayName || "Aluno Moaby",
            email: user.email,
          },
          dateScheduled,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Erro ao comunicar com o servidor de pagamento.");
      }

      buyMsg.className = "text-sm mt-4 text-emerald-700";
      buyMsg.textContent = `Pedido criado: ${type}. Pague o PIX para confirmar.`;
      
      // Passamos diretamente o objeto retornado pelo servidor Express
      showPixModal({ ...result, orderId: orderRef.id });
    } catch (err) {
      buyMsg.className = "text-sm mt-4 text-red-600";
      buyMsg.textContent = err.message || "Erro ao processar pagamento.";
    }
  });
});