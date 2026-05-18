"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastProvider";
import OrgActionsMenuSheet, {
  buildOrgMenuSections,
  type OrgMenuActionId,
} from "@/components/super-admin/OrgActionsMenuSheet";
import {
  suspendOrganization,
  reactivateOrganization,
  resetOrganizationPassword,
  updateOrganization,
  grantPaidSubscription,
  cancelOrganizationSubscription,
  extendOrganizationTrial,
  endOrganizationTrial,
  resetOrganizationTrial,
  deleteOrganization,
  forceOrgState,
} from "../../actions";
import type { OrgPlan, OrgStatus } from "@/lib/supabase/types";
import type { TrialState } from "@/lib/billing/lock";

type Props = {
  orgId: string;
  orgName: string;
  status: OrgStatus;
  plan: OrgPlan;
  trialState: TrialState;
  trialEndsAt: string | null;
  city: string;
  contactEmail: string;
  contactPhone: string;
  /** compact：列表列用；expanded：詳情頁全寬按鈕 */
  variant?: "compact" | "expanded";
};

type DialogKind = Exclude<OrgMenuActionId, "reactivate"> | null;
type ConfirmKind = "reactivate" | null;

const CITIES = [
  "台北市",
  "新北市",
  "桃園市",
  "台中市",
  "台南市",
  "高雄市",
  "基隆市",
  "新竹市",
  "嘉義市",
  "新竹縣",
  "苗栗縣",
  "彰化縣",
  "南投縣",
  "雲林縣",
  "嘉義縣",
  "屏東縣",
  "宜蘭縣",
  "花蓮縣",
  "台東縣",
  "澎湖縣",
  "金門縣",
  "連江縣",
];

