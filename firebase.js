import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, doc, getDoc, setDoc, deleteDoc, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
  const ALAV_COLLECTIONS = {
    laudel: "alav_laudel",
    paulo:  "alav_paulo",
    hammel: "alav_hammel"
  };

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  window._db = db;
  window._firestoreFns = { doc, setDoc, deleteDoc, query, orderBy, onSnapshot, collection };
  window._profileCollections = PROFILE_COLLECTIONS;
  window._alavCollections = ALAV_COLLECTIONS;
  window._activeListener = null;
  window._activeAlavListener = null;

  window._startProfileListener = function(profile) {
    if (window._activeListener) {
      window._activeListener();
      window._activeListener = null;
    }
    if (window._activeAlavListener) {
      window._activeAlavListener();
      window._activeAlavListener = null;
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

    const alavColName = ALAV_COLLECTIONS[profile] || "alav_laudel";
    const alavCol = collection(db, alavColName);

    // One-time migration from the old single-document-per-profile structure
    (async () => {
      try {
        const legacyRef = doc(db, "alavancagem", profile);
        const legacySnap = await getDoc(legacyRef);
        if (legacySnap.exists()) {
          const data = legacySnap.data();
          const newId = Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
          await setDoc(doc(db, alavColName, newId), { ...data, id: newId, createdAt: data.createdAt || Date.now() });
          await deleteDoc(legacyRef);
        }
      } catch (e) {
        console.error("Erro na migração de alavancagem:", e);
      }
    })();

    const alavQ = query(alavCol, orderBy("createdAt", "desc"));
    window._activeAlavListener = onSnapshot(alavQ, (snapshot) => {
      alavancagens = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      renderAlavancagem();
    }, (err) => {
      console.error("Firebase alavancagem error:", err);
    });
  };

  window._startProfileListener('laudel');
}
