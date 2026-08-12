const MAX_NAME_LENGTH = 80
const FALLBACK_NAME = '未命名專案'

/** 把專案名稱轉成安全的檔名。 */
export function safeFileName(name: string, extension: string): string {
  const cleaned = name
    .replace(/[/\\:*?"<>|]/g, '_')
    .trim()
    .slice(0, MAX_NAME_LENGTH)
  return `${cleaned || FALLBACK_NAME}.${extension}`
}

/** 觸發瀏覽器下載一個 Blob。 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  // 稍後釋放，讓瀏覽器有時間開始下載
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
