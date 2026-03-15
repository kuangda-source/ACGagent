export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function toTitleCase(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function compact<T>(values: Array<T | null | undefined | false>): T[] {
  return values.filter(Boolean) as T[];
}

export function todayIsoDate(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatPrice(price?: number | null, currency = "CNY") {
  if (price == null) {
    return "暂无价格";
  }

  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency
  }).format(price);
}
