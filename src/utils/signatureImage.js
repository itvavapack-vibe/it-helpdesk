const MAX_ANALYSIS_SIZE = 1600;
const trimCache = new Map();

const isSignaturePixel = (red, green, blue, alpha) => {
    if (alpha < 16) return false;
    return Math.max(255 - red, 255 - green, 255 - blue) > 12;
};

export const getSignatureContentBounds = (image) => {
    const naturalWidth = image?.naturalWidth || image?.width || 0;
    const naturalHeight = image?.naturalHeight || image?.height || 0;
    if (!naturalWidth || !naturalHeight) return null;

    const analysisScale = Math.min(1, MAX_ANALYSIS_SIZE / Math.max(naturalWidth, naturalHeight));
    const analysisWidth = Math.max(1, Math.round(naturalWidth * analysisScale));
    const analysisHeight = Math.max(1, Math.round(naturalHeight * analysisScale));
    const canvas = document.createElement('canvas');
    canvas.width = analysisWidth;
    canvas.height = analysisHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;

    context.clearRect(0, 0, analysisWidth, analysisHeight);
    context.drawImage(image, 0, 0, analysisWidth, analysisHeight);

    let pixels;
    try {
        pixels = context.getImageData(0, 0, analysisWidth, analysisHeight).data;
    } catch {
        return null;
    }

    let minX = analysisWidth;
    let minY = analysisHeight;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < analysisHeight; y += 1) {
        for (let x = 0; x < analysisWidth; x += 1) {
            const index = (y * analysisWidth + x) * 4;
            if (!isSignaturePixel(pixels[index], pixels[index + 1], pixels[index + 2], pixels[index + 3])) continue;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
        }
    }

    if (maxX < minX || maxY < minY) return null;

    const contentWidth = maxX - minX + 1;
    const contentHeight = maxY - minY + 1;
    const paddingX = Math.max(4, Math.round(contentWidth * 0.08));
    const paddingY = Math.max(4, Math.round(contentHeight * 0.12));
    const left = Math.max(0, minX - paddingX);
    const top = Math.max(0, minY - paddingY);
    const right = Math.min(analysisWidth, maxX + paddingX + 1);
    const bottom = Math.min(analysisHeight, maxY + paddingY + 1);

    return {
        x: Math.floor(left / analysisScale),
        y: Math.floor(top / analysisScale),
        width: Math.min(naturalWidth, Math.ceil((right - left) / analysisScale)),
        height: Math.min(naturalHeight, Math.ceil((bottom - top) / analysisScale)),
    };
};

export const trimSignatureImage = (source) => {
    if (!source) return Promise.resolve('');
    if (trimCache.has(source)) return trimCache.get(source);

    const promise = new Promise((resolve) => {
        const image = new Image();
        image.onload = () => {
            const bounds = getSignatureContentBounds(image);
            if (!bounds) {
                resolve(source);
                return;
            }

            const canvas = document.createElement('canvas');
            canvas.width = bounds.width;
            canvas.height = bounds.height;
            const context = canvas.getContext('2d');
            if (!context) {
                resolve(source);
                return;
            }

            context.drawImage(
                image,
                bounds.x,
                bounds.y,
                bounds.width,
                bounds.height,
                0,
                0,
                bounds.width,
                bounds.height
            );
            resolve(canvas.toDataURL('image/png'));
        };
        image.onerror = () => resolve(source);
        image.src = source;
    });

    trimCache.set(source, promise);
    if (trimCache.size > 50) {
        trimCache.delete(trimCache.keys().next().value);
    }
    return promise;
};
