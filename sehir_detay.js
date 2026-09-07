const placeTitle = document.getElementById('placeTitle');
const siteOwnerText = document.getElementById('siteOwnerText');
const aiStoryText = document.getElementById('aiStoryText');
const aiMessage = document.getElementById('aiMessage');
const pythonText = document.getElementById('pythonText');
const pythonSkeleton = document.getElementById('pythonSkeleton');
const siteOwnerSkeleton = document.getElementById('siteOwnerSkeleton');
const weatherLocation = document.getElementById('weatherLocation');
const weatherPanel = document.getElementById('weatherPanel');
const query = new URLSearchParams(window.location.search).get('q');
const placeName = query ? query.trim() : '';
let aiStatusTimers = [];

const firebaseConfig = {
    apiKey: 'AIzaSyBvwsj1EJCOzDpi94vUQuFtZgtvVK66OUU',
    authDomain: 'n1k-12d03.firebaseapp.com',
    projectId: 'n1k-12d03',
    storageBucket: 'n1k-12d03.firebasestorage.app',
    messagingSenderId: '737643507271',
    appId: '1:737643507271:web:ebf6f83c942ebb84c80b62',
    measurementId: 'G-HJZ07BQRG8'
};

if (placeName) {
    placeTitle.textContent = placeName;
    document.title = `${placeName} | Yer Adları`;
}

function normalizePlaceId(value) {
    return value.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
        .replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '').slice(0, 120);
}

async function loadSiteOwnerText() {
    if (!placeName || !siteOwnerText) return {};

    try {
        if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
        const placeId = normalizePlaceId(placeName) || 'isimsiz-yer';
        const snapshot = await firebase.firestore().collection('yerler').doc(placeId).get();
        const data = snapshot.exists ? snapshot.data() : {};
        const siteOwnerTextValue = data.siteSahibi || '';
        siteOwnerSkeleton.hidden = true;
        siteOwnerText.textContent = siteOwnerTextValue || 'Bu alan için henüz bilgi girilmedi.';
        pythonSkeleton.hidden = true;
        pythonText.textContent = data.pythonBot || 'Kaynaklar taranıyor...';
        if (data.yapayZeka) aiStoryText.textContent = data.yapayZeka;
        const hasPythonSections = /\bNE\b[\s\S]*\bNEDEN\b[\s\S]*\bKİM\b[\s\S]*\bNASIL\b/i.test(data.pythonBot || '');
        if (!hasPythonSections) generatePythonBot();
        loadWeather(data);
        return data;
    } catch (error) {
        console.error('Site sahibinin bilgisi yüklenemedi.', error);
        return {};
    }
}

async function generatePythonBot() {
    if (!placeName || !pythonText) return;
    try {
        const response = await fetch(`${window.AI_API_BASE_URL || ''}/api/python-bot`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ yerAdi: placeName })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Python botu çalışmadı.');
        pythonText.textContent = result.pythonBot || 'Kaynak bulunamadı.';
    } catch (error) {
        pythonText.textContent = 'Kaynak alınamadı. Bu konu için güvenilir kaynak bulunamadı.';
        console.error('Python botu oluşturulamadı.', error);
    }
}

async function loadWeather(placeData) {
    if (!weatherPanel) return;
    const il = (placeData.il || '').trim();
    const ilce = (placeData.ilce || '').trim();
    const locationName = [ilce, il].filter(Boolean).join(', ') || placeName;
    weatherLocation.textContent = locationName ? `${locationName} hava durumu` : 'İl / ilçe hava durumu';
    try {
        let latitude = Number(placeData.enlem);
        let longitude = Number(placeData.boylam);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            const queryName = [ilce, il].filter(Boolean).join(', ') || placeName;
            const geocode = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(queryName)}&count=1&language=tr&format=json`);
            const result = await geocode.json();
            const location = result.results?.[0];
            if (!location) throw new Error('İl veya ilçe konumu bulunamadı.');
            latitude = Number(location.latitude);
            longitude = Number(location.longitude);
        }
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto`);
        if (!response.ok) throw new Error('Hava durumu servisi yanıt vermedi.');
        const weather = await response.json();
        const current = weather.current;
        weatherPanel.innerHTML = `<div class="weather-current"><div><div class="weather-temperature">${Math.round(current.temperature_2m)}°C</div><div class="weather-description">${weatherDescription(current.weather_code)}</div></div><span>${weatherIcon(current.weather_code)}</span></div><dl class="weather-details"><div><dt>Nem</dt><dd>${current.relative_humidity_2m}%</dd></div><div><dt>Rüzgar</dt><dd>${Math.round(current.wind_speed_10m)} km/h</dd></div></dl>`;
    } catch (error) {
        weatherPanel.innerHTML = '<div class="side-placeholder">Hava durumu şu anda alınamadı.</div>';
        console.error('Hava durumu yüklenemedi.', error);
    }
}

