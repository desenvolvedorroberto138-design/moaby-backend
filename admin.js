import { auth, db } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const loginSection = document.getElementById("loginSection");
const dashboard = document.getElementById("dashboard");
const loginMsg = document.getElementById("loginMsg");
const ordersTable = document.getElementById("ordersTable");
const workoutsList = document.getElementById("workoutsList");
const workoutMsg = document.getElementById("workoutMsg");

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

async function loadOrders() {
  ordersTable.innerHTML = `<tr><td colspan="5" class="py-3 text-slate-500">Carregando...</td></tr>`;
  try {
    const snap = await getDocs(query(collection(db, "orders"), orderBy("createdAt", "desc")));
    if (snap.empty) {
      ordersTable.innerHTML = `<tr><td colspan="5" class="py-3 text-slate-500">Nenhum pedido.</td></tr>`;
      return;
    }
    ordersTable.innerHTML = "";
    snap.forEach((doc) => {
      const o = doc.data();
      const tr = document.createElement("tr");
      tr.className = "border-b";
      tr.innerHTML = `
        <td class="py-2">${o.userEmail || o.userId}</td>
        <td class="py-2">${o.type}</td>
        <td class="py-2"><span class="px-2 py-1 rounded-full text-xs bg-amber-100 text-amber-800">${o.status}</span></td>
        <td class="py-2">${o.dateScheduled?.toDate ? o.dateScheduled.toDate().toLocaleString("pt-BR") : "-"}</td>
        <td class="py-2">${o.createdAt?.toDate ? o.createdAt.toDate().toLocaleString("pt-BR") : "-"}</td>`;
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
    await addDoc(collection(db, "workouts"), {
      userId: document.getElementById("workoutUserId").value,
      title: document.getElementById("workoutTitle").value,
      content: document.getElementById("workoutContent").value,
      createdAt: serverTimestamp()
    });
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
    const snap = await getDocs(query(collection(db, "workouts"), orderBy("createdAt", "desc")));
    if (snap.empty) {
      workoutsList.innerHTML = `<p class="text-slate-500 text-sm">Nenhuma ficha cadastrada.</p>`;
      return;
    }
    workoutsList.innerHTML = "";
    snap.forEach((doc) => {
      const w = doc.data();
      const div = document.createElement("div");
      div.className = "border rounded-lg p-3";
      div.innerHTML = `
        <p class="font-medium">${w.title}</p>
        <p class="text-xs text-slate-500">Aluno: ${w.userId} • ${w.createdAt?.toDate ? w.createdAt.toDate().toLocaleString("pt-BR") : ""}</p>
        <pre class="whitespace-pre-wrap text-sm mt-2 text-slate-700">${w.content}</pre>`;
      workoutsList.appendChild(div);
    });
  } catch (err) {
    workoutsList.innerHTML = `<p class="text-red-600 text-sm">${err.message}</p>`;
  }
}