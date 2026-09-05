// 1. Rastgele Arka Plan Resmi Atama (Beyazımsı Filtre ile)
const heroSection = document.getElementById('heroSection');
const heroContent = document.getElementById('heroContent');

// Kendi PNG'lerini klasöre eklediğinde burayı 'png1.png', 'png2.png' olarak değiştirebilirsin.
const images = [
    '1.jpg', 
    '2.jpg',
    '3.jpg'
];

const randomImage = images[Math.floor(Math.random() * images.length)];

// Başlangıçta beyazımsı (krem) rgba(252, 249, 242, 0.85) filtre
const lightFilter = 'rgba(252, 249, 242, 0.85)';
// Tıklanınca kararan lacivert rgba(26, 37, 54, 0.85) filtre
const darkFilter = 'rgba(26, 37, 54, 0.85)';

// Başlangıçta her zaman koyu filtre uygulansın
heroSection.style.background = `linear-gradient(${darkFilter}, ${darkFilter}), url('${randomImage}') no-repeat center center/cover`;

// 2. Arama Butonu Etkileşimi (Kararma ve Büyüme)
const searchBtn = document.getElementById('searchBtn');
const searchInput = document.getElementById('searchInput');
const title = heroContent.querySelector('h2');

const provinceDataUrl = 'https://raw.githubusercontent.com/isubas/iller_ve_ilceler/master/iller_ve_ilceler.json';
let locations = [];

function normalizeText(value) {
    return value.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
        .replace(/ö/g, 'o').replace(/ç/g, 'c');
}

function buildLocations(provinceMap) {
    return Object.values(provinceMap).flatMap(province => {
        const provinceName = province.ad;
        const provinceItem = { label: provinceName, searchText: normalizeText(provinceName) };
        const districts = (province.ilceler || []).map(district => ({
            label: `${district.ad}, ${provinceName}`,
            searchText: normalizeText(`${district.ad} ${provinceName}`),
            province: provinceName
        }));
        return [provinceItem, ...districts];
    });
}

async function loadLocations() {
    try {
        const response = await fetch(provinceDataUrl);
        if (!response.ok) throw new Error('Konum verisi alınamadı');
        const result = await response.json();
        locations = buildLocations(result);
    } catch (error) {
        console.error('İl ve ilçe verileri yüklenemedi.', error);
    }
}

function renderSuggestions(query) {
    const resultsBox = document.getElementById('searchResults');
    const normalizedQuery = normalizeText(query.trim());
    if (!resultsBox || !normalizedQuery || !locations.length) {
        if (resultsBox) resultsBox.style.display = 'none';
        return;
    }

    const parts = normalizedQuery.split(/\s+/);
    const provinceQuery = parts[0];
    const districtQuery = parts.slice(1).join(' ');
    const matches = locations.filter(location => {
        if (!districtQuery) return location.searchText.startsWith(provinceQuery);
        return location.province && normalizeText(location.province).startsWith(provinceQuery)
            && normalizeText(location.label.split(',')[0]).startsWith(districtQuery);
    }).slice(0, 8);

    resultsBox.innerHTML = matches.map(location => `<button type="button" class="search-item">${location.label}</button>`).join('');
    resultsBox.style.display = matches.length ? 'block' : 'none';
    resultsBox.querySelectorAll('.search-item').forEach(item => item.addEventListener('click', () => {
        searchInput.value = item.textContent;
        resultsBox.style.display = 'none';
    }));
}

// Başlık koyu arka planda okunaklı olsun
title.style.color = '#fcf9f2';
title.style.textShadow = '2px 2px 4px rgba(0,0,0,0.5)';

searchBtn.addEventListener('click', () => {
    // Butonu büyütme animasyonu
    searchBtn.classList.add('btn-clicked');
    setTimeout(() => {
        searchBtn.classList.remove('btn-clicked');
    }, 300);

    // Eğer bir şey yazılmışsa doğrudan detay sayfasına yönlendir (dropdown gösterme yok)
    if (searchInput.value.trim().length > 0) {
        const q = encodeURIComponent(searchInput.value.trim());
        saveSearchedPlace(searchInput.value.trim()).finally(() => {
            window.location.href = `sehir_detay.html?q=${q}`;
        });
    }
});

