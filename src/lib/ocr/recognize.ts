// Browser OCR wiring (DESIGN.md §7.9). tesseract.js is loaded lazily so the
// engine (~200 KB js + 2.9 MB wasm + 2.9 MB language data, all self-hosted
// under /ocr/, no CDN) costs nothing until a screenshot import is actually
// used; the service worker runtime-caches it after first use so OCR works
// offline. The image itself never leaves the device.

export async function ocrImage(
  image: Blob,
  onProgress?: (fraction: number) => void
): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng', 1, {
    workerPath: '/ocr/worker.min.js',
    corePath: '/ocr/tesseract-core-simd-lstm.js',
    langPath: '/ocr/lang',
    workerBlobURL: false,
    logger: (m) => {
      if (m.status === 'recognizing text') onProgress?.(m.progress);
    }
  });
  try {
    const { data } = await worker.recognize(image);
    return data.text;
  } finally {
    await worker.terminate();
  }
}
