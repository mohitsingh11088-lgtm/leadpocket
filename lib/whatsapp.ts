export const DEFAULT_WHATSAPP_MESSAGE =
  "Hi {name}, I would like to know more about {company}.";

export function normalizeInternationalPhoneNumber(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("+")) {
    return null;
  }

  const digits = trimmed.slice(1).replace(/[\s().-]/g, "");
  if (!/^[1-9]\d{7,14}$/.test(digits)) {
    return null;
  }

  return `+${digits}`;
}

export function personalizeWhatsAppMessage(
  template: string,
  values: { name?: string; company?: string }
): string {
  return template
    .replaceAll("{name}", values.name?.trim() ?? "")
    .replaceAll("{company}", values.company?.trim() ?? "")
    .trim();
}

export function createWhatsAppUrl(
  phoneNumber: string,
  message: string
): string | null {
  const normalizedPhone = normalizeInternationalPhoneNumber(phoneNumber);
  if (!normalizedPhone) {
    return null;
  }

  const digits = normalizedPhone.slice(1);
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
