export const loadSignatureIntoCanvas = (signatureRef, signature, delay = 50) => {
    window.setTimeout(() => {
        const canvas = signatureRef.current;
        if (!canvas) return;

        canvas.clear();
        if (signature) canvas.fromDataURL(signature);
    }, delay);
};
