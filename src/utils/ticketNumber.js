import { toMysqlDateTime } from './dateTime';

const MAX_DOCUMENT_INSERT_ATTEMPTS = 5;

const isDuplicateDocumentNumberError = (error) => {
    const message = String(error || '').toLowerCase();
    return message.includes('duplicate');
};

const getCurrentMonthBounds = () => {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    end.setMilliseconds(-1);

    return {
        startOfMonth: toMysqlDateTime(start),
        endOfMonth: toMysqlDateTime(end)
    };
};

export const buildMonthlyDocumentNumber = (prefix, sequence, date = new Date()) => {
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yy = String(date.getFullYear()).slice(-2);
    const sequenceNum = String(sequence).padStart(3, '0');
    return `${prefix}${yy}${mm}-${sequenceNum}`;
};

const getExistingSequence = (documentNumber) => {
    const match = String(documentNumber || '').match(/(?:-|\/)(\d+)$/);
    return match ? Number(match[1]) : 0;
};

export async function insertWithMonthlyDocumentNumber({ mysql, table, prefix, numberColumn = 'ticket_number', buildRow }) {
    let lastError = null;

    for (let attempt = 0; attempt < MAX_DOCUMENT_INSERT_ATTEMPTS; attempt += 1) {
        const { startOfMonth, endOfMonth } = getCurrentMonthBounds();
        const { data, error: selectError } = await mysql
            .from(table)
            .select(numberColumn)
            .gte('created_at', startOfMonth)
            .lte('created_at', endOfMonth);

        if (selectError) throw selectError;

        const existingSequences = (data || []).map((row) => getExistingSequence(row[numberColumn]));
        const nextSequence = Math.max(data?.length || 0, ...existingSequences) + 1 + attempt;
        const generatedTicket = buildMonthlyDocumentNumber(prefix, nextSequence);
        const { data: insertedData, error } = await mysql
            .from(table)
            .insert([buildRow(generatedTicket)])
            .select();

        if (!error) {
            return { data: insertedData, generatedTicket };
        }

        lastError = error;
        if (!isDuplicateDocumentNumberError(error)) {
            throw error;
        }
    }

    throw lastError || new Error('Unable to generate a unique ticket number');
}
