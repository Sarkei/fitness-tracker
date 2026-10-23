import { api } from '@/src/lib/api';
import type { Food } from '@/src/lib/foodDatabase';

export async function fetchFoodByBarcode(barcode: string): Promise<Food> {
  const code = barcode.replace(/\D/g, '');
  const data = await api<{ food: Food; source?: string }>(`/api/foods/barcode/${encodeURIComponent(code)}`);
  return data.food;
}

export async function searchOpenFoodFacts(query: string, pageSize?: number): Promise<Food[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const params = new URLSearchParams({ q });
  if (pageSize != null) params.set('page_size', String(pageSize));
  const data = await api<{ foods: Food[] }>(
    `/api/foods/openfoodfacts/search?${params.toString()}`,
  );
  return data.foods ?? [];
}
