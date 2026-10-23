type Props = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number | null;
};

export default function NutritionSummary({ kcal, protein, carbs, fat, fiber }: Props) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 p-3 space-y-1.5">
      <p className="text-xs uppercase tracking-widest text-white/60">Gesamt</p>
      <p className="text-lg font-black">{Math.round(kcal)} kcal</p>
      <p className="text-xs text-white/75">
        Protein {protein.toFixed(1)} g · Carbs {carbs.toFixed(1)} g · Fett {fat.toFixed(1)} g
      </p>
      {fiber != null ? <p className="text-xs text-white/55">Ballaststoffe {fiber.toFixed(1)} g</p> : null}
    </div>
  );
}