searchInput.addEventListener('input', () => renderSuggestions(searchInput.value));
searchInput.addEventListener('keydown', event => {
    if (event.key === 'Escape') document.getElementById('searchResults').style.display = 'none';
});
loadLocations();

// 3. Dışarı tıklanınca arama sonuçlarını gizle
// Leaflet haritasını başlat (varsa)
if (typeof L !== 'undefined' && document.getElementById('map')) {
    const map = L.map('map').setView([39, 35], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    // Konum bulma: tarayıcı izin verirse kullanıcı konumunu göster
    if (navigator.geolocation) {
        map.locate({ setView: true, maxZoom: 13 });
        map.on('locationfound', function (e) {
            const marker = L.marker(e.latlng).addTo(map).bindPopup('Sizin konumunuz').openPopup();
            L.circle(e.latlng, { radius: e.accuracy / 2 }).addTo(map);
        });
        map.on('locationerror', function () {
            // konum alınamazsa sessizce başarısız olsun
            console.warn('Konum alınamadı veya izin reddedildi.');
        });
    }
}

// Mobil hamburger menü toggle
const hamburger = document.querySelector('.hamburger');
const headerEl = document.querySelector('header');
if (hamburger && headerEl) {
    hamburger.addEventListener('click', () => {
        headerEl.classList.toggle('nav-open');
    });
}

// Authentication panel and Firebase skeleton
const profileBtn = document.getElementById('profileBtn');
const authOverlay = document.getElementById('authOverlay');
const authClose = document.getElementById('authClose');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const tabBtns = document.querySelectorAll('.tab-btn');
const authMsg = document.getElementById('authMsg');

function showAuthPanel() {
    if (authOverlay) authOverlay.setAttribute('aria-hidden', 'false');
}

function hideAuthPanel() {
    if (authOverlay) authOverlay.setAttribute('aria-hidden', 'true');
}

if (authClose) authClose.addEventListener('click', hideAuthPanel);
if (authOverlay) authOverlay.addEventListener('click', (e) => { if (e.target === authOverlay) hideAuthPanel(); });

if (tabBtns) {
    tabBtns.forEach(btn => btn.addEventListener('click', (e) => {
        tabBtns.forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        const tab = e.currentTarget.getAttribute('data-tab');
        if (tab === 'login') {
            loginForm.style.display = 'flex';
            registerForm.style.display = 'none';
        } else {
            loginForm.style.display = 'none';
            registerForm.style.display = 'flex';
        }
    }));
}

// Prevent default navigation from profile button; show auth if not logged in
if (profileBtn) {
    profileBtn.addEventListener('click', (e) => {
        e.preventDefault();
        // If Firebase auth is available and user is signed in, go to profile
        if (window.firebase && firebase.auth && firebase.auth().currentUser) {
            window.location.href = 'profil.html';
        } else {
            showAuthPanel();
        }
    });
}

// Login / Register handlers using Firebase Auth (compat)
if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value;
        const pass = document.getElementById('loginPass').value;
        if (!window.firebase || !firebase.auth) {
            authMsg.textContent = 'Firebase yapılandırılmadı. Ayarları yapın.';
            return;
        }
        authMsg.textContent = 'Giriş yapılıyor...';
        firebase.auth().signInWithEmailAndPassword(email, pass)
            .then(() => {
                authMsg.textContent = 'Giriş başarılı.';
            })
            .catch(err => {
                authMsg.textContent = err.message || 'Giriş başarısız.';
            });
    });
}

