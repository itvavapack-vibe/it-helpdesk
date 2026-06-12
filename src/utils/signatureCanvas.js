export const loadSignatureIntoCanvas = (signatureRef, signature, delay = 50) => {
    window.setTimeout(() => {
        const signaturePad = signatureRef.current;
        if (!signaturePad) return;

        signaturePad.clear();
        if (!signature) return;

        const canvas = signaturePad.getCanvas?.();
        if (!canvas) {
            signaturePad.fromDataURL(signature);
            return;
        }

        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        const targetWidth = canvas.offsetWidth || canvas.width / ratio;
        const targetHeight = canvas.offsetHeight || canvas.height / ratio;

        if (!targetWidth || !targetHeight) {
            signaturePad.fromDataURL(signature);
            return;
        }

        const image = new Image();
        image.onload = () => {
            const sourceWidth = image.naturalWidth || image.width;
            const sourceHeight = image.naturalHeight || image.height;
            if (!sourceWidth || !sourceHeight) {
                signaturePad.fromDataURL(signature);
                return;
            }

            const padding = Math.min(12, targetWidth * 0.04, targetHeight * 0.12);
            const availableWidth = Math.max(targetWidth - padding * 2, 1);
            const availableHeight = Math.max(targetHeight - padding * 2, 1);
            const scale = Math.min(availableWidth / sourceWidth, availableHeight / sourceHeight);
            const drawWidth = sourceWidth * scale;
            const drawHeight = sourceHeight * scale;
            const drawX = (targetWidth - drawWidth) / 2;
            const drawY = (targetHeight - drawHeight) / 2;

            const normalizedCanvas = document.createElement('canvas');
            normalizedCanvas.width = targetWidth;
            normalizedCanvas.height = targetHeight;
            const context = normalizedCanvas.getContext('2d');
            context.clearRect(0, 0, targetWidth, targetHeight);
            context.drawImage(image, drawX, drawY, drawWidth, drawHeight);

            signaturePad.fromDataURL(normalizedCanvas.toDataURL('image/png'), {
                ratio: 1,
                width: targetWidth,
                height: targetHeight,
            });
        };
        image.onerror = () => signaturePad.fromDataURL(signature);
        image.src = signature;
    }, delay);
};
