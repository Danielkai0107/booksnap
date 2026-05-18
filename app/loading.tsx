export default function Loading() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-white">
      {/* w-9 h-9 是整站 fullscreen loader 的標準尺寸，CheckinEntryClient / */}
      {/* AdminShell / 入庫相機 loading 都用同一個，避免換頁時尺寸跳動。 */}
      <div className="w-9 h-9 border-2 border-neutral-200 border-t-neutral-900 rounded-full animate-spin" />
    </main>
  );
}
