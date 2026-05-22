// netlify/functions/verify-trial.js
// Проверяет активность триала для бота

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const activeSessions = new Map();
const usedUsernames = new Map();

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

    const { marzban_username, session_token } = requestBody;

    if (!marzban_username) {
        return {
            statusCode: 400,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'marzban_username is required' })
        };
    }

    try {
        const marzbanUrl = (process.env.MARZBAN_URL || '').trim();
        const marzbanLogin = (process.env.MARZBAN_LOGIN || '').trim();
        const marzbanPassword = (process.env.MARZBAN_PASSWORD || '').trim();

        if (!marzbanUrl || !marzbanLogin || !marzbanPassword) {
            return {
                statusCode: 500,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Server not properly configured' })
            };
        }

        // Получаем токен
        const tokenResponse = await fetch(`${marzbanUrl}/api/admin/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `username=${encodeURIComponent(marzbanLogin)}&password=${encodeURIComponent(marzbanPassword)}`
        });

        if (!tokenResponse.ok) {
            return {
                statusCode: 502,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Failed to authenticate with Marzban' })
            };
        }

        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;

        // Получаем информацию о подписке
        const userResponse = await fetch(`${marzbanUrl}/api/user/${marzban_username}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!userResponse.ok) {
            return {
                statusCode: 404,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    error: 'Subscription not found',
                    active: false
                })
            };
        }

        const userData = await userResponse.json();
        const now = Math.floor(Date.now() / 1000);
        const isActive = userData.expire > now;

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: true,
                username: marzban_username,
                active: isActive,
                expires_at: userData.expire,
                data_used: userData.used_traffic,
                data_limit: userData.data_limit,
                created_at: userData.created_at
            })
        };

    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Internal server error', details: error.message })
        };
    }
};