function weatherDescription(code) {
    if (code === 0) return 'Açık';
    if ([1, 2, 3].includes(code)) return 'Parçalı bulutlu';
    if ([45, 48].includes(code)) return 'Sisli';
    if ([51, 53, 55, 56, 57].includes(code)) return 'Çisenti';
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'Yağmurlu';
    if ([71, 73, 75, 77].includes(code)) return 'Karlı';
    if ([95, 96, 99].includes(code)) return 'Gök gürültülü';
    return 'Değişken';
}

function weatherIcon(code) {
    if (code === 0) return '☀';
    if ([71, 73, 75, 77].includes(code)) return '❄';
    if ([95, 96, 99].includes(code)) return '⚡';
    return '☁';
}

async function generateAiStory() {
    if (!placeName) {
        aiMessage.textContent = 'Önce bir yer adı arayın.';
        return;
    }
    const apiBaseUrl = window.AI_API_BASE_URL || '';
    if (!apiBaseUrl) {
        aiMessage.textContent = 'AI sunucusu henüz bağlanmadı. Vercel API adresi gerekli.';
        return;
    }
    startAiStatusMessages();
    try {
        const response = await fetch(`${apiBaseUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sehirAdi: placeName })
        });
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            throw new Error('AI sunucusu bulunamadı. Vercel API adresini ayarlayın.');
        }
        const result = await response.json();
        if (!response.ok) throw new Error(result.detail || result.error || 'Hikaye oluşturulamadı.');
        aiStoryText.textContent = result.hikaye || 'Hikaye boş döndü.';
        stopAiStatusMessages('Hazır.');
    } catch (error) {
        stopAiStatusMessages(error.message || 'Hikaye oluşturulamadı.');
        console.error('AI hikayesi oluşturulamadı.', error);
    } finally {
    }
}

function startAiStatusMessages() {
    stopAiStatusMessages();
    aiMessage.classList.add('ai-loading');
    aiMessage.textContent = 'Kaynaklar taranıyor...';
    aiStatusTimers = [
        [2200, 'Özet analiz ediliyor...'],
        [4400, 'Metin yazıya dökülüyor...'],
        [6600, 'Bilgiler düzenleniyor...'],
        [8800, 'Son kontroller yapılıyor...']
    ].map(([delay, message]) => setTimeout(() => {
        aiMessage.textContent = message;
    }, delay));
}

function stopAiStatusMessages(message) {
    aiStatusTimers.forEach(timer => clearTimeout(timer));
    aiStatusTimers = [];
    aiMessage.textContent = message || '';
    aiMessage.classList.remove('ai-loading');
}

loadSiteOwnerText().then(data => {
    if (!data.yapayZeka) generateAiStory();
});

const detailBoxes = document.querySelectorAll('.detail-box');
const detailModal = document.getElementById('detailModal');
const modalClose = document.getElementById('modalClose');
const modalTitle = document.getElementById('modalTitle');
const modalText = document.getElementById('modalText');

function closeDetailModal() {
    detailModal.classList.remove('is-open');
    detailModal.setAttribute('aria-hidden', 'true');
}

function openDetailModal(box) {
    modalTitle.textContent = box.querySelector('h2').textContent;
    const text = box.querySelector('p').textContent.trim();
    modalText.replaceChildren();
    const sections = parseDetailSections(text);
    if (sections.length) {
        const sectionList = document.createElement('div');
        sectionList.className = 'detail-sections';
        sections.forEach(section => {
            const sectionElement = document.createElement('section');
            sectionElement.className = 'detail-section';
            const heading = document.createElement('h3');
            heading.textContent = section.title;
            const paragraph = document.createElement('p');
            paragraph.textContent = section.text;
            sectionElement.append(heading, paragraph);
            sectionList.appendChild(sectionElement);
        });
        modalText.appendChild(sectionList);
    } else {
        const paragraph = document.createElement('p');
        paragraph.textContent = text;
        modalText.appendChild(paragraph);
    }
    detailModal.classList.add('is-open');
    detailModal.setAttribute('aria-hidden', 'false');
}

function parseDetailSections(text) {
    const pattern = /(?:^|\s)(NEDEN|NASIL|KİM|NE)(?=\s*[?:：-]|\s|$)\s*[?:：-]?\s*/giu;
    const matches = [...text.matchAll(pattern)];
    const icons = { KİM: '👤', NE: '📖', NEDEN: '❓', NASIL: '🔄' };
    return matches.map((match, index) => {
        const heading = match[1].toLocaleUpperCase('tr-TR');
        const start = match.index + match[0].length;
        const end = matches[index + 1]?.index ?? text.length;
        return { title: `${icons[heading] || ''} ${heading}`.trim(), text: text.slice(start, end).trim() };
    });
}

detailBoxes.forEach(box => {
    if (box.classList.contains('detail-main-box')) {
        box.addEventListener('click', () => openDetailModal(box));
    }
    box.addEventListener('dblclick', () => openDetailModal(box));
});

modalClose.addEventListener('click', closeDetailModal);
detailModal.addEventListener('click', event => {
    if (event.target === detailModal) closeDetailModal();
});
document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeDetailModal();
});

const commentForm = document.getElementById('commentForm');
const commentInput = document.getElementById('commentInput');
const commentList = document.getElementById('commentList');
const commentStatus = document.getElementById('commentStatus');
const commentMessage = document.getElementById('commentMessage');
const commentSubmitButton = commentForm.querySelector('button[type="submit"]');
const placeId = normalizePlaceId(placeName) || 'isimsiz-yer';
let currentUser = null;
let comments = [];

function setCommentMessage(message) {
    commentMessage.textContent = message;
}

function userInitial(name) {
    return (name || 'K').trim().charAt(0).toLocaleUpperCase('tr-TR');
}

function createCommentCard(comment) {
    const card = document.createElement('article');
    card.className = 'comment-card';
    const author = document.createElement('a');
    author.className = 'comment-author';
    author.href = `profil.html?uid=${encodeURIComponent(comment.kullaniciId)}`;
    const avatar = document.createElement('span');
    avatar.className = 'comment-avatar';
    avatar.textContent = userInitial(comment.kullaniciAdi);
    const name = document.createElement('span');
    name.textContent = comment.kullaniciAdi || 'Kullanıcı';
    author.append(avatar, name);

    const text = document.createElement('p');
    text.className = 'comment-text';
    text.textContent = comment.metin || '';
    const tools = document.createElement('div');
    tools.className = 'comment-tools';
    const replyButton = document.createElement('button');
    replyButton.type = 'button';
    replyButton.textContent = 'Yanıtla';
    const actionButton = document.createElement('button');
    actionButton.type = 'button';
    actionButton.textContent = '•••';
    tools.append(replyButton, actionButton);

    const replyForm = document.createElement('form');
    replyForm.className = 'comment-reply';
    const replyInput = document.createElement('input');
    replyInput.maxLength = 1000;
    replyInput.placeholder = 'Yanıt yaz...';
    const replySubmit = document.createElement('button');
    replySubmit.type = 'submit';
    replySubmit.textContent = 'Gönder';
    replyForm.append(replyInput, replySubmit);
    const replies = document.createElement('div');
    replies.className = 'comment-replies';
    (comment.replies || []).forEach(reply => {
        const item = document.createElement('div');
        item.className = 'comment-reply-item';
        item.textContent = `${reply.kullaniciAdi || 'Kullanıcı'}: ${reply.metin || ''}`;
        replies.appendChild(item);
    });

    replyButton.addEventListener('click', () => {
        if (!currentUser) return setCommentMessage('Yanıt yazmak için giriş yapmalısın.');
        replyForm.classList.toggle('is-open');
        replyInput.focus();
    });
    replyForm.addEventListener('submit', event => submitReply(event, comment, replyInput, replyForm));
    actionButton.addEventListener('click', () => commentAction(comment));
    card.addEventListener('dblclick', () => commentAction(comment));
    addLongPress(card, comment);
    card.append(author, text, tools, replyForm, replies);
    return card;
}

function renderComments() {
    commentList.replaceChildren();
    comments.filter(comment => !comment.silindi).forEach(comment => commentList.appendChild(createCommentCard(comment)));
    commentStatus.textContent = comments.length ? `${comments.length} yorum` : 'Henüz yorum yapılmadı.';
}

async function loadComments() {
    try {
        if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
        const snapshot = await firebase.firestore().collection('yerler').doc(placeId).collection('yorumlar').orderBy('tarih', 'desc').get();
        comments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderComments();
    } catch (error) {
        commentStatus.textContent = 'Yorumlar şu anda yüklenemedi.';
        console.error('Yorumlar yüklenemedi.', error);
    }
}

async function notifyMentions(text, commentId) {
    const names = [...text.matchAll(/@([a-zA-Z0-9_.-]{3,30})/g)].map(match => match[1].toLocaleLowerCase('tr-TR'));
    for (const username of [...new Set(names)]) {
        const users = await firebase.firestore().collection('kullanicilar').where('kullaniciAdi', '==', username).limit(1).get();
        if (!users.empty && users.docs[0].id !== currentUser.uid) {
            await firebase.firestore().collection('kullanicilar').doc(users.docs[0].id).collection('bildirimler').add({
                tur: 'bahsetme', metin: `${currentUser.displayName || 'Bir kullanıcı'} sizden bahsetti.`,
                yerId: placeId, yorumId: commentId, hedefUrl: `sehir_detay.html?q=${encodeURIComponent(placeName)}`,
                okundu: false, tarih: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
    }
}

async function submitComment(event) {
    event.preventDefault();
    if (!currentUser) return setCommentMessage('Yorum yapmak için giriş yapmalısın.');
    const text = commentInput.value.trim();
    if (!text) return;
    setCommentMessage('Yorum gönderiliyor...');
    try {
        const ref = firebase.firestore().collection('yerler').doc(placeId).collection('yorumlar').doc();
        await ref.set({ kullaniciAdi: currentUser.displayName || 'Kullanıcı', kullaniciId: currentUser.uid, metin: text,
            tarih: firebase.firestore.FieldValue.serverTimestamp(), yildiz: false, begeniSayisi: 0, replies: [] });
        await notifyMentions(text, ref.id);
        commentInput.value = '';
        setCommentMessage('Yorumun yayınlandı.');
        await loadComments();
    } catch (error) {
        setCommentMessage('Yorum gönderilemedi.');
        console.error(error);
    }
}

async function submitReply(event, comment, input, form) {
    event.preventDefault();
    if (!currentUser) return setCommentMessage('Yanıt yazmak için giriş yapmalısın.');
    const text = input.value.trim();
    if (!text) return;
    const reply = { id: `${currentUser.uid}-${Date.now()}`, kullaniciAdi: currentUser.displayName || 'Kullanıcı', kullaniciId: currentUser.uid, metin: text, tarih: new Date().toISOString() };
    await firebase.firestore().collection('yerler').doc(placeId).collection('yorumlar').doc(comment.id).update({ replies: firebase.firestore.FieldValue.arrayUnion(reply) });
    await notifyMentions(text, comment.id);
    input.value = '';
    form.classList.remove('is-open');
    await loadComments();
}

function addLongPress(card, comment) {
    let timer;
    card.addEventListener('pointerdown', () => { timer = setTimeout(() => commentAction(comment), 650); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(type => card.addEventListener(type, () => clearTimeout(timer)));
}

async function commentAction(comment) {
    if (!currentUser) return setCommentMessage('İşlem yapmak için giriş yapmalısın.');
    const own = comment.kullaniciId === currentUser.uid;
    const action = prompt(own ? 'Yorumu silmek için "sil" yazın.' : 'Yorumu şikayet etmek için "şikayet" yazın.');
    const normalized = action ? action.toLocaleLowerCase('tr-TR') : '';
    if (own && normalized === 'sil') {
        await firebase.firestore().collection('yerler').doc(placeId).collection('yorumlar').doc(comment.id).delete();
        await loadComments();
    } else if (!own && normalized === 'şikayet') {
        await firebase.firestore().collection('sikayetler').add({ yerId: placeId, yorumId: comment.id, yorumMetni: comment.metin,
            yorumSahibiId: comment.kullaniciId, bildirenId: currentUser.uid, bildirenAdi: currentUser.displayName || 'Kullanıcı',
            durum: 'bekliyor', tarih: firebase.firestore.FieldValue.serverTimestamp() });
        setCommentMessage('Şikayetin admin incelemesine gönderildi.');
    }
}

commentForm.addEventListener('submit', submitComment);
firebase.auth().onAuthStateChanged(user => {
    currentUser = user;
    commentInput.disabled = !user;
    commentSubmitButton.disabled = !user;
    commentMessage.textContent = user ? '' : 'Yorum yapmak için giriş yapmalısın.';
});
loadComments();
