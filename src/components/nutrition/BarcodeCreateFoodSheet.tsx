import { useState, useRef } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import type { Food } from '@/src/lib/foodDatabase';
import { saveBarcodeCustomFood, scanNutritionLabel } from '@/src/services/nutritionLogService';
import { cn } from '@/src/lib/utils';

type Props = {
  barcode: string;
  onSaved: (food: Food) => void;
  onCancel: () => void;
};

export default function BarcodeCreateFoodSheet({ barcode, onSaved, onCancel }: Props) {
  const [name, setName] = useState('');
  const [packQty, setPackQty] = useState('330');
  const [packUnit, setPackUnit] = useState<'ml' | 'g'>('ml');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const applyNutrients = (n: { calories: number; protein: number; carbs: number; fat: number }) => {
    setKcal(String(n.calories));
    setProtein(String(n.protein));
    setCarbs(String(n.carbs));
    setFat(String(n.fat));
  };

  const onPhoto = async (file: File) => {
    setBusy(true);
    setErr(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const { nutrientsPer100g, warnings } = await scanNutritionLabel(dataUrl);
      applyNutrients(nutrientsPer100g);
      if (warnings.length) setErr(warnings.join(' · '));
    } catch {
      setErr('Etikett konnte nicht gelesen werden.');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!name.trim()) {
      setErr('Bitte einen Namen eingeben.');
      return;
    }
    const nutrients = {
      calories: parseFloat(kcal) || 0,
      protein: parseFloat(protein) || 0,
      carbs: parseFloat(carbs) || 0,
      fat: parseFloat(fat) || 0,
    };
    if (nutrients.calories <= 0) {
      setErr('Bitte Nährwerte (mindestens kcal) angeben oder Foto scannen.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const { food } = await saveBarcodeCustomFood({
        barcode,
        name: name.trim(),
        packQuantity: parseFloat(packQty) || 100,
        packUnit,
        nutrientsPer100g: nutrients,
      });
      onSaved(food);
    } catch {
      setErr('Speichern fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-white/10 bg-[#1a1a1a] p-4 space-y-4">
      <div>
        <p className="text-xs text-white/50 uppercase tracking-wide">Barcode</p>
        <p className="font-mono text-sm">{barcode}</p>
      </div>
      <label className="block space-y-1">
        <span className="text-xs text-white/60">Produktname</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm"
          placeholder="z. B. Energy Drink"
        />
      </label>
      <div className="flex gap-2">
        <label className="flex-1 space-y-1">
          <span className="text-xs text-white/60">Packungsgröße</span>
          <input
            value={packQty}
            onChange={(e) => setPackQty(e.target.value)}
            className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm"
          />
        </label>
        <label className="w-24 space-y-1">
          <span className="text-xs text-white/60">Einheit</span>
          <select
            value={packUnit}
            onChange={(e) => setPackUnit(e.target.value as 'ml' | 'g')}
            className="w-full rounded-lg bg-black/40 border border-white/10 px-2 py-2 text-sm"
          >
            <option value="ml">ml</option>
            <option value="g">g</option>
          </select>
        </label>
      </div>
      <div>
        <p className="text-xs text-white/60 mb-2">Nährwerte pro 100 g/ml</p>
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className={cn(
            'flex items-center gap-2 rounded-lg border border-dashed border-brand/40 px-3 py-2 text-sm text-brand w-full justify-center',
            busy && 'opacity-50',
          )}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
          Foto der Nährwerttabelle
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onPhoto(f);
            e.target.value = '';
          }}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="text-xs text-white/50">kcal</span>
          <input value={kcal} onChange={(e) => setKcal(e.target.value)} className="w-full rounded-lg bg-black/40 border border-white/10 px-2 py-1.5 text-sm" />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-white/50">Protein</span>
          <input value={protein} onChange={(e) => setProtein(e.target.value)} className="w-full rounded-lg bg-black/40 border border-white/10 px-2 py-1.5 text-sm" />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-white/50">KH</span>
          <input value={carbs} onChange={(e) => setCarbs(e.target.value)} className="w-full rounded-lg bg-black/40 border border-white/10 px-2 py-1.5 text-sm" />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-white/50">Fett</span>
          <input value={fat} onChange={(e) => setFat(e.target.value)} className="w-full rounded-lg bg-black/40 border border-white/10 px-2 py-1.5 text-sm" />
        </label>
      </div>
      {err && <p className="text-xs text-amber-400">{err}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="flex-1 py-2 rounded-lg border border-white/15 text-sm">
          Abbrechen
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="flex-1 py-2 ui-btn-brand text-sm font-semibold disabled:opacity-50"
        >
          Speichern
        </button>
      </div>
    </div>
  );
}
