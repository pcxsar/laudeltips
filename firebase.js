import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC0yWy1kc-3wjBc4B679jYb9pohe8oLmps",
  authDomain: "laudel-tips.firebaseapp.com",
  projectId: "laudel-tips",
  storageBucket: "laudel-tips.firebasestorage.app",
  messagingSenderId: "367865870648",
  appId: "1:367865870648:web:c4e2fdd73f451accfb69cd"
};

if (firebaseConfig.apiKey === 'COLE_SUA_API_KEY_AQUI') {
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('firebase-loading').style.display = 'none';
    document.getElementById('setup-guide').style.display = 'block';
  });
} else {
  const PROFILE_COLLECTIONS = {
    laudel: "copa_bets",
    paulo:  "paulo_bets",
    hammel: "hammel_bets"
  };

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  window._db = db;
  window._firestoreFns = { doc, setDoc, deleteDoc, query, orderBy, onSnapshot, collection };
  window._profileCollections = PROFILE_COLLECTIONS;
  window._activeListener = null;

  window._startProfileListener = function(profile) {
    if (window._activeListener) {
      window._activeListener();
      window._activeListener = null;
    }
    const colName = PROFILE_COLLECTIONS[profile] || "copa_bets";
    const betsCol = collection(db, colName);
    window._betsCol = betsCol;

    const q = query(betsCol, orderBy("createdAt", "desc"));
    window._activeListener = onSnapshot(q, (snapshot) => {
      bets = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      renderAll();
      const loading = document.getElementById('firebase-loading');
      if(loading) loading.style.display = 'none';
    }, (err) => {
      console.error("Firebase error:", err);
      const loading = document.getElementById('firebase-loading');
      if(loading){
        loading.innerHTML = `<div style="color:#ff4d6a;padding:20px;text-align:center;font-family:'DM Sans',sans-serif;">
          ⚠️ Erro ao conectar com o Firebase.<br>
          <small style="opacity:.7">Verifique as credenciais e se o Firestore está ativado.</small>
        </div>`;
      }
    });
  };

  window._startProfileListener('laudel');
}