export default function OrgRowActions({
  orgId,
  orgName,
  status,
  plan,
  trialState,
  trialEndsAt,
  city,
  contactEmail,
  contactPhone,
  variant = "compact",
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [confirm, setConfirm] = useState<ConfirmKind>(null);
  const toast = useToast();

  const { sections, dangerSection } = useMemo(
    () =>
      buildOrgMenuSections({
        status,
        trialState,
        plan,
      }),
    [status, trialState, plan],
  );

  function openMenu() {
    if (pending) return;
    setMenuOpen(true);
  }

  function handleMenuSelect(id: OrgMenuActionId) {
    setMenuOpen(false);
    if (id === "reactivate") {
      setConfirm(id);
      return;
    }
    setDialog(id);
  }

  function closeConfirm() {
    setConfirm(null);
    router.refresh();
  }

  // 關閉 dialog 並強制 client 重新拉伺服器 tree。Server action 雖然有
  // revalidatePath，但仍偶有 client tree 沒即時更新的情況（看到舊的體驗狀態、
  // 「結束體驗」按鈕沒出現），這裡明確 refresh 一次保險。
  function close() {
    setDialog(null);
    router.refresh();
  }

  function reportError(e: unknown) {
    console.error("[super-admin] org action failed", e);
    toast.error(e instanceof Error ? e.message : String(e));
  }

  function confirmReactivate() {
    startTransition(async () => {
      try {
        await reactivateOrganization(orgId);
        setConfirm(null);
        router.refresh();
      } catch (e) {
        reportError(e);
      }
    });
  }

  return (
    <>
      {variant === "expanded" ? (
        <button
          type="button"
          onClick={openMenu}
          disabled={pending}
          className="w-full flex items-center justify-center gap-2 bg-neutral-900 hover:bg-neutral-800 disabled:bg-neutral-300 text-white text-sm font-medium py-3 rounded-xl transition press-feedback"
        >
          {pending ? "處理中…" : "管理此單位"}
          <MenuDotsIcon />
        </button>
      ) : (
        <button
          type="button"
          onClick={openMenu}
          disabled={pending}
          aria-label={`管理 ${orgName}`}
          className="inline-flex items-center gap-1.5 shrink-0 bg-white border border-neutral-200 hover:border-neutral-400 disabled:opacity-50 text-neutral-900 text-sm font-medium px-3.5 py-2 rounded-lg transition press-feedback"
        >
          {pending ? "…" : "操作"}
          <ChevronDownIcon />
        </button>
      )}

      <OrgActionsMenuSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        orgName={orgName}
        status={status}
        sections={sections}
        dangerSection={dangerSection}
        onSelect={handleMenuSelect}
      />

      {confirm === "reactivate" && (
        <Modal title={`重新啟用「${orgName}」？`} onClose={closeConfirm}>
          <p className="text-sm text-neutral-600 leading-relaxed">
            啟用後單位可再次登入，原有館藏與紀錄將保留。
          </p>
          <div className="mt-5 flex gap-3 justify-end">
            <SecondaryBtn onClick={closeConfirm} disabled={pending}>
              取消
            </SecondaryBtn>
            <PrimaryBtn onClick={confirmReactivate} disabled={pending}>
              {pending ? "處理中…" : "確認啟用"}
            </PrimaryBtn>
          </div>
        </Modal>
      )}

      {dialog === "suspend" && (
        <Modal title={`停用「${orgName}」？`} onClose={close}>
          <SuspendDialog orgId={orgId} onDone={close} onError={reportError} />
        </Modal>
      )}
      {dialog === "reset" && (
        <Modal title={`重設「${orgName}」的密碼`} onClose={close}>
          <ResetDialog orgId={orgId} onDone={close} onError={reportError} />
        </Modal>
      )}
      {dialog === "edit" && (
        <Modal title={`編輯「${orgName}」`} onClose={close}>
          <EditDialog
            orgId={orgId}
            initial={{ name: orgName, city, contactEmail, contactPhone }}
            onDone={close}
            onError={reportError}
          />
        </Modal>
      )}
      {dialog === "grant" && (
        <Modal title={`啟用「${orgName}」的付費`} onClose={close}>
          <GrantDialog orgId={orgId} onDone={close} onError={reportError} />
        </Modal>
      )}
      {dialog === "cancel" && (
        <Modal title={`取消「${orgName}」的付費`} onClose={close}>
          <CancelDialog orgId={orgId} onDone={close} onError={reportError} />
        </Modal>
      )}
      {dialog === "extend" && (
        <Modal title={`延長「${orgName}」的體驗`} onClose={close}>
          <ExtendDialog
            orgId={orgId}
            trialEndsAt={trialEndsAt}
            onDone={close}
            onError={reportError}
          />
        </Modal>
      )}
      {dialog === "endTrial" && (
        <Modal title={`立即結束「${orgName}」的體驗？`} onClose={close}>
          <EndTrialDialog
            orgId={orgId}
            trialEndsAt={trialEndsAt}
            onDone={close}
            onError={reportError}
          />
        </Modal>
      )}
      {dialog === "resetTrial" && (
        <Modal title={`重置「${orgName}」的體驗期？`} onClose={close}>
          <ResetTrialDialog
            orgId={orgId}
            trialEndsAt={trialEndsAt}
            onDone={close}
            onError={reportError}
          />
        </Modal>
      )}
      {dialog === "delete" && (
        <Modal title={`註銷「${orgName}」？`} onClose={close}>
          <DeleteDialog
            orgId={orgId}
            orgName={orgName}
            onDone={close}
            onError={reportError}
          />
        </Modal>
      )}
      {dialog === "forceFresh" && (
        <Modal title={`「${orgName}」→ 剛核准的體驗`} onClose={close}>
          <ForceStateDialog
            orgId={orgId}
            target="fresh_trial"
            onDone={close}
            onError={reportError}
          />
        </Modal>
      )}
      {dialog === "forcePro" && (
        <Modal title={`「${orgName}」→ Pro`} onClose={close}>
          <ForceStateDialog
            orgId={orgId}
            target="pro"
            onDone={close}
            onError={reportError}
          />
        </Modal>
      )}
      {dialog === "forceExpired" && (
        <Modal title={`「${orgName}」→ 體驗已結束`} onClose={close}>
          <ForceStateDialog
            orgId={orgId}
            target="expired_trial"
            onDone={close}
            onError={reportError}
          />
        </Modal>
      )}
    </>
  );
}

function ForceStateDialog({
  orgId,
  target,
  onDone,
  onError,
}: {
  orgId: string;
  target: "fresh_trial" | "pro" | "expired_trial";
  onDone: () => void;
  onError: (m: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const copy = FORCE_COPY[target];
  return (
    <>
      <p className="text-sm text-neutral-600 leading-relaxed">{copy.intro}</p>
      <ul className="mt-2 text-xs text-neutral-600 leading-relaxed space-y-0.5 list-disc list-inside">
        {copy.bullets.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>
      <div className="mt-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-100 text-xs text-amber-800 leading-relaxed">
        ⚠ 不檢查當前狀態，會直接清掉舊訂閱列。常用於測試／QA／客服救援，
        正式扣款請改用「啟用付費」「取消付費」走真實金流路徑。
      </div>
      <div className="mt-5 flex gap-2 justify-end">
        <SecondaryBtn onClick={onDone} disabled={pending}>
          取消
        </SecondaryBtn>
        {target === "expired_trial" ? (
          <DangerBtn
            onClick={() => {
              startTransition(async () => {
                const res = await forceOrgState(orgId, target);
                if (res.ok) onDone();
                else onError(res.error);
              });
            }}
            disabled={pending}
          >
            {pending ? "切換中…" : copy.cta}
          </DangerBtn>
        ) : (
          <PrimaryBtn
            onClick={() => {
              startTransition(async () => {
                const res = await forceOrgState(orgId, target);
                if (res.ok) onDone();
                else onError(res.error);
              });
            }}
            disabled={pending}
          >
            {pending ? "切換中…" : copy.cta}
          </PrimaryBtn>
        )}
      </div>
    </>
  );
}

const FORCE_COPY = {
  fresh_trial: {
    intro: "把單位推回「剛核准」的乾淨狀態：",
    bullets: [
      "刪除目前的訂閱列（付款歷史保留作為稽核）",
      "方案重設為 trial",
      "體驗截止 = 今天 + 預設體驗天數（覆寫舊值，不會疊加）",
    ],
    cta: "重置為剛核准",
  },
  pro: {
    intro: "把單位切到「Pro 已訂閱」狀態：",
    bullets: [
      "刪除目前的訂閱列再走 InstantGateway 重新啟用一次",
      "本期起算日 = 現在；AI 智能辨識本期用量自動歸零",
      "走內部金流接口、不會真的扣款，會寫入 audit log",
    ],
    cta: "強制變成 Pro",
  },
  expired_trial: {
    intro: "把單位切到「體驗已結束、未訂閱」狀態：",
    bullets: [
      "刪除目前的訂閱列",
      "體驗截止 = 現在；下一次請求 isOrgLocked 即回 true",
      "新書入庫／公開借閱連結會被擋下，可預覽其他頁",
    ],
    cta: "強制變成已結束",
  },
} as const;

function GrantDialog({
  orgId,
  onDone,
  onError,
}: {
  orgId: string;
  onDone: () => void;
  onError: (m: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <>
      <p className="text-sm text-neutral-600 leading-relaxed">
        將為此單位開啟 Pro 訂閱，走內部金流接口（與一般升級相同路徑），並寫入
        audit log。常用於 demo / 朋友／VIP。
      </p>
      <div className="mt-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-100 text-xs text-amber-800 leading-relaxed">
        ⚠ 此操作會
        <strong>不經過真正金流商扣款</strong>
        ，僅在後台建立訂閱與 payment 紀錄。
      </div>
      <div className="mt-5 flex gap-2 justify-end">
        <SecondaryBtn onClick={onDone} disabled={pending}>
          取消
        </SecondaryBtn>
        <PrimaryBtn
          onClick={() => {
            startTransition(async () => {
              const res = await grantPaidSubscription(orgId);
              if (res.ok) onDone();
              else onError(res.error);
            });
          }}
          disabled={pending}
        >
          {pending ? "處理中…" : "啟用付費"}
        </PrimaryBtn>
      </div>
    </>
  );
}

function CancelDialog({
  orgId,
  onDone,
  onError,
}: {
  orgId: string;
  onDone: () => void;
  onError: (m: string) => void;
}) {
  const [mode, setMode] = useState<"period_end" | "immediate">("period_end");
  const [pending, startTransition] = useTransition();
  return (
    <>
      <p className="text-sm text-neutral-600 leading-relaxed">
        選擇取消方式。到期取消保留使用權至本期結束；立即取消會立刻停權，常用於退款／詐欺處理。
      </p>
      <div className="mt-4 space-y-2">
        <ModeOption
          checked={mode === "period_end"}
          onCheck={() => setMode("period_end")}
          title="到期取消"
          desc="到下次扣款日才停權；使用者仍可繼續操作至到期日。"
        />
        <ModeOption
          checked={mode === "immediate"}
          onCheck={() => setMode("immediate")}
          title="立即取消"
          desc="馬上把訂閱期截斷，effective plan 立即降回體驗狀態。"
        />
      </div>
      <div className="mt-5 flex gap-2 justify-end">
        <SecondaryBtn onClick={onDone} disabled={pending}>
          返回
        </SecondaryBtn>
        <DangerBtn
          onClick={() => {
            startTransition(async () => {
              const res = await cancelOrganizationSubscription(orgId, mode);
              if (res.ok) onDone();
              else onError(res.error);
            });
          }}
          disabled={pending}
        >
          {pending ? "處理中…" : "確認取消"}
        </DangerBtn>
      </div>
    </>
  );
}

function ModeOption({
  checked,
  onCheck,
  title,
  desc,
}: {
  checked: boolean;
  onCheck: () => void;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onCheck}
      className={`w-full text-left px-4 py-3 rounded-xl border transition ${
        checked
          ? "border-neutral-900 bg-neutral-50"
          : "border-neutral-200 hover:border-neutral-400"
      }`}
    >
      <p className="text-sm font-medium text-neutral-900">{title}</p>
      <p className="mt-0.5 text-xs text-neutral-500 leading-relaxed">{desc}</p>
    </button>
  );
}

function ExtendDialog({
  orgId,
  trialEndsAt,
  onDone,
  onError,
}: {
  orgId: string;
  trialEndsAt: string | null;
  onDone: () => void;
  onError: (m: string) => void;
}) {
  const [days, setDays] = useState("7");
  const [pending, startTransition] = useTransition();
  const n = Number(days);
  const valid = Number.isFinite(n) && n > 0 && n <= 365;
  return (
    <>
      <p className="text-sm text-neutral-600 leading-relaxed">
        延長後的新體驗截止日為「
        <strong>max(今天, 目前體驗結束) + N 天</strong>
        」。已過期的體驗會從今天起算，不會回溯補償。
      </p>
      {trialEndsAt && (
        <p className="mt-2 text-xs text-neutral-500">
          目前體驗截止：{new Date(trialEndsAt).toLocaleString("zh-TW")}
        </p>
      )}
      <label className="mt-4 block">
        <span className="text-xs text-neutral-500">延長天數</span>
        <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 h-10">
          <input
            type="number"
            min={1}
            max={365}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className="w-full bg-transparent text-sm tabular-nums outline-none"
          />
          <span className="text-xs text-neutral-500">天</span>
        </div>
      </label>
      <div className="mt-5 flex gap-2 justify-end">
        <SecondaryBtn onClick={onDone} disabled={pending}>
          取消
        </SecondaryBtn>
        <PrimaryBtn
          onClick={() => {
            if (!valid) return;
            startTransition(async () => {
              const res = await extendOrganizationTrial(orgId, n);
              if (res.ok) onDone();
              else onError(res.error);
            });
          }}
          disabled={pending || !valid}
        >
          {pending ? "處理中…" : `延長 ${valid ? n : "?"} 天`}
        </PrimaryBtn>
      </div>
    </>
  );
}

function EndTrialDialog({
  orgId,
  trialEndsAt,
  onDone,
  onError,
}: {
  orgId: string;
  trialEndsAt: string | null;
  onDone: () => void;
  onError: (m: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <>
      <p className="text-sm text-neutral-600 leading-relaxed">
        把體驗截止時間設為「現在」，下一次請求就會被鎖。常用於暫停免費使用、要求對方升級或停用。
      </p>
      {trialEndsAt && (
        <p className="mt-2 text-xs text-neutral-500">
          目前體驗截止：{new Date(trialEndsAt).toLocaleString("zh-TW")}
        </p>
      )}
      <div className="mt-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-100 text-xs text-amber-800 leading-relaxed">
        ⚠ 不會刪除既有資料；單位仍可登入預覽，只是新書入庫／借閱連結會被擋下。
      </div>
      <div className="mt-5 flex gap-2 justify-end">
        <SecondaryBtn onClick={onDone} disabled={pending}>
          取消
        </SecondaryBtn>
        <DangerBtn
          onClick={() => {
            startTransition(async () => {
              const res = await endOrganizationTrial(orgId);
              if (res.ok) onDone();
              else onError(res.error);
            });
          }}
          disabled={pending}
        >
          {pending ? "處理中…" : "立即結束體驗"}
        </DangerBtn>
      </div>
    </>
  );
}

function ResetTrialDialog({
  orgId,
  trialEndsAt,
  onDone,
  onError,
}: {
  orgId: string;
  trialEndsAt: string | null;
  onDone: () => void;
  onError: (m: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <>
      <p className="text-sm text-neutral-600 leading-relaxed">
        把單位回復到「剛核准的乾淨狀態」：
      </p>
      <ul className="mt-2 text-xs text-neutral-600 leading-relaxed space-y-0.5 list-disc list-inside">
        <li>刪除目前訂閱列（付款紀錄會保留作為稽核）</li>
        <li>方案重設為 trial</li>
        <li>體驗截止 = 今天 + 預設體驗天數（覆寫舊值，不會疊加）</li>
      </ul>
      {trialEndsAt && (
        <p className="mt-2 text-xs text-neutral-500">
          目前體驗截止：{new Date(trialEndsAt).toLocaleString("zh-TW")}
        </p>
      )}
      <div className="mt-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-100 text-xs text-amber-800 leading-relaxed">
        預設體驗天數可在「營運設定」調整，此處會即時讀取最新值。
      </div>
      <div className="mt-5 flex gap-2 justify-end">
        <SecondaryBtn onClick={onDone} disabled={pending}>
          取消
        </SecondaryBtn>
        <PrimaryBtn
          onClick={() => {
            startTransition(async () => {
              const res = await resetOrganizationTrial(orgId);
              if (res.ok) onDone();
              else onError(res.error);
            });
          }}
          disabled={pending}
        >
          {pending ? "處理中…" : "重置體驗期"}
        </PrimaryBtn>
      </div>
    </>
  );
}

function DeleteDialog({
  orgId,
  orgName,
  onDone,
  onError,
}: {
  orgId: string;
  orgName: string;
  onDone: () => void;
  onError: (m: string) => void;
}) {
  const [confirm, setConfirm] = useState("");
  const [pending, startTransition] = useTransition();
  const match = confirm.trim() === orgName;
  return (
    <>
      <p className="text-sm text-neutral-700 leading-relaxed">
        將永久刪除此單位及其所有資料：
      </p>
      <ul className="mt-2 text-xs text-neutral-600 leading-relaxed space-y-0.5 list-disc list-inside">
        <li>所有書本、書封圖、借閱紀錄、出借人、分類、書架</li>
        <li>訂閱與付款紀錄、AI 用量紀錄、公開操作紀錄</li>
        <li>該單位的登入帳號（Email 將釋出可重新註冊）</li>
      </ul>
      <div className="mt-3 px-3 py-2 rounded-lg bg-red-50 border border-red-100 text-xs text-red-700 leading-relaxed">
        ⚠ 此操作無法復原。稽核紀錄（audit logs）會保留，但 target_org_id 會變 null。
      </div>
      <label className="mt-4 block">
        <span className="text-xs text-neutral-500">
          請輸入單位名稱「{orgName}」以確認
        </span>
        <input
          type="text"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder={orgName}
          className="mt-1.5 w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:border-red-600 transition"
        />
      </label>
      <div className="mt-5 flex gap-2 justify-end">
        <SecondaryBtn onClick={onDone} disabled={pending}>
          取消
        </SecondaryBtn>
        <DangerBtn
          onClick={() => {
            if (!match) return;
            startTransition(async () => {
              const res = await deleteOrganization(orgId, confirm.trim());
              if (res.ok) onDone();
              else onError(res.error);
            });
          }}
          disabled={pending || !match}
        >
          {pending ? "註銷中…" : "確認註銷"}
        </DangerBtn>
      </div>
    </>
  );
}

function EditDialog({
  orgId,
  initial,
  onDone,
  onError,
}: {
  orgId: string;
  initial: {
    name: string;
    city: string;
    contactEmail: string;
    contactPhone: string;
  };
  onDone: () => void;
  onError: (m: string) => void;
}) {
  const [name, setName] = useState(initial.name);
  const [city, setCity] = useState(initial.city);
  const [contactEmail, setContactEmail] = useState(initial.contactEmail);
  const [contactPhone, setContactPhone] = useState(initial.contactPhone);
  const [localError, setLocalError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty =
    name.trim() !== initial.name ||
    city.trim() !== initial.city ||
    contactEmail.trim().toLowerCase() !== initial.contactEmail.toLowerCase() ||
    contactPhone.trim() !== initial.contactPhone;

  const emailChanged =
    contactEmail.trim().toLowerCase() !== initial.contactEmail.toLowerCase();

  return (
    <>
      <div className="space-y-3">
        <EditField label="單位名稱">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:border-neutral-900 transition"
          />
        </EditField>

        <EditField label="縣市">
          <div className="relative">
            <select
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full appearance-none pl-3 pr-10 py-2 rounded-lg border border-neutral-200 bg-white text-sm text-neutral-900 focus:outline-none focus:border-neutral-900 transition"
            >
              {CITIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400"
              aria-hidden
            >
              <path d="M3 5l3 3 3-3" />
            </svg>
          </div>
        </EditField>

        <EditField label="Email（同時也是登入帳號）">
          <input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:border-neutral-900 transition"
          />
          {emailChanged && (
            <p className="mt-1.5 text-xs text-amber-700">
              變更 Email 會同步更新此單位的登入帳號，記得通知對方。
            </p>
          )}
        </EditField>

        <EditField label="聯絡電話">
          <input
            type="tel"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:border-neutral-900 transition"
          />
        </EditField>
      </div>

      {localError && (
        <div className="mt-4 px-3 py-2 bg-red-50 text-red-700 border border-red-100 rounded-lg text-xs">
          {localError}
        </div>
      )}

      <div className="mt-5 flex gap-2 justify-end">
        <SecondaryBtn onClick={onDone} disabled={pending}>
          取消
        </SecondaryBtn>
        <PrimaryBtn
          onClick={() => {
            setLocalError(null);
            startTransition(async () => {
              const res = await updateOrganization(orgId, {
                name,
                city,
                contactEmail,
                contactPhone,
              });
              if (res.ok) {
                onDone();
              } else {
                setLocalError(res.error);
                onError(res.error);
              }
            });
          }}
          disabled={pending || !dirty}
        >
          {pending ? "儲存中…" : "儲存"}
        </PrimaryBtn>
      </div>
    </>
  );
}

function EditField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-neutral-500 mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

function SuspendDialog({
  orgId,
  onDone,
  onError,
}: {
  orgId: string;
  onDone: () => void;
  onError: (m: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <>
      <p className="text-sm text-neutral-600">
        停用後，該單位的使用者將無法登入；之後可再重新啟用。
      </p>
      <div className="mt-5 flex gap-2 justify-end">
        <SecondaryBtn onClick={onDone} disabled={pending}>
          取消
        </SecondaryBtn>
        <DangerBtn
          onClick={() => {
            startTransition(async () => {
              try {
                await suspendOrganization(orgId);
                onDone();
              } catch (e) {
                onError(e instanceof Error ? e.message : String(e));
              }
            });
          }}
          disabled={pending}
        >
          {pending ? "處理中…" : "確認停用"}
        </DangerBtn>
      </div>
    </>
  );
}

function ResetDialog({
  orgId,
  onDone,
  onError,
}: {
  orgId: string;
  onDone: () => void;
  onError: (m: string) => void;
}) {
  const [pwd, setPwd] = useState("");
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <>
      {!done ? (
        <>
          <p className="text-sm text-neutral-600">
            為此單位設定新的登入密碼，並轉告給單位使用。
          </p>
          <input
            type="text"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            placeholder="新密碼（至少 8 字元）"
            className="mt-4 w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm font-mono focus:outline-none focus:border-neutral-900 transition"
          />
          <div className="mt-5 flex gap-2 justify-end">
            <SecondaryBtn onClick={onDone} disabled={pending}>
              取消
            </SecondaryBtn>
            <PrimaryBtn
              onClick={() => {
                startTransition(async () => {
                  const res = await resetOrganizationPassword(orgId, pwd);
                  if (res.ok) {
                    setDone(true);
                  } else {
                    onError(res.error);
                  }
                });
              }}
              disabled={pending || pwd.length < 8}
            >
              {pending ? "處理中…" : "確認重設"}
            </PrimaryBtn>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-neutral-700">
            已重設。請把新密碼安全地轉告給該單位：
          </p>
          <div className="mt-3 px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 font-mono text-sm break-all">
            {pwd}
          </div>
          <div className="mt-5 flex justify-end">
            <PrimaryBtn onClick={onDone} disabled={false}>
              完成
            </PrimaryBtn>
          </div>
        </>
      )}
    </>
  );
}


function MenuDotsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        aria-label="關閉"
        onClick={onClose}
        className="absolute inset-0 bg-neutral-900/40 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="org-action-modal-title"
        className="relative w-full max-w-md bg-white rounded-2xl border border-neutral-200 shadow-xl p-6 max-h-[min(90vh,640px)] overflow-y-auto"
      >
        <h3
          id="org-action-modal-title"
          className="text-base font-semibold text-neutral-900"
        >
          {title}
        </h3>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}

function PrimaryBtn({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="bg-neutral-900 hover:bg-neutral-800 disabled:bg-neutral-300 text-white text-sm font-medium px-3 py-1.5 rounded-md transition"
    >
      {children}
    </button>
  );
}

function SecondaryBtn({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="bg-white border border-neutral-200 hover:border-neutral-400 disabled:opacity-50 text-neutral-900 text-sm font-medium px-3 py-1.5 rounded-md transition"
    >
      {children}
    </button>
  );
}

function DangerBtn({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white text-sm font-medium px-3 py-1.5 rounded-md transition"
    >
      {children}
    </button>
  );
}
