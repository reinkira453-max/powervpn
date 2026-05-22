// netlify/functions/trial.js
// PowerVPN Trial Key Generator

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

exports.handler = async (event) => {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };

    // CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: ''
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Method not allowed', sub_url: null })
        };
    }

    let requestBody;
    try {
        requestBody = JSON.parse(event.body);
    } catch (e) {
        return {
            statusCode: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Invalid JSON', sub_url: null })
        };
    }

    const { username, session_token } = requestBody;

    if (!username || typeof username !== 'string' || username.trim().length === 0) {
        return {
            statusCode: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Username is required', sub_url: null })
        };
    }

    if (!session_token || typeof session_token !== 'string') {
        return {
            statusCode: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Session token is required', sub_url: null })
        };
    }

    const cleanUsername = username.trim().replace(/^@/, '');
    const ip = (event.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();

    try {
        const marzbanUrl = (process.env.MARZBAN_URL || '').trim();
        const marzbanLogin = (process.env.MARZBAN_LOGIN || '').trim();
        const marzbanPassword = (process.env.MARZBAN_PASSWORD || '').trim();
        const botApiUrl = (process.env.BOT_API_URL || 'http://213.165.41.80:8080').trim();

        if (!marzbanUrl || !marzbanLogin || !marzbanPassword) {
            return {
                statusCode: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Server not properly configured', sub_url: null })
            };
        }

        // ── Шаг 1: Авторизация в Marzban ──────────────────────────────────────
        const tokenResponse = await fetch(`${marzbanUrl}/api/admin/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `username=${encodeURIComponent(marzbanLogin)}&password=${encodeURIComponent(marzbanPassword)}`
        });

        if (!tokenResponse.ok) {
            const errText = await tokenResponse.text();
            console.error('Token error:', errText);
            return {
                statusCode: 502,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Failed to authenticate with Marzban', sub_url: null })
            };
        }

        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;

        if (!accessToken) {
            return {
                statusCode: 502,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Invalid token response', sub_url: null })
            };
        }

        // ── Шаг 2: Создаём пользователя в Marzban (24ч) ───────────────────────
        const shortToken = session_token.slice(-12);
        const marzbanUsername = `guest_${shortToken}_dev1`;
        const timestamp = Math.floor(Date.now() / 1000);
        const expiresAt = timestamp + (1 * 24 * 60 * 60);

        const createUserPayload = {
            username: marzbanUsername,
            proxies: { vless: {} },
            inbounds: { vless: ["VLESS TCP REALITY"] },
            expire: expiresAt,
            data_limit: 0,
            data_limit_reset_strategy: "no_reset",
            limit_ip: 1,
            note: `WebTrial | @${cleanUsername} | token:${session_token.substring(0, 12)}`
        };

        const createUserResponse = await fetch(`${marzbanUrl}/api/user`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify(createUserPayload)
        });

        let userData;
        if (createUserResponse.status === 409) {
            const existingResp = await fetch(`${marzbanUrl}/api/user/${marzbanUsername}`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            if (!existingResp.ok) {
                return {
                    statusCode: 502,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ error: 'Failed to get existing user', sub_url: null })
                };
            }
            userData = await existingResp.json();
        } else if (!createUserResponse.ok) {
            const errBody = await createUserResponse.text();
            console.error('Create user failed:', createUserResponse.status, errBody);
            return {
                statusCode: 502,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Failed to create VPN user', sub_url: null })
            };
        } else {
            userData = await createUserResponse.json();
        }

        let subscriptionUrl = userData.subscription_url;
        if (subscriptionUrl && !subscriptionUrl.startsWith('http')) {
            subscriptionUrl = `${marzbanUrl}${subscriptionUrl}`;
        }

        if (!subscriptionUrl) {
            return {
                statusCode: 502,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Failed to get subscription URL', sub_url: null })
            };
        }

        // ── Шаг 3: Сохраняем триал в бот-сервер ───────────────────────────────
        try {
            await fetch(`${botApiUrl}/api/trial`, {
                method: 'POST',
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token: session_token,
                    sub_url: subscriptionUrl,
                    marzban_username: marzbanUsername,
                    ip: ip
                })
            });
        } catch (botErr) {
            console.error('Failed to save trial to bot server:', botErr.message);
        }

        // ── Шаг 4: Генерируем промокод +4 дня ─────────────────────────────────
        let promoCode = null;
        try {
            const promoResp = await fetch(`${botApiUrl}/api/promo`, {
                method: 'POST',
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ ip: ip })
            });
            if (promoResp.ok) {
                const promoData = await promoResp.json();
                promoCode = promoData.promo_code || null;
            }
        } catch (promoErr) {
            console.error('Failed to create promo code:', promoErr.message);
        }

        const happUrl = `happ://add/${encodeURIComponent(subscriptionUrl)}`;

        return {
            statusCode: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: true,
                sub_url: subscriptionUrl,
                happ_url: happUrl,
                promo_code: promoCode,
                session_token: session_token,
                marzban_username: marzbanUsername,
                telegram_username: cleanUsername,
                expires_at: expiresAt,
                trial_days: 1,
                created_at: timestamp
            })
        };

    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Internal server error', details: error.message, sub_url: null })
        };
    }
};
