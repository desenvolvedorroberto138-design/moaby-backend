import { auth, db } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  updateProfile,
  getIdToken
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection,
  doc,
  addDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const authSection = document.getElementById("authSection");
const studentNav = document.getElementById("studentNav");
const servicesSection = document.getElementById("servicesSection");
const workoutsSection = document.getElementById("workoutsSection");
const ordersSection = document.getElementById("ordersSection");
const logoutBtn = document.getElementById("logoutBtn");
const userGreeting = document.getElementById("userGreeting");
const authMsg = document.getElementById("authMsg");
const buyMsg = document.getElementById("buyMsg");

// Abas do Aluno
const navServices = document.getElementById("navServices");
const navWorkouts = document.getElementById("navWorkouts");
const navOrders = document.getElementById("navOrders");
const refreshWorkoutsBtn = document.getElementById("refreshWorkoutsBtn");
const refreshOrdersBtn = document.getElementById("refreshOrdersBtn");
const workoutsStudentList = document.getElementById("workoutsStudentList");
const ordersStudentTable = document.getElementById("ordersStudentTable");

// Modal PIX
const pixModal = document.getElementById("pixModal");
const pixPendingState = document.getElementById("pixPendingState");
const pixSuccessState = document.getElementById("pixSuccessState");
const pixQrImg = document.getElementById("pixQrImg");
const pixCopiaCola = document.getElementById("pixCopiaCola");
const pixOrderId = document.getElementById("pixOrderId");
const pixCloseBtn = document.getElementById("pixCloseBtn");
const pixCopyBtn = document.getElementById("pixCopyBtn");
const pixSuccessBtn = document.getElementById("pixSuccessBtn");

// Formulários
const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const regName = document.getElementById("regName");
const regEmail = document.getElementById("regEmail");
const regPassword = document.getElementById("regPassword");
const resetEmail = document.getElementById("resetEmail");
const resetPassBtn = document.getElementById("resetPassBtn");

// URL do backend hospedado no Render
const RENDER_BACKEND_URL = "https://moaby-backend.onrender.com";
let currentOrderUnsubscribe = null;

// Bloqueia agendamento em datas passadas
try {
  const nowIsoString = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  document.querySelectorAll(".scheduleInput").forEach((input) => {
    input.min = nowIsoString;
  });
} catch (e) {
  console.warn("Não foi possível definir min no input de data:", e);
}

