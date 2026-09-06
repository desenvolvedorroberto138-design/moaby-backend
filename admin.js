import { auth } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  getIdToken
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection,
  query,
  orderBy,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const loginSection = document.getElementById("loginSection");
const dashboard = document.getElementById("dashboard");
const loginMsg = document.getElementById("loginMsg");
const ordersTable = document.getElementById("ordersTable");
const workoutsList = document.getElementById("workoutsList");
const workoutMsg = document.getElementById("workoutMsg");
const logoutBtn = document.getElementById("logoutBtn");

const BACKEND_URL = "https://moaby-backend.onrender.com";
let ordersUnsubscribe = null;

function formatarData(val) {
  if (!val) return "-";
  if (typeof val === "object" && val.seconds) {
    return new Date(val.seconds * 1000).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? "-" : d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function statusBadge(status) {
  if (status === "paid") {
    return `<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">✅ PAGO</span>`;
  }
  if (status === "cancelled") {
    return `<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800">❌ Cancelado</span>`;
  }
  return `<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">⏳ Pendente</span>`;
}

function renderOrders(orders) {
  if (!ordersTable) return;
  if (!orders || orders.length === 0) {
    ordersTable.innerHTML = `<tr><td colspan="6" class="py-4 text-center text-slate-500">Nenhum pedido encontrado.</td></tr>`;
    return;
  }
  ordersTable.innerHTML = "";
  orders.forEach((o) => {
    const tr = document.createElement("tr");
    tr.className = "border-b hover:bg-slate-50/50 transition";

    const dateScheduled = formatarData(o.dateScheduled);
    const createdAt = formatarData(o.createdAt);

    tr.innerHTML = `
      <td class="py-3 font-medium text-slate-700">
        <div>${o.userEmail || o.userId}</div>
        <div class="text-xs text-slate-400 font-mono select-all">${o.userId}</div>
      </td>
      <td class="py-3 text-slate-600">${o.type || "Serviço"}</td>
      <td class="py-3">${statusBadge(o.status)}</td>
      <td class="py-3 text-slate-500">${dateScheduled}</td>
      <td class="py-3 text-slate-500">${createdAt}</td>
      <td class="py-3 text-right">
        <button class="selectUserBtn bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg transition" title="Preencher este aluno no formulário de treino">
          Criar Treino
        </button>
      </td>`;

    const selectBtn = tr.querySelector(".selectUserBtn");
    if (selectBtn) {
      selectBtn.addEventListener("click", () => {
        const userIdInput = document.getElementById("workoutUserId");
        const workoutTitleInput = document.getElementById("workoutTitle");
        if (userIdInput) userIdInput.value = o.userId;
        if (workoutTitleInput) workoutTitleInput.focus();
        document.getElementById("workoutForm")?.scrollIntoView({ behavior: "smooth" });
      });
    }

    ordersTable.appendChild(tr);
  });
}

function listenOrdersRealtime() {
  if (ordersUnsubscribe) {
    ordersUnsubscribe();
    ordersUnsubscribe = null;
  }

  if (!auth.currentUser) return;

  try {
    const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));
    ordersUnsubscribe = onSnapshot(q, (snapshot) => {
      const orders = [];
      snapshot.forEach((doc) => {
        orders.push({ id: doc.id, ...doc.data() });
      });
      renderOrders(orders);
    }, (err) => {
      console.warn("Erro ao escutar pedidos em tempo real:", err);
      loadOrdersFallback();
    });
  } catch (err) {
    console.warn("onSnapshot não disponível para admin, usando fallback:", err);
    loadOrdersFallback();
  }
}

async function loadOrdersFallback() {
  if (ordersUnsubscribe) return;
  ordersTable.innerHTML = `<tr><td colspan="6" class="py-4 text-center text-slate-500">Carregando pedidos...</td></tr>`;
  try {
    const res = await fetch(`${BACKEND_URL}/admin/orders`, { headers: await authHeaders() });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Erro ao carregar pedidos.");
    }
    const { orders } = await res.json();
    renderOrders(orders);
  } catch (err) {
    ordersTable.innerHTML = `<tr><td colspan="6" class="py-4 text-center text-red-600">${err.message}</td></tr>`;
  }
}

