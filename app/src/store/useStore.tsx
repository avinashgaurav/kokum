import React, { createContext, useContext, useEffect, useMemo, useReducer } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { CookLogEntry, Household, PantryItem, Recipe } from '../engine/types';
import { INGREDIENT_INDEX } from '../data/ingredients';
import { applyCook, confirmItem, restock } from '../engine/cook';

const KEY = 'kokum.state.v1';

export interface AppState {
  household: Household;
  pantry: Map<string, PantryItem>;
  cookLog: CookLogEntry[];
  /** False until the first load from disk completes, so we never flash seed data. */
  hydrated: boolean;
}

export const DEFAULT_HOUSEHOLD: Household = {
  adults: 2,
  children: 0,
  cooktop: 'gas',
  burners: 2,
  diet: 'veg',
  allergies: [],
  dislikes: [],
  equipment: ['cooker', 'kadhai', 'tawa', 'mixer'],
  maxMinutesWeekday: 45,
  maxMinutesWeekend: 90,
};

/**
 * A starter pantry so the app has something to say on first launch. Real onboarding
 * replaces this with a parsed bill; until then an empty Today screen teaches nothing.
 */
function seedPantry(now: number): Map<string, PantryItem> {
  const stock: [string, number, number][] = [
    // id, quantity, days since confirmed
    ['atta', 4000, 3],
    ['rice', 3000, 3],
    ['toor-dal', 800, 3],
    ['moong-dal', 400, 10],
    ['besan', 400, 10],
    ['poha', 500, 3],
    ['oil', 900, 3],
    ['ghee', 400, 10],
    ['salt', 800, 20],
    ['sugar', 900, 20],
    ['turmeric', 90, 20],
    ['chilli-powder', 90, 20],
    ['garam-masala', 80, 20],
    ['jeera', 90, 20],
    ['mustard-seed', 90, 20],
    ['onion', 900, 4],
    ['tomato', 500, 2],
    ['potato', 800, 4],
    ['garlic', 120, 4],
    ['ginger', 90, 4],
    ['palak', 300, 3],
    ['dhaniya', 1, 3],
    ['green-chilli', 80, 4],
    ['paneer', 200, 2],
    ['milk', 1000, 1],
    ['curd', 400, 2],
    ['peas', 300, 1],
    ['lemon', 3, 4],
  ];

  const m = new Map<string, PantryItem>();
  for (const [id, qty, age] of stock) {
    const ing = INGREDIENT_INDEX.get(id);
    if (!ing) continue;
    m.set(id, {
      ingredientId: id,
      quantity: qty,
      unit: ing.unit,
      storage: ing.cls === 'perishable' ? 'fridge' : 'counter',
      lastConfirmedAt: now - age * 86_400_000,
    });
  }
  return m;
}

type Action =
  | { type: 'hydrate'; state: Omit<AppState, 'hydrated'> }
  | { type: 'cook'; recipe: Recipe; now: number }
  | { type: 'confirm'; ingredientId: string; quantity: number; now: number }
  | { type: 'restock'; lines: Parameters<typeof restock>[1]; now: number }
  | { type: 'household'; patch: Partial<Household> };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'hydrate':
      return { ...action.state, hydrated: true };

    case 'cook':
      return {
        ...state,
        pantry: applyCook(
          action.recipe,
          state.pantry,
          INGREDIENT_INDEX,
          state.household,
          action.now,
        ),
        cookLog: [...state.cookLog, { recipeId: action.recipe.id, at: action.now }],
      };

    case 'confirm':
      return {
        ...state,
        pantry: confirmItem(state.pantry, action.ingredientId, action.quantity, action.now),
      };

    case 'restock':
      return { ...state, pantry: restock(state.pantry, action.lines, action.now) };

    case 'household':
      return { ...state, household: { ...state.household, ...action.patch } };
  }
}

const StoreContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<Action>;
} | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    household: DEFAULT_HOUSEHOLD,
    pantry: new Map<string, PantryItem>(),
    cookLog: [],
    hydrated: false,
  }));

  // Load once. Every screen renders from local state, so nothing blocks on the network.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const now = Date.now();
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (cancelled) return;
        if (raw) {
          const parsed = JSON.parse(raw) as {
            household: Household;
            pantry: PantryItem[];
            cookLog: CookLogEntry[];
          };
          dispatch({
            type: 'hydrate',
            state: {
              household: { ...DEFAULT_HOUSEHOLD, ...parsed.household },
              pantry: new Map(parsed.pantry.map((p) => [p.ingredientId, p])),
              cookLog: parsed.cookLog ?? [],
            },
          });
          return;
        }
      } catch {
        // Corrupt or unreadable storage falls through to the seed rather than a blank app.
      }
      if (!cancelled) {
        dispatch({
          type: 'hydrate',
          state: { household: DEFAULT_HOUSEHOLD, pantry: seedPantry(now), cookLog: [] },
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist after every change, once hydrated.
  useEffect(() => {
    if (!state.hydrated) return;
    const payload = JSON.stringify({
      household: state.household,
      pantry: [...state.pantry.values()],
      cookLog: state.cookLog.slice(-500),
    });
    AsyncStorage.setItem(KEY, payload).catch(() => {
      // Persistence failure must never take the app down; the session still works in memory.
    });
  }, [state]);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
