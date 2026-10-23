import { api } from '@/src/lib/api';
import type { Food } from '@/src/lib/foodDatabase';
import type { CustomFoodDraft } from '@/src/types';

export async function saveAppCustomFood(draft: CustomFoodDraft): Promise<Food> {
  const data = await api<{ food: Food }>('/api/foods/app-custom', {
    method: 'POST',
    body: JSON.stringify({ draft }),
  });
  return data.food;
}
