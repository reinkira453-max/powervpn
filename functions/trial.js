export async function onRequestPost(context) {
    const { request, env } = context;

    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json',
    };

    let requestBody;
    try {
        requestBody = await request.json();
    } catch (e) {
        return new Response(JSON.stringify({ error: 'Invalid JSON', sub_url: null }), {
            status: 400, headers: corsHeaders
        });
    }

    const { username, session_token } = requestBody;

    if (!username || typeof username !== 'string' || username.trim().length === 0) {
        return new Response(JSON.stringify({ error: 'Username is required', sub_url: null }), {
            status: 400, headers: corsHeaders
        });
    }

    if (!session_token || typeof session_token !== 'string') {
        return new Response(JSON.stringify({ error: 'Session token is required', sub_url: null }), {
            status: 400, headers: corsHeaders
        });
    }

    const cleanUsername = username.trim().replace(/^@/, '');
    const ip = (request.headers.get('cf-connecting-ip') || 'unknown');

    const marzbanUrl = (env.MARZBAN_URL || '').trim();
    const marzbanLogin = (env.MARZBAN_LOGIN || '').trim();
    const marzbanPassword = (env.MARZBAN_PASSWORD || '').trim();
    const botApiUrl = (env.BOT_API_URL || 'http://213.165.41.80:8080').trim();

    if (!marzbanUrl || !marzbanLogin || !marzbanPassword) {
        return new Response(JSON.stringify({ error: 'Server not properly configured', sub_url: null }), {
            status: 500, headers: corsHeaders
        });
    }

    try {
        // Шаг 1: Авторизация в Marzban
        const tokenResponse = await fetch(`${marzbanUrl}/api/admin/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `username=${encodeURIComponent(marzbanLogin)}&password=${encodeURIComponent(marzbanPassword)}`
        });

        if (!tokenResponse.ok) {
            return new Response(JSON.stringify({ error: 'Failed to authenticate with Marzban', sub_url: null }), {
                status: 502, headers: corsHeaders
            });
        }

        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;

        // Шаг 2: Создаём пользователя в Marzban (24ч)
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
            userData = await existingResp.json();
        } else if (!createUserResponse.ok) {
            return new Response(JSON.stringify({ error: 'Failed to create VPN user', sub_url: null }), {
                status: 502, headers: corsHeaders
            });
        } else {
            userData = await createUserResponse.json();
        }

        let subscriptionUrl = userData.subscription_url;
        if (subscriptionUrl && !subscriptionUrl.startsWith('http')) {
            subscriptionUrl = `${marzbanUrl}${subscriptionUrl}`;
        }

        if (!subscriptionUrl) {
            return new Response(JSON.stringify({ error: 'Failed to get subscription URL', sub_url: null }), {
                status: 502, headers: corsHeaders
            });
        }

        // Шаг 3: Сохраняем триал в боте
        try {
            await fetch(`${botApiUrl}/api/trial`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token: session_token,
                    sub_url: subscriptionUrl,
                    marzban_username: marzbanUsername,
                    ip: ip
                })
            });
        } catch (botErr) {
            console.error('Failed to save trial to bot:', botErr.message);
        }

        // Шаг 4: Генерируем промокод +4 дня
        let promoCode = null;
        try {
            const promoResp = await fetch(`${botApiUrl}/api/promo`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ip: ip })
            });
            if (promoResp.ok) {
                const promoData = await promoResp.json();
                promoCode = promoData.promo_code || null;
            }
        } catch (promoErr) {
            console.error('Failed to create promo:', promoErr.message);
        }

        const happUrl = `happ://add/${encodeURIComponent(subscriptionUrl)}`;

        return new Response(JSON.stringify({
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
        }), { status: 200, headers: corsHeaders });

    } catch (error) {
        return new Response(JSON.stringify({ error: 'Internal server error', details: error.message, sub_url: null }), {
            status: 500, headers: corsHeaders
        });
    }
}

export async function onRequestOptions() {
    return new Response(null, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        }
    });
}