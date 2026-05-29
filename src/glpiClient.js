const GLPI_URL = import.meta.env.VITE_GLPI_URL;
const useGlpiProxy = import.meta.env.VITE_USE_GLPI_PROXY !== 'false';
const BASE_URL = useGlpiProxy
    ? '/glpi-proxy/apirest.php'
    : `${GLPI_URL}/apirest.php`;

if (import.meta.env.DEV) {
    console.debug('GLPI runtime config:', {
        GLPI_URL,
        useProxy: useGlpiProxy,
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

const fetchWithTimeout = (url, options = {}, timeoutMs = 5000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal })
        .finally(() => clearTimeout(timer));
};

export const initGlpiSession = async () => {
    const res = await fetchWithTimeout(`${BASE_URL}/initSession`, {
        method: 'GET',
    });
    if (!res.ok) {
        const errorText = await parseGlpiError(res);
        throw new Error(`GLPI initSession failed: ${res.status} ${errorText}`);
    }
    const data = await res.json();
    return data.session_token;
};

export const killGlpiSession = async (sessionToken) => {
    await fetchWithTimeout(`${BASE_URL}/killSession`, {
        method: 'GET',
        headers: {
            'Session-Token': sessionToken,
        },
    }).catch(() => {});
};

export const formatGlpiUserName = (nameStr) => {
    if (!nameStr) return nameStr;
    if (typeof nameStr !== 'string') return nameStr;
    const parts = nameStr.trim().replace(/\s+/g, ' ').split(' ');
    if (parts.length >= 2) {
        const firstName = parts.pop();
        const lastName = parts.join(' ');
        return `${firstName} ${lastName}`;
    }
    return nameStr;
};

export const getComputers = async (sessionToken) => {
    const res = await fetchWithTimeout(
        `${BASE_URL}/Computer?range=0-999&expand_dropdowns=true&is_deleted=false`,
        {
            headers: {
                'Session-Token': sessionToken,
            },
        }
    );
    if (!res.ok) throw new Error(`GLPI getComputers failed: ${res.status}`);
    const data = await res.json();

    if (Array.isArray(data)) {
        return data.map(c => ({
            ...c,
            users_id: formatGlpiUserName(c.users_id)
        }));
    }
    return data;
};

export const getComputerDetail = async (sessionToken, id) => {
    const res = await fetchWithTimeout(
        `${BASE_URL}/Computer/${id}?expand_dropdowns=true&with_networkports=true`,
        {
            headers: {
                'Session-Token': sessionToken,
            },
        }
    );
    if (!res.ok) throw new Error(`GLPI getComputerDetail failed: ${res.status}`);
    return res.json();
};

export const extractIpAddresses = (computerDetail) => {
    const ips = [];
    try {
        const ports = computerDetail?._networkports;
        if (!ports) return ips;

        const portTypes = Object.values(ports);
        for (const portGroup of portTypes) {
            const portList = Array.isArray(portGroup) ? portGroup : Object.values(portGroup || {});
            for (const port of portList) {
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
                if (port?.ip && port.ip !== '0.0.0.0') ips.push(port.ip);
            }
        }
    } catch (e) {
        console.warn('extractIpAddresses error:', e);
    }
    const ipv4Regex = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
    return [...new Set(ips)].filter(ip => ipv4Regex.test(ip));
};

export const getUsers = async (sessionToken) => {
    const res = await fetchWithTimeout(
        `${BASE_URL}/User?range=0-999&is_deleted=false&is_active=true`,
        {
            headers: {
                'Session-Token': sessionToken,
            },
        }
    );
    if (!res.ok) throw new Error(`GLPI getUsers failed: ${res.status}`);
    const data = await res.json();

    if (Array.isArray(data)) {
        return data.map(u => {
            const realName = u.firstname && u.realname
                ? `${u.firstname} ${u.realname}`.replace(/\s+/g, ' ').trim()
                : formatGlpiUserName(u.name);
            return {
                ...u,
                formattedName: realName
            };
        });
    }
    return data;
};

export const withGlpiSession = async (fn) => {
    let sessionToken = null;
    try {
        sessionToken = await initGlpiSession();
        return await fn(sessionToken);
    } finally {
        if (sessionToken) await killGlpiSession(sessionToken);
    }
};
