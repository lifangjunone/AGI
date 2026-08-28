export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} b`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kb`
  return `${(bytes / (1024 * 1024)).toFixed(1)} mb`
}

export function formatTime(timestamp: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(timestamp))
}
