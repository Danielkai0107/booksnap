"use client";

import BottomSheet from "@/components/BottomSheet";
import type { OrgStatus } from "@/lib/supabase/types";
import type { TrialState } from "@/lib/billing/lock";

export type OrgMenuActionId =
  | "approve"
  | "reactivate"
  | "reject"
  | "edit"
  | "grant"
  | "extend"
  | "resetTrial"
  | "endTrial"
  | "cancel"
  | "bypass"
  | "reset"
  | "suspend"
  | "delete"
  // 「快速狀態切換」一組：不檢查當前狀態、總是可用，常見的測試／支援情境用。
  | "forceFresh"
  | "forcePro"
  | "forceExpired";

export type OrgMenuAction = {
  id: OrgMenuActionId;
  label: string;
  description?: string;
  tone?: "default" | "primary" | "danger";
};

export type OrgMenuSection = {
  title?: string;
  items: OrgMenuAction[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  orgName: string;
  status: OrgStatus;
  onSelect: (id: OrgMenuActionId) => void;
  sections: OrgMenuSection[];
  dangerSection?: OrgMenuSection;
};

function statusSubtitle(status: OrgStatus): string {
  return status === "pending"
    ? "待審核"
    : status === "approved"
      ? "已通過"
      : status === "rejected"
        ? "已退回"
        : "已停用";
}

export default function OrgActionsMenuSheet({
  open,
  onClose,
  orgName,
  status,
  onSelect,
  sections,
  dangerSection,
}: Props) {
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={`管理「${orgName}」`}
      subtitle={statusSubtitle(status)}
    >
      <div className="space-y-5 pb-1">
        {sections.map((section, i) => (
          <MenuSectionBlock
            key={section.title ?? `section-${i}`}
            section={section}
            onSelect={onSelect}
          />
        ))}
        {dangerSection && dangerSection.items.length > 0 && (
          <div>
            <p className="text-xs font-medium text-red-500 mb-2 px-0.5">
              {dangerSection.title ?? "危險操作"}
            </p>
            <ul className="rounded-xl border border-red-200 overflow-hidden divide-y divide-red-100 bg-red-50/40">
              {dangerSection.items.map((item) => (
                <li key={item.id}>
                  <MenuActionRow item={item} onSelect={onSelect} danger />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

function MenuSectionBlock({
  section,
  onSelect,
}: {
  section: OrgMenuSection;
  onSelect: (id: OrgMenuActionId) => void;
}) {
  if (section.items.length === 0) return null;
  return (
    <div>
      {section.title && (
        <p className="text-xs font-medium text-neutral-400 mb-2 px-0.5">
          {section.title}
        </p>
      )}
      <ul className="rounded-xl border border-neutral-200 overflow-hidden divide-y divide-neutral-100 bg-white">
        {section.items.map((item) => (
          <li key={item.id}>
            <MenuActionRow item={item} onSelect={onSelect} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function MenuActionRow({
  item,
  onSelect,
  danger = false,
}: {
  item: OrgMenuAction;
  onSelect: (id: OrgMenuActionId) => void;
  danger?: boolean;
}) {
  const labelClass = danger
    ? "text-red-600"
    : item.tone === "primary"
      ? "text-neutral-900"
      : "text-neutral-900";

  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-neutral-50 active:bg-neutral-100 transition press-feedback"
    >
      <span className="flex-1 min-w-0">
        <span className={`block text-sm font-medium ${labelClass}`}>
          {item.label}
        </span>
        {item.description && (
          <span className="block text-xs text-neutral-500 mt-0.5 leading-snug">
            {item.description}
          </span>
        )}
      </span>
      <ChevronIcon className={danger ? "text-red-400" : "text-neutral-300"} />
    </button>
  );
}

function ChevronIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

/** Build menu sections from org state (shared by list + detail). */
export function buildOrgMenuSections(input: {
  status: OrgStatus;
  trialState: TrialState;
  plan: "trial" | "pro";
  bypassQuota: boolean;
}): { sections: OrgMenuSection[]; dangerSection: OrgMenuSection } {
  const { status, trialState, plan, bypassQuota } = input;
  const isPaid =
    trialState === "paid" || trialState === "cancelled_in_period";
  const isTrial = plan === "trial";

  const sections: OrgMenuSection[] = [];
  const dangerItems: OrgMenuAction[] = [];

  if (status === "pending") {
    sections.push({
      title: "審核",
      items: [
        {
          id: "approve",
          label: "核准申請",
          description: "通過後單位可登入並開始使用",
          tone: "primary",
        },
        {
          id: "reject",
          label: "退回申請",
          description: "需填寫退回原因",
          tone: "danger",
        },
      ],
    });
  }

  if (status === "approved") {
    sections.push({
      title: "單位資料",
      items: [
        {
          id: "edit",
          label: "編輯單位資料",
          description: "名稱、縣市、聯絡方式",
        },
        {
          id: "reset",
          label: "重設密碼",
          description: "產生新密碼供轉告單位",
        },
      ],
    });

    const billingItems: OrgMenuAction[] = [];
    if (isTrial && !isPaid) {
      billingItems.push({
        id: "grant",
        label: "啟用付費",
        description: "手動開通 Pro，免走金流",
        tone: "primary",
      });
    }
    if (isTrial) {
      billingItems.push(
        {
          id: "extend",
          label: "延長體驗",
          description: "延後體驗到期日",
        },
        {
          id: "resetTrial",
          label: "重置體驗期",
          description: "重新計算體驗天數",
        },
      );
      if (trialState === "active_trial") {
        billingItems.push({
          id: "endTrial",
          label: "立即結束體驗",
          description: "體驗將立刻到期",
          tone: "danger",
        });
      }
    }
    if (isPaid) {
      billingItems.push({
        id: "cancel",
        label: "取消付費",
        description: "本期結束後不再續訂",
      });
    }
    if (billingItems.length > 0) {
      sections.push({ title: "方案與體驗", items: billingItems });
    }

    sections.push({
      title: "權限",
      items: [
        {
          id: "bypass",
          label: bypassQuota ? "取消免鎖" : "設為免鎖",
          description: bypassQuota
            ? "恢復一般鎖定規則"
            : "不受體驗／付費狀態限制",
        },
      ],
    });

    // 一組「總是可用」的狀態快捷鍵，不檢查當前狀態。給測試／QA／支援情境用：
    // 不必走「先取消 → 再重置 → 再啟用」的多步驟流程，一鍵直達目標狀態。
    // 對應 actions.ts 的 forceOrgState()。
    sections.push({
      title: "快速狀態切換（測試／支援用）",
      items: [
        {
          id: "forceFresh",
          label: "重置為剛核准的體驗",
          description: "刪除訂閱、體驗截止 = 今天 + 預設體驗天數",
        },
        {
          id: "forcePro",
          label: "強制變成 Pro",
          description: "若已 Pro 會重新啟用一次（本期 OCR 用量歸零）",
          tone: "primary",
        },
        {
          id: "forceExpired",
          label: "強制變成體驗已結束",
          description: "刪除訂閱、體驗截止 = 現在；下一次請求即被鎖",
          tone: "danger",
        },
      ],
    });

    sections.push({
      title: "狀態",
      items: [
        {
          id: "suspend",
          label: "停用單位",
          description: "單位無法登入，資料保留",
          tone: "danger",
        },
      ],
    });
  }

  if (status === "rejected" || status === "suspended") {
    sections.push({
      items: [
        {
          id: "reactivate",
          label: "重新啟用",
          description: "恢復單位登入與使用",
          tone: "primary",
        },
      ],
    });
  }

  dangerItems.push({
    id: "delete",
    label: "註銷單位",
    description: "永久刪除單位與所有資料，無法復原",
    tone: "danger",
  });

  return {
    sections,
    dangerSection: { title: "危險操作", items: dangerItems },
  };
}
