const GLPI_URL = import.meta.env.VITE_GLPI_URL;
const APP_TOKEN = import.meta.env.VITE_GLPI_APP_TOKEN;
const USER_TOKEN = import.meta.env.VITE_GLPI_USER_TOKEN;

// Helper: fetch with timeout
const fetchWithTimeout = (url, options = {}, timeoutMs = 5000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal })
        .finally(() => clearTimeout(timer));
};

// Initialize session → returns session_token
export const initGlpiSession = async () => {
    const res = await fetchWithTimeout(`${GLPI_URL}/apirest.php/initSession`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'App-Token': APP_TOKEN,
            'Authorization': `user_token ${USER_TOKEN}`,
        },
    });
    if (!res.ok) throw new Error(`GLPI initSession failed: ${res.status}`);
    const data = await res.json();
    return data.session_token;
};

// Kill session
export const killGlpiSession = async (sessionToken) => {
    await fetch(`${GLPI_URL}/apirest.php/killSession`, {
        method: 'GET',
        headers: {
            'App-Token': APP_TOKEN,
            'Session-Token': sessionToken,
        },
    });
};

// Get computers list
export const getComputers = async (sessionToken) => {
    const res = await fetch(
        `${GLPI_URL}/apirest.php/Computer?range=0-200&expand_dropdowns=true&is_deleted=false`,
        {
            headers: {
                'App-Token': APP_TOKEN,
                'Session-Token': sessionToken,
            },
        }
    );
    if (!res.ok) throw new Error(`GLPI getComputers failed: ${res.status}`);
    return res.json();
};

// Get single computer detail
export const getComputerDetail = async (sessionToken, id) => {
    const res = await fetch(
        `${GLPI_URL}/apirest.php/Computer/${id}?expand_dropdowns=true`,
        {
            headers: {
                'App-Token': APP_TOKEN,
                'Session-Token': sessionToken,
            },
        }
    );
    if (!res.ok) throw new Error(`GLPI getComputerDetail failed: ${res.status}`);
    return res.json();
};

// Helper: run a function with auto session management
export const withGlpiSession = async (fn) => {
    let sessionToken = null;
    try {
        sessionToken = await initGlpiSession();
        return await fn(sessionToken);
    } finally {
        if (sessionToken) await killGlpiSession(sessionToken);
    }
};
