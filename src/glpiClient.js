const GLPI_URL = import.meta.env.VITE_GLPI_URL;
const APP_TOKEN = import.meta.env.VITE_GLPI_APP_TOKEN;
const USER_TOKEN = import.meta.env.VITE_GLPI_USER_TOKEN;

// ใน dev (localhost) ใช้ Vite proxy เพื่อ bypass CORS
// ใน production ใช้ GLPI URL ตรง (ต้องตั้ง CORS บน Apache ฝั่ง GLPI)
const BASE_URL = import.meta.env.DEV
    ? '/glpi-proxy/apirest.php'
    : `${GLPI_URL}/apirest.php`;

// Helper: fetch with timeout
const fetchWithTimeout = (url, options = {}, timeoutMs = 5000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal })
        .finally(() => clearTimeout(timer));
};

// Initialize session → returns session_token
export const initGlpiSession = async () => {
    const res = await fetchWithTimeout(`${BASE_URL}/initSession`, {
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
    await fetchWithTimeout(`${BASE_URL}/killSession`, {
        method: 'GET',
        headers: {
            'App-Token': APP_TOKEN,
            'Session-Token': sessionToken,
        },
    }).catch(() => { }); // ไม่ต้อง throw ถ้า kill ไม่สำเร็จ
};

// Get computers list
export const getComputers = async (sessionToken) => {
    const res = await fetchWithTimeout(
        `${BASE_URL}/Computer?range=0-200&expand_dropdowns=true&is_deleted=false`,
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
    const res = await fetchWithTimeout(
        `${BASE_URL}/Computer/${id}?expand_dropdowns=true`,
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
