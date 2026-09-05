const firebaseConfig = {
    apiKey: 'AIzaSyBvwsj1EJCOzDpi94vUQuFtZgtvVK66OUU',
    authDomain: 'n1k-12d03.firebaseapp.com',
    projectId: 'n1k-12d03',
    storageBucket: 'n1k-12d03.firebasestorage.app',
    messagingSenderId: '737643507271',
    appId: '1:737643507271:web:ebf6f83c942ebb84c80b62',
    measurementId: 'G-HJZ07BQRG8'
};

const ADMIN_ID = 'WY8LkCQSyvctpjwTWi0kMLm5MYh1';
const ADMIN_PASSWORD = 'deneme123';
const adminSessionKey = 'yer-adlari-admin-session';

firebase.initializeApp(firebaseConfig);
const firestoreDb = firebase.firestore();

const loginCard = document.getElementById('loginCard');
const entryCard = document.getElementById('entryCard');
const loginForm = document.getElementById('adminLoginForm');
const loginMessage = document.getElementById('loginMessage');
const placeForm = document.getElementById('placeForm');
const saveMessage = document.getElementById('saveMessage');
const logoutButton = document.getElementById('logoutButton');
const reportsCard = document.getElementById('reportsCard');
const reportsList = document.getElementById('reportsList');
const refreshReports = document.getElementById('refreshReports');

function showEntryPanel() {
    loginCard.hidden = true;
    entryCard.hidden = false;
    reportsCard.hidden = false;
    loadReports();
}

function showLoginPanel() {
    loginCard.hidden = false;
    entryCard.hidden = true;
    reportsCard.hidden = true;
}

async function loadReports() {
    reportsList.replaceChildren();
    try {
        const snapshot = await firestoreDb.collection('sikayetler').orderBy('tarih', 'desc').limit(50).get();
        if (snapshot.empty) {
            reportsList.textContent = 'Bekleyen şikayet yok.';
            return;
        }
        snapshot.docs.forEach(doc => {
            const data = doc.data();
            const item = document.createElement('article');
            item.className = 'report-item';
            const text = document.createElement('p');
            text.textContent = data.yorumMetni || 'Yorum metni yok';
            const meta = document.createElement('small');
            meta.textContent = `Bildiren: ${data.bildirenAdi || 'Kullanıcı'} | Durum: ${data.durum || 'bekliyor'}`;
            const button = document.createElement('button');
            button.className = 'admin-button';
            button.type = 'button';
            button.textContent = 'İncelendi';
            button.addEventListener('click', async () => {
                await doc.ref.update({ durum: 'incelendi' });
                loadReports();
            });
            item.append(text, meta, button);
            reportsList.appendChild(item);
        });
    } catch (error) {
        reportsList.textContent = 'Şikayetler okunamadı. Firestore kurallarını kontrol edin.';
        console.error(error);
    }
}

function normalizeId(value) {
    return value.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
        .replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '').slice(0, 120);
}

if (sessionStorage.getItem(adminSessionKey) === 'true') showEntryPanel();

loginForm.addEventListener('submit', event => {
    event.preventDefault();
    const id = document.getElementById('adminId').value.trim();
    const password = document.getElementById('adminPassword').value;

    if (id !== ADMIN_ID || password !== ADMIN_PASSWORD) {
        loginMessage.textContent = 'Admin ID veya şifre hatalı.';
        return;
    }

    sessionStorage.setItem(adminSessionKey, 'true');
    loginMessage.textContent = '';
    showEntryPanel();
});

placeForm.addEventListener('submit', async event => {
    event.preventDefault();
    const yerAdi = document.getElementById('yerAdi').value.trim();
    const now = firebase.firestore.FieldValue.serverTimestamp();
    const documentId = normalizeId(yerAdi);
    const toNumberOrNull = value => value === '' ? null : Number(value);

    if (!documentId) {
        saveMessage.textContent = 'Geçerli bir yer adı girin.';
        return;
    }

    const placeData = {
        yerAdi,
        tamYol: document.getElementById('tamYol').value.trim(),
        tur: document.getElementById('tur').value,
        il: document.getElementById('il').value.trim(),
        ilce: document.getElementById('ilce').value.trim(),
        mahalle: document.getElementById('mahalle').value.trim(),
        enlem: toNumberOrNull(document.getElementById('enlem').value),
        boylam: toNumberOrNull(document.getElementById('boylam').value),
        siteSahibi: document.getElementById('siteSahibi').value.trim(),
        pythonBot: document.getElementById('pythonBot').value.trim(),
        yapayZeka: document.getElementById('yapayZeka').value.trim(),
        yorumlar: [],
        sonGuncelleme: now
    };

    saveMessage.textContent = 'Kaydediliyor...';
    try {
        const placeRef = firestoreDb.collection('yerler').doc(documentId);
        const existing = await placeRef.get();
        if (existing.exists) {
            await placeRef.set(placeData, { merge: true });
        } else {
            await placeRef.set({ ...placeData, aramaSayisi: 0, olusturulmaTarihi: now });
        }
        saveMessage.textContent = 'Yer başarıyla kaydedildi.';
        placeForm.reset();
    } catch (error) {
        console.error(error);
        saveMessage.textContent = 'Kayıt başarısız. Firestore kurallarını kontrol edin.';
    }
});

logoutButton.addEventListener('click', () => {
    sessionStorage.removeItem(adminSessionKey);
    showLoginPanel();
    loginForm.reset();
});

refreshReports.addEventListener('click', loadReports);
