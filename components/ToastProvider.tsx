"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { toUserMessage } from "@/lib/errors/user-message";
import Toast, { type ToastKind } from "./Toast";

type ToastApi = {
  show: (message: string, kind?: ToastKind) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

/**
 * 全站共用 toast 入口。任何 client component 透過 useToast() 即可推訊息，
 * 不必各自宣告 state / 渲染 <Toast />。同一時間只顯示一則（新訊息覆蓋舊的）。
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [kind, setKind] = useState<ToastKind>("success");
  // 強制重置 Toast 內部計時器 → 連續 show 同一訊息也會重新計時 3s
  const [seq, setSeq] = useState(0);
  // 記錄當前訊息，避免相同訊息 0 ms 內重複觸發造成閃爍
  const lastRef = useRef<{ message: string; ts: number }>({
    message: "",
    ts: 0,
  });

  const show = useCallback((nextMessage: string, nextKind: ToastKind = "info") => {
    if (!nextMessage) return;
    const now = Date.now();
    if (
      lastRef.current.message === nextMessage &&
      now - lastRef.current.ts < 400
    ) {
      return;
    }
    lastRef.current = { message: nextMessage, ts: now };
    setMessage(nextMessage);
    setKind(nextKind);
    setSeq((n) => n + 1);
    setOpen(true);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (m) => show(m, "success"),
      error: (m) => show(toUserMessage(m), "error"),
      info: (m) => show(m, "info"),
    }),
    [show]
  );

  const toastNode = (
    <Toast
      key={seq}
      open={open}
      message={message}
      kind={kind}
      onClose={() => setOpen(false)}
    />
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {typeof document !== "undefined"
        ? createPortal(toastNode, document.body)
        : toastNode}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast 必須在 <ToastProvider> 內使用");
  }
  return ctx;
}
