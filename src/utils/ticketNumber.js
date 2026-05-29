import { toMysqlDateTime } from './dateTime';

const MAX_TICKET_INSERT_ATTEMPTS = 5;

const isDuplicateTicketError = (error) => {
    const message = String(error || '').toLowerCase();
    return message.includes('duplicate') && message.includes('ticket_number');
};

const getTodayBounds = () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setHours(23, 59, 59, 999);

    return {
        startOfDay: toMysqlDateTime(start),
        endOfDay: toMysqlDateTime(end)
    };
};

const buildTicketNumber = (prefix, sequence) => {
    const currDate = new Date();
    const dd = String(currDate.getDate()).padStart(2, '0');
    const mm = String(currDate.getMonth() + 1).padStart(2, '0');
    const yy = String(currDate.getFullYear()).slice(-2);
    const sequenceNum = String(sequence).padStart(3, '0');
    return `${prefix} ${dd}${mm}${yy}/${sequenceNum}`;
};

export async function insertWithDailyTicket({ mysql, table, prefix, buildRow }) {
    let lastError = null;

    for (let attempt = 0; attempt < MAX_TICKET_INSERT_ATTEMPTS; attempt += 1) {
        const { startOfDay, endOfDay } = getTodayBounds();
        const { count } = await mysql
            .from(table)
            .select('*', { count: 'exact', head: true })
            .gte('created_at', startOfDay)
            .lte('created_at', endOfDay);

        const generatedTicket = buildTicketNumber(prefix, (count || 0) + 1 + attempt);
        const { data, error } = await mysql
            .from(table)
            .insert([buildRow(generatedTicket)])
            .select();

        if (!error) {
            return { data, generatedTicket };
        }

        lastError = error;
        if (!isDuplicateTicketError(error)) {
            throw error;
        }
    }

    throw lastError || new Error('Unable to generate a unique ticket number');
}
