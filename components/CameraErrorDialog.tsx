"use client";

type Props = {
  onRetry: () => void;
  onClose: () => void;
  closeLabel?: string;
  retryLabel?: string;
};

/**
 * 相機初始化失敗時顯示的對話框。
 *
 * 不向使用者展示底層錯誤字串（NotAllowedError、autoplay rejection、
 * https/權限細節等），那些對非技術使用者只會讓人焦慮。
 * 改為提供「重新請求」按鈕：在多數情境（誤觸關閉權限、暫時被佔用、
 * 切換 tab 後 stream 中斷），重新跑一次 getUserMedia 就能解決。
 *
 * 詳細錯誤仍由呼叫端 console.error 給開發者排查。
 */
export default function CameraErrorDialog({
  onRetry,
  onClose,
  closeLabel = "回首頁",
  retryLabel = "重新請求",
}: Props) {
  return (
    <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm flex items-center justify-center px-6">
      <div className="bg-white text-neutral-900 max-w-sm w-full rounded-2xl p-6 shadow-2xl text-center">
        <div className="w-12 h-12 rounded-full bg-neutral-100 mx-auto mb-4 flex items-center justify-center text-neutral-500"></div>
        <p className="text-base font-medium text-neutral-900 mb-1.5">
          需要使用相機
        </p>
        <p className="text-sm text-neutral-500 mb-6 leading-relaxed">
          請允許瀏覽器存取相機後再試一次
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-white border border-neutral-200 hover:border-neutral-400 text-neutral-900 text-sm font-medium py-3 rounded-lg transition"
          >
            {closeLabel}
          </button>
          <button
            type="button"
            onClick={onRetry}
            className="flex-1 bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium py-3 rounded-lg transition"
          >
            {retryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
