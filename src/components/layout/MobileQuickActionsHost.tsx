/**
 * Globale Schnellaktionen (Bottom-Bar-Menü): Ernährung-Modals + Wasser.
 */

import { useEffect, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import type { MealCategory, Nutrition } from '@/src/types';
import { useNutrition } from '@/src/lib/useNutrition';
import { useAuth } from '@/src/lib/AuthContext';
import { onQuickAction, type QuickAction } from '@/src/lib/mobileQuickActions';
import NutritionLogSheet from '@/src/components/nutrition/NutritionLogSheet';
import BarcodeScanModal from '@/src/components/nutrition/BarcodeScanModal';
import type { Food } from '@/src/lib/foodDatabase';
import { resetMobileChromeAfterOverlay } from '@/src/lib/mobileViewport';

type FoodLogSession = { category: MealCategory; mode?: 'manual' | 'photo' };
type BarcodeSession = { category: MealCategory };

export default function MobileQuickActionsHost() {
  const navigate = useNavigate();
  const { addMeal, nutritionEntries, refetch } = useNutrition();
  const { profile, updateProfile } = useAuth();

  const [foodLog, setFoodLog] = useState<FoodLogSession | null>(null);
  const [barcodeSession, setBarcodeSession] = useState<BarcodeSession | null>(null);

  useEffect(() => {
    return onQuickAction((action: QuickAction) => {
      if (action.type === 'nutrition') {
        if (action.mode === 'barcode') {
          setFoodLog(null);
          setBarcodeSession({ category: action.category });
          return;
        }
        if (action.mode === 'manual') {
          setBarcodeSession(null);
          setFoodLog({ category: action.category, mode: 'manual' });
          return;
        }
        setBarcodeSession(null);
        setFoodLog({ category: action.category, mode: 'photo' });
        return;
      }

      if (action.type === 'weight') {
        navigate('/profile', { state: { quickAction: 'weight' } });
        return;
      }
      if (action.type === 'workout-log') {
        navigate('/workouts', { state: { quickAction: 'log' } });
        return;
      }
      if (action.type === 'steps') {
        navigate('/', { state: { quickAction: 'steps' } });
        return;
      }
      if (action.type === 'sleep') {
        navigate('/', { state: { quickAction: 'sleep' } });
        return;
      }
      if (action.type === 'water' && profile) {
        const todayString = format(new Date(), 'yyyy-MM-dd');
        const waterTodayMl = profile.dailyWaterLog?.[todayString] ?? 0;
        const next = {
          ...(profile.dailyWaterLog || {}),
          [todayString]: Math.max(0, waterTodayMl + action.deltaMl),
        };
        void updateProfile({ dailyWaterLog: next });
      }
    });
  }, [navigate, profile, updateProfile]);

  const closeFoodLog = () => {
    setFoodLog(null);
    resetMobileChromeAfterOverlay();
  };

  const dismissBarcode = () => {
    setBarcodeSession(null);
    resetMobileChromeAfterOverlay();
  };

  return (
    <AnimatePresence>
      {barcodeSession ? (
        <BarcodeScanModal
          mealCategory={barcodeSession.category}
          onMealCategoryChange={category =>
            setBarcodeSession(prev => (prev ? { ...prev, category } : null))
          }
          onClose={dismissBarcode}
          onTrack={async data => {
            const category = barcodeSession.category;
            await addMeal({
              ...data,
              category,
              date: new Date().toISOString(),
            });
            dismissBarcode();
          }}
        />
      ) : null}

      {foodLog ? (
        <NutritionLogSheet
          key={`quick-food-${foodLog.category}-${foodLog.mode ?? 'manual'}`}
          defaultCategory={foodLog.category}
          initialTab="describe"
          nutritionEntries={nutritionEntries}
          onClose={closeFoodLog}
          onAfterSave={async () => {
            await refetch();
            closeFoodLog();
          }}
          onLog={async data => {
            await addMeal({
              ...data,
              category: foodLog.category,
              date: new Date().toISOString(),
            });
            closeFoodLog();
          }}
        />
      ) : null}
    </AnimatePresence>
  );
}
