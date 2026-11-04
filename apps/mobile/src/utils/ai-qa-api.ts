// Klien AI-Q — kontrak API POST/GET /trip-groups/:id/qa.
// answer null + notFound true = jawaban tidak ada di data trip
// (klien merender t("aiQ.notFound"), bukan teks karangan).
// model non-null = jawaban dari AI -> tampilkan atribusi.
import { apiRequest } from "./api-client";

export interface TripQaLink {
  label: string;
  url: string;
}

export interface TripQa {
  id: string;
  tripId: string;
  userId: string;
  question: string;
  answer: string | null;
  notFound: boolean;
  sources: string[];
  model: string | null;
  links: TripQaLink[];
  createdAt: string;
}

// Baris lama bisa mengembalikan links null — normalisasi ke [] agar
// layar QA tidak perlu cabang null.
function normalizeLinks(qa: TripQa): TripQa {
  const links = Array.isArray(qa.links)
    ? qa.links.filter(
        (l) => typeof l?.label === "string" && typeof l?.url === "string",
      )
    : [];
  return { ...qa, links };
}

export async function fetchTripQa(tripId: string): Promise<TripQa[]> {
  const data = await apiRequest<{ qa: TripQa[] }>(`/trip-groups/${tripId}/qa`);
  return data.qa.map(normalizeLinks);
}

export async function askTripQuestion(
  tripId: string,
  question: string,
): Promise<TripQa> {
  const data = await apiRequest<{ qa: TripQa }>(`/trip-groups/${tripId}/qa`, {
    method: "POST",
    body: { question },
  });
  return normalizeLinks(data.qa);
}
