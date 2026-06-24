const MAX_DOCUMENT_INSERT_ATTEMPTS = 5;

const isDuplicateDocumentNumberError = (error) => {
    const message = String(error?.message || error || '').toLowerCase();
    return message.includes('duplicate');
};

const asError = (error) => {
    if (error instanceof Error) return error;
    return new Error(String(error || 'Unknown error'));
};

export const buildMonthlyDocumentPrefix = (prefix, date = new Date()) => {
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yy = String(date.getFullYear()).slice(-2);
    return `${prefix}${yy}${mm}-`;
};

export const buildMonthlyDocumentNumber = (prefix, sequence, date = new Date()) => {
    const sequenceNum = String(sequence).padStart(3, '0');
    return `${buildMonthlyDocumentPrefix(prefix, date)}${sequenceNum}`;
};

const getExistingSequence = (documentNumber) => {
    const match = String(documentNumber || '').match(/(?:-|\/)(\d+)$/);
    return match ? Number(match[1]) : 0;
};

export async function insertWithMonthlyDocumentNumber({ mysql, table, prefix, numberColumn = 'ticket_number', buildRow }) {
    let lastError = null;
    const documentDate = new Date();
    const documentPrefix = buildMonthlyDocumentPrefix(prefix, documentDate);

    for (let attempt = 0; attempt < MAX_DOCUMENT_INSERT_ATTEMPTS; attempt += 1) {
        const { data, error: selectError } = await mysql
            .from(table)
            .select(numberColumn);

        if (selectError) throw asError(selectError);

        const existingSequences = (data || [])
            .map((row) => row[numberColumn])
            .filter((documentNumber) => String(documentNumber || '').startsWith(documentPrefix))
            .map(getExistingSequence);
        const nextSequence = Math.max(0, ...existingSequences) + 1 + attempt;
        const generatedTicket = buildMonthlyDocumentNumber(prefix, nextSequence, documentDate);
        const { data: insertedData, error } = await mysql
            .from(table)
            .insert([buildRow(generatedTicket)])
            .select();

        if (!error) {
            return { data: insertedData, generatedTicket };
        }

        lastError = error;
        if (!isDuplicateDocumentNumberError(error)) {
            throw asError(error);
        }
    }

    throw asError(lastError || 'Unable to generate a unique ticket number');
}
