/**
 * Canonical Taiwan city list. Shared between the public registration form and
 * the admin unit settings page so the dropdown and the server-side validation
 * stay perfectly in sync — adding a city in one place was previously easy to
 * forget in the other.
 */
export const TW_CITIES = [
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
] as const;

export type TwCity = (typeof TW_CITIES)[number];

const CITY_SET: ReadonlySet<string> = new Set<string>(TW_CITIES);

export function isTwCity(value: string): value is TwCity {
  return CITY_SET.has(value);
}
