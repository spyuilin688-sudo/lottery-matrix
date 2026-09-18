export function sanitizeReferenceNumber(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 2);
  if (!digits) return "";
  if (digits === "0") return "0";
  const number = Number(digits);
  return number >= 1 && number <= 49 ? digits : "";
}

export function formatReferenceNumber(value: string): string {
  const sanitized = sanitizeReferenceNumber(value);
  if (sanitized === "0") return "";
  return sanitized.length === 1 ? sanitized.padStart(2, "0") : sanitized;
}
