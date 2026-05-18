/**
 * 全站 overlay 層級。Toast 必須高於 BottomSheet／Modal，否則彈窗內操作
 * 的 success/error 會被擋住。
 */
export const Z_INDEX = {
  mobileNav: 50,
  shellLoading: 60,
  toast: 110,
  bottomSheet: 100,
  zoomOverlay: 100,
} as const;
