// Klien kontak darurat — A-4: penerima WA SOS bersama HP leader +
// bystander. Endpoint /auth/me/emergency-contacts (31 Okt 2026).
import { apiRequest } from "./api-client";
import { normalizePhone } from "./auth-validation";

export interface EmergencyContact {
  id: string;
  userId: string;
  name: string;
  phone: string;
}

export async function fetchEmergencyContacts(): Promise<EmergencyContact[]> {
  const data = await apiRequest<{ contacts: EmergencyContact[] }>(
    "/auth/me/emergency-contacts",
  );
  return data.contacts;
}

export async function createEmergencyContact(
  name: string,
  phone: string,
): Promise<EmergencyContact> {
  const data = await apiRequest<{ contact: EmergencyContact }>(
    "/auth/me/emergency-contacts",
    { method: "POST", body: { name, phone: normalizePhone(phone) } },
  );
  return data.contact;
}

export async function deleteEmergencyContact(id: string): Promise<void> {
  await apiRequest(`/auth/me/emergency-contacts/${id}`, { method: "DELETE" });
}
