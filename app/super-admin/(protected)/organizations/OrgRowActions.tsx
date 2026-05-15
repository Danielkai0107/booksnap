"use client";

import { useState, useTransition } from "react";
import {
  approveOrganization,
  rejectOrganization,
  suspendOrganization,
  reactivateOrganization,
  resetOrganizationPassword,
  updateOrganization,
} from "../../actions";
import type { OrgStatus } from "@/lib/supabase/types";

type Props = {
  orgId: string;
  orgName: string;
  status: OrgStatus;
  city: string;
  contactEmail: string;
  contactPhone: string;
};

type DialogKind = "reject" | "suspend" | "reset" | "edit" | null;

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
  city,
  contactEmail,
  contactPhone,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setDialog(null);
    setError(null);
  }

  function approve() {
    setError(null);
    startTransition(async () => {
      try {
        await approveOrganization(orgId);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  function reactivate() {
    setError(null);
    startTransition(async () => {
      try {
        await reactivateOrganization(orgId);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  return (
    <div className="flex flex-wrap gap-2 shrink-0">
      {status === "pending" && (
        <>
          <PrimaryBtn onClick={approve} disabled={pending}>
            核准
          </PrimaryBtn>
          <SecondaryBtn onClick={() => setDialog("reject")} disabled={pending}>
            退回
          </SecondaryBtn>
        </>
      )}
      {status === "approved" && (
        <>
          <SecondaryBtn onClick={() => setDialog("edit")} disabled={pending}>
            編輯
          </SecondaryBtn>
          <SecondaryBtn onClick={() => setDialog("reset")} disabled={pending}>
            重設密碼
          </SecondaryBtn>
          <DangerBtn onClick={() => setDialog("suspend")} disabled={pending}>
            停用
          </DangerBtn>
        </>
      )}
      {(status === "rejected" || status === "suspended") && (
        <PrimaryBtn onClick={reactivate} disabled={pending}>
          重新啟用
        </PrimaryBtn>
      )}

      {error && (
        <div className="w-full mt-2 px-3 py-2 bg-red-50 text-red-700 border border-red-100 rounded-lg text-xs">
          {error}
        </div>
      )}

      {dialog === "reject" && (
        <Modal title={`退回「${orgName}」？`} onClose={close}>
          <RejectDialog orgId={orgId} onDone={close} onError={setError} />
        </Modal>
      )}
      {dialog === "suspend" && (
        <Modal title={`停用「${orgName}」？`} onClose={close}>
          <SuspendDialog orgId={orgId} onDone={close} onError={setError} />
        </Modal>
      )}
      {dialog === "reset" && (
        <Modal title={`重設「${orgName}」的密碼`} onClose={close}>
          <ResetDialog orgId={orgId} onDone={close} onError={setError} />
        </Modal>
      )}
      {dialog === "edit" && (
        <Modal title={`編輯「${orgName}」`} onClose={close}>
          <EditDialog
            orgId={orgId}
            initial={{ name: orgName, city, contactEmail, contactPhone }}
            onDone={close}
            onError={setError}
          />
        </Modal>
      )}
    </div>
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

function RejectDialog({
  orgId,
  onDone,
  onError,
}: {
  orgId: string;
  onDone: () => void;
  onError: (m: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <>
      <p className="text-sm text-neutral-600">
        退回後，該單位無法登入；可填寫退回原因供日後查核。
      </p>
      <textarea
        rows={3}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="（選填）"
        className="mt-4 w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:border-neutral-900 transition"
      />
      <div className="mt-5 flex gap-2 justify-end">
        <SecondaryBtn onClick={onDone} disabled={pending}>
          取消
        </SecondaryBtn>
        <DangerBtn
          onClick={() => {
            startTransition(async () => {
              try {
                await rejectOrganization(orgId, reason.trim());
                onDone();
              } catch (e) {
                onError(e instanceof Error ? e.message : String(e));
              }
            });
          }}
          disabled={pending}
        >
          {pending ? "處理中…" : "確認退回"}
        </DangerBtn>
      </div>
    </>
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

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button
        type="button"
        aria-label="關閉"
        onClick={onClose}
        className="absolute inset-0 bg-neutral-900/40"
      />
      <div className="relative w-full max-w-md bg-white rounded-2xl border border-neutral-200 shadow-xl p-6">
        <h3 className="text-base font-semibold text-neutral-900">{title}</h3>
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
