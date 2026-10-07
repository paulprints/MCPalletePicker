/// <reference lib="webworker" />
/**
 * Decodes the texture atlas PNG to raw RGBA off the main thread, so the page
 * never has to hold or draw from the 2048-pixel bitmap itself.
 */
self.onmessage = async (e: MessageEvent<Blob>) => {
  try {
    const bitmap = await createImageBitmap(e.data)
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('OffscreenCanvas 2D is not available in workers')
    ctx.drawImage(bitmap, 0, 0)
    const { data, width, height } = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
    bitmap.close()
    ;(self as unknown as Worker).postMessage({ ok: true, width, height, data }, [data.buffer])
  } catch (err) {
    ;(self as unknown as Worker).postMessage({ ok: false, error: (err as Error).message })
  }
}
