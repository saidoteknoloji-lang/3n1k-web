const firebaseConfig = {
    apiKey: 'AIzaSyBvwsj1EJCOzDpi94vUQuFtZgtvVK66OUU',
    authDomain: 'n1k-12d03.firebaseapp.com',
    projectId: 'n1k-12d03',
    storageBucket: 'n1k-12d03.firebasestorage.app',
    messagingSenderId: '737643507271',
    appId: '1:737643507271:web:ebf6f83c942ebb84c80b62',
    measurementId: 'G-HJZ07BQRG8'
};

const profileUsername = document.getElementById('profileUsername');
const profileEmail = document.getElementById('profileEmail');
const settingsBtn = document.getElementById('settingsBtn');
const settingsOverlay = document.getElementById('settingsOverlay');
const settingsClose = document.getElementById('settingsClose');
const usernameForm = document.getElementById('usernameForm');
const usernameInput = document.getElementById('usernameInput');
const settingsMsg = document.getElementById('settingsMsg');
const notificationButton = document.getElementById('notificationButton');
const notificationPanel = document.getElementById('notificationPanel');
const notificationCount = document.getElementById('notificationCount');
const requestedUid = new URLSearchParams(window.location.search).get('uid');

function showSettings() {
    settingsOverlay.setAttribute('aria-hidden', 'false');
    usernameInput.focus();
}

function hideSettings() {
    settingsOverlay.setAttribute('aria-hidden', 'true');
    settingsMsg.textContent = '';
}

function renderUser(user) {
    profileUsername.textContent = user.displayName || 'Kullanıcı';
    profileEmail.textContent = user.email || '';
    usernameInput.value = user.displayName || '';
}

async function renderPublicUser(uid) {
    const snapshot = await firebase.firestore().collection('kullanicilar').doc(uid).get();
    if (!snapshot.exists) {
        profileUsername.textContent = 'Kullanıcı bulunamadı';
        return;
    }
    const data = snapshot.data();
    profileUsername.textContent = data.gorunenAd || data.kullaniciAdi || 'Kullanıcı';
    profileEmail.textContent = '';
    settingsBtn.hidden = true;
    document.querySelector('.profile-bio').textContent = 'Yer adlarının hikayelerini keşfediyor.';
}

async function saveUserProfile(user, username) {
    await firebase.firestore().collection('kullanicilar').doc(user.uid).set({
        kullaniciAdi: username.toLocaleLowerCase('tr-TR'),
        gorunenAd: username,
        email: user.email || ''
    }, { merge: true });
}

async function loadNotifications(user) {
    const snapshot = await firebase.firestore().collection('kullanicilar').doc(user.uid).collection('bildirimler')
        .orderBy('tarih', 'desc').limit(20).get();
    notificationPanel.replaceChildren();
    if (snapshot.empty) {
        notificationPanel.innerHTML = '<p>Bildirim yok.</p>';
        notificationCount.hidden = true;
        return;
    }
    const unread = snapshot.docs.filter(doc => !doc.data().okundu).length;
    notificationCount.textContent = unread;
    notificationCount.hidden = unread === 0;
    snapshot.docs.forEach(doc => {
        const data = doc.data();
        const link = document.createElement('a');
        link.className = 'notification-item';
        link.href = data.hedefUrl || '#';
        link.textContent = data.metin || 'Yeni bildirim';
        link.addEventListener('click', () => doc.ref.update({ okundu: true }));
        notificationPanel.appendChild(link);
    });
}

firebase.initializeApp(firebaseConfig);
firebase.auth().onAuthStateChanged(user => {
    if (requestedUid) {
        renderPublicUser(requestedUid).catch(console.error);
        if (!user || requestedUid !== user.uid) return;
    }
    if (!user) {
        window.location.href = 'index.html';
        return;
    }
    renderUser(user);
    saveUserProfile(user, user.displayName || 'Kullanıcı').catch(console.error);
    loadNotifications(user).catch(console.error);
});

notificationButton.addEventListener('click', () => {
    const isOpen = notificationPanel.classList.toggle('is-open');
    notificationPanel.setAttribute('aria-hidden', String(!isOpen));
});

settingsBtn.addEventListener('click', showSettings);
settingsClose.addEventListener('click', hideSettings);
settingsOverlay.addEventListener('click', event => {
    if (event.target === settingsOverlay) hideSettings();
});

usernameForm.addEventListener('submit', event => {
    event.preventDefault();
    const username = usernameInput.value.trim();
    if (username.length < 3) {
        settingsMsg.textContent = 'Kullanıcı adı en az 3 karakter olmalı.';
        return;
    }

    const user = firebase.auth().currentUser;
    settingsMsg.textContent = 'Kaydediliyor...';
    user.updateProfile({ displayName: username })
        .then(() => {
            return saveUserProfile(user, username);
        })
        .then(() => {
            profileUsername.textContent = username;
            settingsMsg.textContent = 'Kullanıcı adı güncellendi.';
        })
        .catch(error => {
            settingsMsg.textContent = error.message || 'Kullanıcı adı güncellenemedi.';
        });
});