function formatarData(val) {
  if (!val) return "-";
  if (typeof val === "object" && val.seconds) {
    return new Date(val.seconds * 1000).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? "-" : d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function switchTab(tabName) {
  const tabs = [
    { name: "services", btn: navServices, sec: servicesSection },
    { name: "workouts", btn: navWorkouts, sec: workoutsSection },
    { name: "orders", btn: navOrders, sec: ordersSection },
  ];

  tabs.forEach((t) => {
    if (t.name === tabName) {
      t.btn?.classList.add("active", "text-emerald-700", "border-emerald-600");
      t.btn?.classList.remove("text-slate-500", "border-transparent");
      t.sec?.classList.remove("hidden");
    } else {
      t.btn?.classList.remove("active", "text-emerald-700", "border-emerald-600");
      t.btn?.classList.add("text-slate-500", "border-transparent");
      t.sec?.classList.add("hidden");
    }
  });

  if (tabName === "workouts") loadMyWorkouts();
  if (tabName === "orders") loadMyOrders();
}

navServices?.addEventListener("click", () => switchTab("services"));
navWorkouts?.addEventListener("click", () => switchTab("workouts"));
navOrders?.addEventListener("click", () => switchTab("orders"));
refreshWorkoutsBtn?.addEventListener("click", loadMyWorkouts);
refreshOrdersBtn?.addEventListener("click", loadMyOrders);

document.getElementById("loginBtn")?.addEventListener("click", async () => {
  authMsg.className = "text-sm text-center font-medium text-red-600";
  authMsg.textContent = "";
  try {
    await signInWithEmailAndPassword(auth, loginEmail.value.trim(), loginPassword.value);
  } catch (err) {
    authMsg.textContent = err.message;
  }
});

document.getElementById("registerBtn")?.addEventListener("click", async () => {
  authMsg.className = "text-sm text-center font-medium text-red-600";
  authMsg.textContent = "";
  try {
    const cred = await createUserWithEmailAndPassword(auth, regEmail.value.trim(), regPassword.value);
    if (regName.value.trim()) {
      await updateProfile(cred.user, { displayName: regName.value.trim() });
    }
  } catch (err) {
    authMsg.textContent = err.message;
  }
});

resetPassBtn?.addEventListener("click", async () => {
  const email = resetEmail.value.trim();
  if (!email) {
    authMsg.className = "text-sm text-center font-medium text-red-600";
    authMsg.textContent = "Informe seu e-mail cadastrado para redefinir a senha.";
    return;
  }
  authMsg.className = "text-sm text-center font-medium text-slate-600";
  authMsg.textContent = "Enviando e-mail de recuperação...";
  try {
    await sendPasswordResetEmail(auth, email);
    authMsg.className = "text-sm text-center font-medium text-emerald-600";
    authMsg.textContent = "E-mail de recuperação enviado! Verifique sua caixa de entrada e spam.";
  } catch (err) {
    authMsg.className = "text-sm text-center font-medium text-red-600";
    authMsg.textContent = err.message;
  }
});

logoutBtn?.addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, (user) => {
  if (user) {
    authSection.classList.add("hidden");
    studentNav?.classList.remove("hidden");
    logoutBtn.classList.remove("hidden");

    if (userGreeting) {
      const displayName = user.displayName || user.email.split("@")[0];
      userGreeting.textContent = `Olá, ${displayName}!`;
      userGreeting.classList.remove("hidden");
    }

    switchTab("services");
  } else {
    authSection.classList.remove("hidden");
    studentNav?.classList.add("hidden");
    servicesSection.classList.add("hidden");
    workoutsSection?.classList.add("hidden");
    ordersSection?.classList.add("hidden");
    logoutBtn.classList.add("hidden");

    if (userGreeting) {
      userGreeting.textContent = "";
      userGreeting.classList.add("hidden");
    }

    if (currentOrderUnsubscribe) {
      currentOrderUnsubscribe();
      currentOrderUnsubscribe = null;
    }
  }
});

function closePixModal() {
  pixModal.classList.add("hidden");
  if (currentOrderUnsubscribe) {
    currentOrderUnsubscribe();
    currentOrderUnsubscribe = null;
  }
}

function showPixModal({ qrCodeImage, qrCode, orderId }) {
  if (currentOrderUnsubscribe) {
    currentOrderUnsubscribe();
    currentOrderUnsubscribe = null;
  }

  pixOrderId.textContent = orderId || "";
  pixQrImg.src = qrCodeImage || "";
  pixQrImg.classList.toggle("hidden", !qrCodeImage);
  pixCopiaCola.value = qrCode || "";

  pixPendingState?.classList.remove("hidden");
  pixSuccessState?.classList.add("hidden");
  pixModal.classList.remove("hidden");

  // Escuta confirmação de pagamento em tempo real
  if (orderId) {
    currentOrderUnsubscribe = onSnapshot(doc(db, "orders", orderId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.status === "paid") {
          pixPendingState?.classList.add("hidden");
          pixSuccessState?.classList.remove("hidden");
        }
      }
    }, (err) => {
      console.warn("Erro ao escutar status do pedido:", err);
    });
  }
}

pixCloseBtn?.addEventListener("click", closePixModal);

pixSuccessBtn?.addEventListener("click", () => {
  closePixModal();
  switchTab("orders");
});

pixCopyBtn?.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(pixCopiaCola.value);
    pixCopyBtn.textContent = "Copiado!";
    setTimeout(() => (pixCopyBtn.textContent = "Copiar"), 2000);
  } catch {
    pixCopiaCola.select();
    document.execCommand("copy");
    pixCopyBtn.textContent = "Copiado!";
    setTimeout(() => (pixCopyBtn.textContent = "Copiar"), 2000);
  }
});

