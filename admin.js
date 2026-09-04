import { auth } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  getIdToken
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const loginSection = document.getElementById("loginSection");
const dashboard = document.getElementById("dashboard");
const loginMsg = document.getElementById("loginMsg");
const ordersTable = document.getElementById("ordersTable");
const workoutsList = document.getElementById("workoutsList");
const workoutMsg = document.getElementById("workoutMsg");

const BACKEND_URL = "https://moaby-backend.onrender.com";

document.getElementById("adminLoginBtn").addEventListener("click", async () => {
  loginMsg.textContent = "";
  try {
    await signInWithEmailAndPassword(
      auth,
      document.getElementById("adminEmail").value,
      document.getElementById("adminPassword").value
    );
  } catch (err) {
    loginMsg.textContent = err.message;
  }
});

document.getElementById("logoutBtn").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, (user) => {
  if (user) {
    loginSection.classList.add("hidden");
    dashboard.classList.remove("hidden");
    loadOrders();
    loadWorkouts();
  } else {
    loginSection.classList.remove("hidden");
    dashboard.classList.add("hidden");
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

async function loadOrders() {
  ordersTable.innerHTML = `<tr><td colspan="5" class="py-3 text-slate-500">Carregando...</td></tr>`;
  try {
    const res = await fetch(`${BACKEND_URL}/admin/orders`, { headers: await authHeaders() });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Erro ao carregar pedidos.");
    }
    const { orders } = await res.json();
    if (!orders || orders.length === 0) {
      ordersTable.innerHTML = `<tr><td colspan="5" class="py-3 text-slate-500">Nenhum pedido.</td></tr>`;
      return;
    }
    ordersTable.innerHTML = "";
    orders.forEach((o) => {
      const tr = document.createElement("tr");
      tr.className = "border-b hover:bg-slate-50/50 transition";

      let statusBadge = `<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">Pendente</span>`;
      if (o.status === "paid") {
        statusBadge = `<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">Pago ✅</span>`;
      } else if (o.status === "cancelled") {
        statusBadge = `<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800">Cancelado</span>`;
      }

      const dateScheduled = o.dateScheduled ? new Date(o.dateScheduled).toLocaleString("pt-BR") : "-";
      const createdAt = o.createdAt ? new Date(o.createdAt).toLocaleString("pt-BR") : "-";

      tr.innerHTML = `
        <td class="py-3 font-medium text-slate-700">${o.userEmail || o.userId}</td>
        <td class="py-3 text-slate-600">${o.type || 'Serviço'}</td>
        <td class="py-3">${statusBadge}</td>
        <td class="py-3 text-slate-500">${dateScheduled}</td>
        <td class="py-3 text-slate-500">${createdAt}</td>`;

      ordersTable.appendChild(tr);
    });
  } catch (err) {
    ordersTable.innerHTML = `<tr><td colspan="5" class="py-3 text-red-600">${err.message}</td></tr>`;
  }
}

document.getElementById("workoutForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  workoutMsg.textContent = "Salvando...";
  workoutMsg.className = "ml-3 text-sm text-slate-600";
  try {
      const res = await fetch(`${BACKEND_URL}/admin/workouts`, {
        method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({
        userId: document.getElementById("workoutUserId").value,
        title: document.getElementById("workoutTitle").value,
        content: document.getElementById("workoutContent").value,
      }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Erro ao salvar ficha.");
    }
    workoutMsg.textContent = "Ficha salva!";
    workoutMsg.className = "ml-3 text-sm text-emerald-700";
    e.target.reset();
    loadWorkouts();
  } catch (err) {
    workoutMsg.textContent = err.message;
    workoutMsg.className = "ml-3 text-sm text-red-600";
  }
});

async function loadWorkouts() {
  workoutsList.innerHTML = `<p class="text-slate-500 text-sm">Carregando...</p>`;
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
      div.className = "border rounded-lg p-3";
      const createdAt = w.createdAt ? new Date(w.createdAt).toLocaleString("pt-BR") : "";
      div.innerHTML = `
        <p class="font-medium">${w.title}</p>
        <p class="text-xs text-slate-500">Aluno: ${w.userId} • ${createdAt}</p>
        <pre class="whitespace-pre-wrap text-sm mt-2 text-slate-700">${w.content}</pre>`;
      workoutsList.appendChild(div);
    });
  } catch (err) {
    workoutsList.innerHTML = `<p class="text-red-600 text-sm">${err.message}</p>`;
  }
}
