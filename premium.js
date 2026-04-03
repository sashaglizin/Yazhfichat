// premium.js — единая система премиума YzFi

// Глобальный объект статуса
window.premiumCache = {
    isActive: false,
    until: null,
    daysLeft: 0,
    lastChecked: 0
};

// Проверка премиума (с кэшированием на 30 секунд)
async function checkPremiumStatus(userId) {
    if (!userId) return false;
    
    const now = Date.now();
    if (window.premiumCache.lastChecked && (now - window.premiumCache.lastChecked) < 30000) {
        return window.premiumCache.isActive;
    }
    
    try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) return false;
        
        const data = userDoc.data();
        const premiumUntil = data?.premiumUntil?.toDate ? new Date(data.premiumUntil.toDate()) : null;
        const isActive = premiumUntil && premiumUntil > new Date();
        const daysLeft = isActive ? Math.ceil((premiumUntil - new Date()) / (1000 * 60 * 60 * 24)) : 0;
        
        window.premiumCache = {
            isActive,
            until: premiumUntil,
            daysLeft,
            lastChecked: now
        };
        
        return isActive;
    } catch(e) {
        console.error('Premium check error:', e);
        return false;
    }
}

// Быстрый доступ к статусу
function getPremiumStatus() {
    return window.premiumCache;
}

// Обновить все премиум-бейджи на странице
function updateAllPremiumBadges() {
    document.querySelectorAll('.premium-badge-target').forEach(el => {
        if (window.premiumCache.isActive) {
            el.innerHTML = '👑 PREMIUM';
            el.style.background = '#b47aff';
            el.style.color = '#1a0f2e';
            el.style.padding = '2px 8px';
            el.style.borderRadius = '4px';
            el.style.fontSize = '0.6rem';
            el.style.fontWeight = 'bold';
            el.style.display = 'inline-block';
        } else {
            el.innerHTML = '';
            el.style.display = 'none';
        }
    });
}

// ========== ЛИМИТЫ ДЛЯ ПРЕМИУМ/ОБЫЧНЫХ ==========
function getMaxFileSize(isPremium) {
    return isPremium ? 50 * 1024 * 1024 : 5 * 1024 * 1024; // 50MB или 5MB
}

function getMaxPinnedPosts(isPremium) {
    return isPremium ? 10 : 1;
}

function getMaxGroupMembers(isPremium) {
    return isPremium ? 500 : 100;
}

// ========== ДОПОЛНИТЕЛЬНЫЕ ПРОВЕРКИ ==========
async function canViewDeletedMessages() {
    return await checkPremiumStatus(window.currentUser?.uid);
}

async function canViewExactLastSeen() {
    return await checkPremiumStatus(window.currentUser?.uid);
}

async function canViewProfileViews() {
    return await checkPremiumStatus(window.currentUser?.uid);
}

// ========== ФОРМАТИРОВАНИЕ LAST SEEN ДЛЯ ПРЕМИУМ ==========
async function formatLastSeen(lastSeenDate, currentUserId, targetUserId) {
    if (!lastSeenDate) return '🕒 Неизвестно';
    
    const now = new Date();
    const diff = (now - lastSeenDate) / 1000;
    
    // Если онлайн в течение последней минуты
    if (diff < 60) {
        return '🟢 Онлайн';
    }
    
    // Проверяем, есть ли у текущего пользователя премиум
    const isCurrentPremium = await checkPremiumStatus(currentUserId);
    
    if (isCurrentPremium) {
        // Премиум видит точное время
        return `🕒 Был(а): ${lastSeenDate.toLocaleString('ru-RU', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        })}`;
    } else {
        // Обычный пользователь видит приблизительно
        const mins = Math.floor(diff / 60);
        if (mins < 60) return `🕒 Был(а) ${mins} мин назад`;
        if (mins < 1440) return `🕒 Был(а) ${Math.floor(mins / 60)} ч назад`;
        return `🕒 Был(а) ${Math.floor(mins / 1440)} дн назад`;
    }
}

// ========== ПРОСМОТР УДАЛЁННЫХ СООБЩЕНИЙ ==========
async function showDeletedMessagesArchive(userId) {
    const isPremium = await checkPremiumStatus(userId);
    if (!isPremium) {
        alert('👑 Доступно только с премиумом');
        return false;
    }
    
    try {
        const deleted = await db.collection('users').doc(userId)
            .collection('deletedMessages')
            .orderBy('deletedAt', 'desc')
            .limit(50)
            .get();
        
        if (deleted.empty) {
            alert('📭 Нет сохранённых удалённых сообщений');
            return false;
        }
        
        let message = '🕵️ АРХИВ УДАЛЁННЫХ СООБЩЕНИЙ:\n\n';
        deleted.forEach(doc => {
            const data = doc.data();
            const date = data.deletedAt?.toDate?.()?.toLocaleString() || 'неизвестно';
            message += `📅 ${date}\n`;
            message += `💬 ${data.text || '[Фото]'}\n`;
            message += `👤 От: ${data.fromUsername || 'неизвестно'}\n`;
            message += `————————————\n`;
        });
        alert(message);
        return true;
    } catch(e) {
        console.error('Error loading deleted messages:', e);
        alert('❌ Ошибка загрузки архива');
        return false;
    }
}

// ========== ЦВЕТНОЙ НИК ДЛЯ ПРЕМИУМ ==========
function applyPremiumNicknameToElement(element, isPremium) {
    if (!element) return;
    if (isPremium) {
        element.style.color = '#b47aff';
        element.style.fontWeight = 'bold';
    } else {
        element.style.color = '';
        element.style.fontWeight = '';
    }
}

// ========== ЭКСПОРТ ЧАТОВ (ПРЕМИУМ) ==========
async function exportChatsToJSON(userId, myUsername, db, dmChatIdFn) {
    const isPremium = await checkPremiumStatus(userId);
    if (!isPremium) {
        alert('👑 Экспорт чатов доступен только с премиумом');
        return false;
    }
    
    try {
        alert('📦 Подготовка экспорта...');
        
        const chatsSnap = await db.collection('users').doc(userId)
            .collection('chats')
            .get();
        
        let exportData = {
            user: userId,
            username: myUsername,
            exportDate: new Date().toISOString(),
            chats: []
        };
        
        for (const chatDoc of chatsSnap.docs) {
            const chat = chatDoc.data();
            let messages = [];
            
            if (chat.type === 'dm') {
                const chatId = dmChatIdFn(userId, chat.userId);
                const msgs = await db.collection('chats').doc(chatId).collection('messages')
                    .orderBy('timestamp', 'asc').get();
                messages = msgs.docs.map(d => d.data());
            } else if (chat.type === 'group') {
                const msgs = await db.collection('groups').doc(chat.groupId).collection('messages')
                    .orderBy('timestamp', 'asc').get();
                messages = msgs.docs.map(d => d.data());
            }
            
            exportData.chats.push({
                chatId: chatDoc.id,
                chatName: chat.username || chat.name,
                type: chat.type,
                messages: messages.map(m => ({
                    text: m.text,
                    imageUrl: m.imageUrl,
                    timestamp: m.timestamp?.toDate?.() || null,
                    userId: m.userId,
                    username: m.username
                }))
            });
        }
        
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `yzfi_export_${new Date().toISOString().slice(0, 19)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        alert('✅ Экспорт завершён!');
        return true;
    } catch(e) {
        console.error('Export error:', e);
        alert('❌ Ошибка экспорта');
        return false;
    }
}