async function loadMyWorkouts() {
  const user = auth.currentUser;
  if (!user || !workoutsStudentList) return;

  workoutsStudentList.innerHTML = `
    <div class="p-8 text-center text-slate-500 bg-white rounded-2xl shadow-sm border border-slate-100">
      Carregando suas fichas de treino...
    </div>`;

  try {
    const q = query(collection(db, "workouts"), where("userId", "==", user.uid));
    const snap = await getDocs(q);

    if (snap.empty) {
      workoutsStudentList.innerHTML = `
        <div class="p-8 text-center bg-white rounded-2xl shadow-sm border border-slate-100">
          <span class="text-4xl">🏋️‍♂️</span>
          <h3 class="text-base font-semibold text-slate-700 mt-2">Nenhum treino cadastrado</h3>
          <p class="text-sm text-slate-500 mt-1">Seu treinador ainda não cadastrou uma ficha de treino para o seu perfil. Em breve você verá suas rotinas personalizadas aqui!</p>
        </div>`;
      return;
    }

    const workouts = [];
    snap.forEach((docSnap) => {
      workouts.push({ id: docSnap.id, ...docSnap.data() });
    });

    workouts.sort((a, b) => {
      const timeA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt || 0).getTime();
      const timeB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt || 0).getTime();
      return timeB - timeA;
    });

    workoutsStudentList.innerHTML = "";
    workouts.forEach((w) => {
      const card = document.createElement("div");
      card.className = "bg-white rounded-2xl shadow-md border border-slate-100 p-6 hover:shadow-lg transition duration-200";
      const dataCriacao = formatarData(w.createdAt);

      card.innerHTML = `
        <div class="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 mb-4 gap-2">
          <div class="flex items-center gap-3">
            <span class="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-lg">🏋️</span>
            <div>
              <h3 class="font-bold text-slate-800 text-lg">${w.title || "Ficha de Treino"}</h3>
              <p class="text-xs text-slate-400">Criado em: ${dataCriacao}</p>
            </div>
          </div>
          <span class="self-start sm:self-auto px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-full">Ativo</span>
        </div>
        <div class="bg-slate-50 p-4 rounded-xl border border-slate-100">
          <pre class="whitespace-pre-wrap font-sans text-sm text-slate-700 leading-relaxed">${w.content || "Sem detalhes adicionais nesta ficha."}</pre>
        </div>
      `;
      workoutsStudentList.appendChild(card);
    });
  } catch (err) {
    console.error("Erro ao carregar treinos:", err);
    workoutsStudentList.innerHTML = `
      <div class="p-6 text-center text-red-600 bg-red-50 rounded-2xl border border-red-100 text-sm">
        Falha ao carregar suas fichas: ${err.message}
      </div>`;
  }
}

