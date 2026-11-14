/**
 * Workout-Template-Generierung über das Backend (Mistral → Gemini).
 */

import { api } from '@/src/lib/api';
import type { Exercise, SetDetail } from '../types';

export interface AIWorkoutRequest {
  equipment: string[];
  duration: number;
  type: 'Strength' | 'Cardio' | 'Hybrid';
  specialRequests?: string;
}

export interface AIWorkoutResult {
  name: string;
  type: 'Strength' | 'Cardio' | 'Hybrid';
  exercises: Exercise[];
  description?: string;
}

export async function generateWorkoutTemplate(request: AIWorkoutRequest): Promise<AIWorkoutResult> {
  const raw = await api<{
    name: string;
    type: string;
    description?: string;
    exercises: unknown[];
  }>('/api/ai/generate-workout-template', {
    method: 'POST',
    body: JSON.stringify({
      equipment: request.equipment,
      duration: request.duration,
      type: request.type,
      specialRequests: request.specialRequests,
    }),
  });

  const t =
    raw.type === 'Cardio' || raw.type === 'Hybrid' || raw.type === 'Strength'
      ? raw.type
      : request.type;

  return {
    name: raw.name || 'AI Generated Workout',
    type: t,
    description: raw.description,
    exercises: (raw.exercises || []).map((ex: any) => ({
      name: ex.name,
      notes: ex.notes,
      supersetGroup: ex.supersetGroup,
      sets: Array.isArray(ex.sets)
        ? ex.sets.map((s: any): SetDetail => ({
            reps: Number(s.reps) || 0,
            weight: Number(s.weight) || 0,
            completed: false,
            type: ['warmup', 'normal', 'dropset', 'failure'].includes(s.type) ? s.type : 'normal',
          }))
        : ([] as SetDetail[]),
    })) as Exercise[],
  };
}
