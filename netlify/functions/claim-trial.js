// netlify/functions/claim-trial.js
// Привязывает триал к Telegram ID пользователя

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Простое хранилище привязок токен → telegram_id (в продакшене — БД)
const claimedTokens = new Map();

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    let requestBody;
    try {
        requestBody = JSON.parse(event.body);
    } catch (e) {
        return {
            statusCode: 400,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Invalid JSON' })
        };
    }

    const { session_token, telegram_id } = requestBody;

    if (!session_token || !telegram_id) {
        return {
            statusCode: 400,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'session_token and telegram_id are required' })
        };
    }

    // Проверяем: был ли этот токен уже привязан?
    if (claimedTokens.has(session_token)) {
        const claimed = claimedTokens.get(session_token);
        
        if (claimed.telegram_id !== telegram_id) {
            return {
                statusCode: 403,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    error: 'Этот токен уже привязан к другому пользователю',
                    success: false
                })
            };
        }
    }

    // Привязываем токен к telegram_id
    claimedTokens.set(session_token, {
        telegram_id: telegram_id,
        claimed_at: new Date().toISOString()
    });

    console.log(`Token ${session_token} claimed by ${telegram_id}`);

    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            success: true,
            session_token: session_token,
            telegram_id: telegram_id,
            message: 'Trial successfully claimed'
        })
    };
};

// Экспортируем Map для использования в других функциях
exports.claimedTokens = claimedTokens;