if (registerForm) {
    registerForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const username = document.getElementById('regUsername').value.trim();
        const email = document.getElementById('regEmail').value;
        const pass = document.getElementById('regPass').value;
        if (!window.firebase || !firebase.auth) {
            authMsg.textContent = 'Firebase yapılandırılmadı. Ayarları yapın.';
            return;
        }
        authMsg.textContent = 'Kayıt yapılıyor...';
        firebase.auth().createUserWithEmailAndPassword(email, pass)
            .then(credential => credential.user.updateProfile({ displayName: username }).then(() => {
                return firebase.firestore().collection('kullanicilar').doc(credential.user.uid).set({
                    kullaniciAdi: username.toLocaleLowerCase('tr-TR'),
                    gorunenAd: username,
                    email
                });
            }))
            .then(() => {
                authMsg.textContent = 'Kayıt başarılı. Giriş yapıldı.';
            })
            .catch(err => {
                authMsg.textContent = err.message || 'Kayıt başarısız.';
            });
    });
}

// Firebase Web App configuration
const firebaseConfig = {
    apiKey: 'AIzaSyBvwsj1EJCOzDpi94vUQuFtZgtvVK66OUU',
    authDomain: 'n1k-12d03.firebaseapp.com',
    projectId: 'n1k-12d03',
    storageBucket: 'n1k-12d03.firebasestorage.app',
    messagingSenderId: '737643507271',
    appId: '1:737643507271:web:ebf6f83c942ebb84c80b62',
    measurementId: 'G-HJZ07BQRG8'
};

// Firebase config ile auth'u başlat
window.setupFirebase = function (config) {
    if (!config) {
        console.warn('Firebase config boş');
        return;
    }
    try {
        firebase.initializeApp(config);
        if (firebase.firestore) window.firestoreDb = firebase.firestore();
        firebase.auth().onAuthStateChanged(user => {
            if (user) {
                // Oturum açıldı: paneli kapat
                hideAuthPanel();
                if (profileBtn) profileBtn.setAttribute('data-user', user.email || '');
                if (window.firestoreDb && user.displayName) {
                    window.firestoreDb.collection('kullanicilar').doc(user.uid).set({
                        kullaniciAdi: user.displayName.toLocaleLowerCase('tr-TR'),
                        gorunenAd: user.displayName,
                        email: user.email || ''
                    }, { merge: true }).catch(console.error);
                }
            } else {
                if (profileBtn) profileBtn.removeAttribute('data-user');
            }
        });
        console.log('Firebase başlatıldı.');
    } catch (e) {
        console.error('Firebase başlatma hatası', e);
    }
};

setupFirebase(firebaseConfig);

function createPlaceDocument(placeName) {
    const parts = placeName.split(',').map(part => part.trim()).filter(Boolean);
    const il = parts.length > 1 ? parts[parts.length - 1] : parts[0];
    const ilce = parts.length > 2 ? parts[parts.length - 2] : (parts.length === 2 ? parts[0] : '');
    const tur = parts.length === 1 ? 'il' : (parts.length === 2 ? 'ilce' : 'cadde');
    const docId = normalizeText(placeName).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120);
    const now = firebase.firestore.FieldValue.serverTimestamp();

    return {
        ref: window.firestoreDb.collection('yerler').doc(docId || 'isimsiz-yer'),
        data: {
            yerAdi: parts[0] || placeName,
            tamYol: placeName,
            tur,
            il,
            ilce,
            mahalle: parts.length > 3 ? parts[parts.length - 3] : '',
            enlem: null,
            boylam: null,
            siteSahibi: '',
            pythonBot: '',
            yapayZeka: '',
            yorumlar: [],
            olusturulmaTarihi: now,
            sonGuncelleme: now
        }
    };
}

async function saveSearchedPlace(placeName) {
    if (!window.firestoreDb || !window.firebase || !firebase.firestore) return;

    const place = createPlaceDocument(placeName);
    try {
        await window.firestoreDb.runTransaction(async transaction => {
            const snapshot = await transaction.get(place.ref);
            if (snapshot.exists) {
                transaction.update(place.ref, {
                    aramaSayisi: firebase.firestore.FieldValue.increment(1),
                    sonGuncelleme: firebase.firestore.FieldValue.serverTimestamp()
                });
            } else {
                transaction.set(place.ref, { ...place.data, aramaSayisi: 1 });
            }
        });
    } catch (error) {
        console.error('Aranan yer Firebase kaydedilemedi.', error);
    }
}