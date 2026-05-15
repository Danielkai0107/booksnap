export function formatDateYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

export function generateBookId(date: Date, index: number): string {
  const ymd = formatDateYMD(date);
  const seq = String(index).padStart(3, "0");
  return `LIB-${ymd}-${seq}`;
}
