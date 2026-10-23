import { z } from 'zod';

const setDetailSchema = z.object({
  reps: z.union([z.number(), z.string()]).optional(),
  weight: z.union([z.number(), z.string()]).optional(),
  type: z.string().optional(),
});

const templateExerciseSchema = z.object({
  name: z.string(),
  exerciseKey: z.string().nullish(),
  notes: z.string().optional(),
  sets: z.array(setDetailSchema).optional(),
});

export const workoutTemplateAiSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['Strength', 'Cardio', 'Hybrid']),
  description: z.string().optional(),
  exercises: z.array(templateExerciseSchema).min(1),
});

export type WorkoutTemplateAiPayload = z.infer<typeof workoutTemplateAiSchema>;
