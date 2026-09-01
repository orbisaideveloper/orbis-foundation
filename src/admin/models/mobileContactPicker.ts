export type MobileContact = {
  name: string;
  phone: string;
};

type ContactsManager = {
  select: (properties: string[], options?: { multiple?: boolean }) => Promise<
    Array<{ name?: string[]; tel?: string[] }>
  >;
};

export function supportsMobileContactPicker() {
  return typeof navigator !== "undefined" && "contacts" in navigator;
}

export async function pickMobileContact(): Promise<MobileContact | null> {
  if (!supportsMobileContactPicker()) return null;
  const contacts = (navigator as Navigator & { contacts: ContactsManager }).contacts;
  const [contact] = await contacts.select(["name", "tel"], { multiple: false });
  const name = contact?.name?.[0]?.trim() || "";
  const phone = contact?.tel?.[0]?.trim() || "";
  return name || phone ? { name, phone } : null;
}
