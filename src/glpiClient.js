const GLPI_URL = import.meta.env.VITE_GLPI_URL;
const APP_TOKEN = import.meta.env.VITE_GLPI_APP_TOKEN;
const USER_TOKEN = import.meta.env.VITE_GLPI_USER_TOKEN;

if (import.meta.env.DEV) {
    console.debug('GLPI runtime config:', {
        GLPI_URL,
        hasAppToken: Boolean(APP_TOKEN),
        hasUserToken: Boolean(USER_TOKEN),
    });
}

const parseGlpiError = async (res) => {
    const contentType = res.headers.get('Content-Type') || '';
    try {
        if (contentType.includes('application/json')) {
            const data = await res.json();
            return JSON.stringify(data);
        }
        return await res.text();
    } catch {
        return res.statusText || 'Unknown GLPI error';
    }
};

const ensureGlpiAuth = () => {
    if (!APP_TOKEN || !USER_TOKEN) {
        throw new Error('Missing GLPI auth config: VITE_GLPI_APP_TOKEN and VITE_GLPI_USER_TOKEN are required.');
    }
};

// ใช้ proxy เมื่อ dev หรือ deploy บน Vercel (VITE_USE_GLPI_PROXY=true)
const useGlpiProxy = import.meta.env.DEV || import.meta.env.VITE_USE_GLPI_PROXY === 'true'
const BASE_URL = useGlpiProxy
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
    ensureGlpiAuth();
    const res = await fetchWithTimeout(`${BASE_URL}/initSession`, {
        method: 'GET',
        headers: {
            'App-Token': APP_TOKEN,
            'Authorization': `user_token ${USER_TOKEN}`,
        },
    });
    if (!res.ok) {
        const errorText = await parseGlpiError(res);
        throw new Error(`GLPI initSession failed: ${res.status} ${errorText}`);
    }
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

export const formatGlpiUserName = (nameStr) => {
    if (!nameStr) return nameStr;
    if (typeof nameStr !== 'string') return nameStr;
    const parts = nameStr.trim().replace(/\s+/g, ' ').split(' ');
    if (parts.length >= 2) {
        // แลกตำแหน่งคำสุดท้าย (First Name) กับคำข้างหน้าทั้งหมด (Last Name)
        const firstName = parts.pop();
        const lastName = parts.join(' ');
        return `${firstName} ${lastName}`;
    }
    return nameStr;
};

// Get computers list
export const getComputers = async (sessionToken) => {
    const res = await fetchWithTimeout(
        `${BASE_URL}/Computer?range=0-999&expand_dropdowns=true&is_deleted=false`,
        {
            headers: {
                'App-Token': APP_TOKEN,
                'Session-Token': sessionToken,
            },
        }
    );
    if (!res.ok) throw new Error(`GLPI getComputers failed: ${res.status}`);
    const data = await res.json();
    
    // Format users_id names if it exists
    if (Array.isArray(data)) {
        return data.map(c => ({
            ...c,
            users_id: formatGlpiUserName(c.users_id)
        }));
    }
    return data;
};

// Get single computer detail (with network ports for IP)
export const getComputerDetail = async (sessionToken, id) => {
    const res = await fetchWithTimeout(
        `${BASE_URL}/Computer/${id}?expand_dropdowns=true&with_networkports=true`,
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

// Extract IP addresses from computer detail (with_networkports response)
export const extractIpAddresses = (computerDetail) => {
    const ips = [];
    try {
        const ports = computerDetail?._networkports;
        if (!ports) return ips;

        // NetworkPort อาจอยู่ใน key ต่างๆ เช่น NetworkPortEthernet, NetworkPortWifi ฯลฯ
        const portTypes = Object.values(ports);
        for (const portGroup of portTypes) {
            const portList = Array.isArray(portGroup) ? portGroup : Object.values(portGroup || {});
            for (const port of portList) {
                // IP อาจอยู่ใน NetworkName → IPAddress
                const networkName = port?.NetworkName;
                if (networkName) {
                    const ipAddresses = networkName?.IPAddress;
                    if (Array.isArray(ipAddresses)) {
                        ipAddresses.forEach(ip => {
                            if (ip?.name && ip.name !== '0.0.0.0' && ip.name !== '::1') {
                                ips.push(ip.name);
                            }
                        });
                    } else if (typeof ipAddresses === 'object' && ipAddresses !== null) {
                        Object.values(ipAddresses).forEach(ip => {
                            if (ip?.name && ip.name !== '0.0.0.0' && ip.name !== '::1') {
                                ips.push(ip.name);
                            }
                        });
                    }
                }
                // บาง version IP อยู่ตรง port.ip / port.ipaddr เลย
                if (port?.ip && port.ip !== '0.0.0.0') ips.push(port.ip);
            }
        }
    } catch (e) {
        console.warn('extractIpAddresses error:', e);
    }
    // ลบ duplicate + กรองเฉพาะ IPv4
    const ipv4Regex = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
    return [...new Set(ips)].filter(ip => ipv4Regex.test(ip));
};

// Get users list (from AD usually linked in GLPI)
export const getUsers = async (sessionToken) => {
    const res = await fetchWithTimeout(
        `${BASE_URL}/User?range=0-999&is_deleted=false&is_active=true`,
        {
            headers: {
                'App-Token': APP_TOKEN,
                'Session-Token': sessionToken,
            },
        }
    );
    if (!res.ok) throw new Error(`GLPI getUsers failed: ${res.status}`);
    const data = await res.json();
    
    // Format users name to match our structure if the name comes as Last First
    if (Array.isArray(data)) {
        return data.map(u => {
            // Usually GLPI returns firstname, lastname, name separately. If they use AD mapped "name"
            const realName = u.firstname && u.realname ? `${u.firstname} ${u.realname}`.replace(/\s+/g, ' ').trim() : formatGlpiUserName(u.name);
            return {
                ...u,
                formattedName: realName
            };
        });
    }
    return data;
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