async function loadOrders() {
  listenOrdersRealtime();
}

document.getElementById("refreshOrdersBtn")?.addEventListener("click", () => {
  if (ordersUnsubscribe) {
    ordersUnsubscribe();
    ordersUnsubscribe = null;
  }
  listenOrdersRealtime();
});

document.getElementById("adminLoginBtn")?.addEventListener("click", async () => {
  loginMsg.textContent = "";
  try {
    await signInWithEmailAndPassword(
      auth,
      document.getElementById("adminEmail").value.trim(),
      document.getElementById("adminPassword").value
    );
  } catch (err) {
    loginMsg.textContent = err.message;
  }
});

logoutBtn?.addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, (user) => {
  if (user) {
    loginSection.classList.add("hidden");
    dashboard.classList.remove("hidden");
    logoutBtn?.classList.remove("hidden");
    loadOrders();
    loadWorkouts();
  } else {
    if (ordersUnsubscribe) {
      ordersUnsubscribe();
      ordersUnsubscribe = null;
    }
    loginSection.classList.remove("hidden");
    dashboard.classList.add("hidden");
    logoutBtn?.classList.add("hidden");
  }
});

async function authHeaders() {
  const user = auth.currentUser;
  if (!user) throw new Error("Não autenticado.");
  const token = await getIdToken(user);
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`
  };
}

document.getElementById("workoutForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  workoutMsg.textContent = "Salvando ficha...";
  workoutMsg.className = "ml-3 text-sm text-slate-600";
  try {
    const res = await fetch(`${BACKEND_URL}/admin/workouts`, {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({
        userId: document.getElementById("workoutUserId").value.trim(),
        title: document.getElementById("workoutTitle").value.trim(),
        content: document.getElementById("workoutContent").value.trim(),
      }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Erro ao salvar ficha.");
    }
    workoutMsg.textContent = "Ficha salva com sucesso!";
    workoutMsg.className = "ml-3 text-sm text-emerald-700 font-medium";
    e.target.reset();
    loadWorkouts();
  } catch (err) {
    workoutMsg.textContent = err.message;
    workoutMsg.className = "ml-3 text-sm text-red-600";
  }
});

async function loadWorkouts() {
  workoutsList.innerHTML = `<p class="text-slate-500 text-sm">Carregando fichas...</p>`;
  try {
    const res = await fetch(`${BACKEND_URL}/admin/workouts`, { headers: await authHeaders() });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Erro ao carregar fichas.");
    }
    const { workouts } = await res.json();
    if (!workouts || workouts.length === 0) {
      workoutsList.innerHTML = `<p class="text-slate-500 text-sm">Nenhuma ficha cadastrada.</p>`;
      return;
    }
    workoutsList.innerHTML = "";
    workouts.forEach((w) => {
      const div = document.createElement("div");
      div.className = "border border-slate-200 rounded-xl p-4 bg-slate-50/50";
      const createdAt = formatarData(w.createdAt);
      div.innerHTML = `
        <div class="flex items-center justify-between">
          <p class="font-bold text-slate-800">${w.title || "Ficha de Treino"}</p>
          <span class="text-xs text-slate-400">${createdAt}</span>
        </div>
        <p class="text-xs text-slate-500 font-mono mt-0.5">Aluno (ID): ${w.userId}</p>
        <pre class="whitespace-pre-wrap font-sans text-sm mt-3 text-slate-700 bg-white p-3 rounded-lg border border-slate-100">${w.content}</pre>`;
      workoutsList.appendChild(div);
    });
  } catch (err) {
    workoutsList.innerHTML = `<p class="text-red-600 text-sm">${err.message}</p>`;
  }
}
