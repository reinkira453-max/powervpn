// netlify/functions/register-session.js
// Регистрирует сессию и генерирует уникальный токен

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        // Генерируем уникальный токен для этой сессии
        const sessionToken = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // В реальном приложении здесь было бы сохранение в БД
        // Сейчас просто возвращаем токен клиенту
        // он будет отправлять его вместе с username
        
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: true,
                session_token: sessionToken,
                expires_in: 3600 // 1 час
            })
        };
    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Internal server error' })
        };
    }
};