async function loadMyOrders() {
  const user = auth.currentUser;
  if (!user || !ordersStudentTable) return;

  ordersStudentTable.innerHTML = `
    <tr><td colspan="5" class="p-6 text-center text-slate-500">Carregando seus pedidos...</td></tr>`;

  try {
    const q = query(collection(db, "orders"), where("userId", "==", user.uid));
    const snap = await getDocs(q);

    if (snap.empty) {
      ordersStudentTable.innerHTML = `
        <tr>
          <td colspan="5" class="p-8 text-center text-slate-500">
            <p class="text-base font-semibold text-slate-700">Nenhum pedido realizado</p>
            <p class="text-xs text-slate-400 mt-1">Assim que você contratar um serviço ou avaliação, o acompanhamento do pedido aparecerá aqui.</p>
          </td>
        </tr>`;
      return;
    }

    const orders = [];
    snap.forEach((docSnap) => {
      orders.push({ id: docSnap.id, ...docSnap.data() });
    });

    orders.sort((a, b) => {
      const timeA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt || 0).getTime();
      const timeB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt || 0).getTime();
      return timeB - timeA;
    });

    ordersStudentTable.innerHTML = "";
    orders.forEach((o) => {
      const tr = document.createElement("tr");
      tr.className = "hover:bg-slate-50/70 transition";

      let statusBadge = `<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">Pendente</span>`;
      if (o.status === "paid") {
        statusBadge = `<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">Confirmado ✅</span>`;
      } else if (o.status === "cancelled") {
        statusBadge = `<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800">Cancelado</span>`;
      }

      const dateScheduled = formatarData(o.dateScheduled);
      const createdAt = formatarData(o.createdAt);

      let actionBtn = "";
      if (o.status === "pending" && (o.qrCode || o.qrCodeImage)) {
        actionBtn = `<button class="viewPixBtn text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-3 py-1.5 rounded-lg shadow-sm transition">Pagar PIX</button>`;
      } else if (o.status === "paid") {
        actionBtn = `<span class="text-xs text-emerald-700 font-semibold">Liberado</span>`;
      } else {
        actionBtn = `<span class="text-xs text-slate-400">-</span>`;
      }

      tr.innerHTML = `
        <td class="p-4 font-semibold text-slate-800">${o.type || "Serviço"}</td>
        <td class="p-4">${statusBadge}</td>
        <td class="p-4 text-slate-600 text-xs">${dateScheduled}</td>
        <td class="p-4 text-slate-500 text-xs">${createdAt}</td>
        <td class="p-4 text-right">${actionBtn}</td>
      `;

      const btn = tr.querySelector(".viewPixBtn");
      if (btn) {
        btn.addEventListener("click", () => {
          showPixModal({
            qrCodeImage: o.qrCodeImage,
            qrCode: o.qrCode,
            orderId: o.id
          });
        });
      }

      ordersStudentTable.appendChild(tr);
    });
  } catch (err) {
    console.error("Erro ao carregar pedidos:", err);
    ordersStudentTable.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-red-600 text-sm">Falha ao carregar pedidos: ${err.message}</td></tr>`;
  }
}

document.querySelectorAll(".buyBtn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    if (btn.disabled) return;
    btn.disabled = true;
    btn.textContent = "Processando...";

    buyMsg.className = "text-sm mt-4 text-center font-medium";
    buyMsg.textContent = "Processando seu pedido...";
    const user = auth.currentUser;
    if (!user) {
      buyMsg.className = "text-sm mt-4 text-center font-medium text-red-600";
      buyMsg.textContent = "Você precisa estar logado para contratar um serviço.";
      btn.disabled = false;
      btn.textContent = btn.dataset.buyOriginal || btn.textContent;
      return;
    }
    const type = btn.dataset.buy;
    const needsSchedule = ["Avaliação Física Online", "Avaliação Física Presencial"].includes(type);
    let dateScheduled = null;
    if (needsSchedule) {
      const input = document.querySelector(`[data-schedule="${CSS.escape(type)}"]`);
      if (!input?.value) {
        buyMsg.className = "text-sm mt-4 text-center font-medium text-red-600";
        buyMsg.textContent = "Selecione uma data e horário válidos para agendar.";
        btn.disabled = false;
        btn.textContent = btn.dataset.buyOriginal || btn.textContent;
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

      const token = await getIdToken(user);
      const response = await fetch(`${RENDER_BACKEND_URL}/createPixOrder`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
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
        let errorMsg = result.error || "Erro ao comunicar com o servidor de pagamento.";
        if (result.details) {
          if (typeof result.details === "string") {
            errorMsg += `: ${result.details}`;
          } else if (result.details.error_messages && Array.isArray(result.details.error_messages)) {
            const msgs = result.details.error_messages.map((m) => m.description || m.message || JSON.stringify(m)).join("; ");
            errorMsg += `: ${msgs}`;
          } else {
            errorMsg += `: ${JSON.stringify(result.details)}`;
          }
        }
        throw new Error(errorMsg);
      }

      buyMsg.className = "text-sm mt-4 text-center font-medium text-emerald-700";
      buyMsg.textContent = `Pedido criado com sucesso! Escaneie o QR Code ou copie o código PIX para pagar.`;
      
      showPixModal({ ...result, orderId: orderRef.id });
    } catch (err) {
      buyMsg.className = "text-sm mt-4 text-center font-medium text-red-600";
      buyMsg.textContent = err.message || "Erro ao processar pagamento.";
    } finally {
      btn.disabled = false;
      btn.textContent = btn.dataset.buyOriginal || btn.dataset.buy || "Comprar";
    }
  });
});