import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  color,
  FAB_CLEARANCE,
  FAB_INSET,
  FAB_SIZE,
  radius,
  shadow,
  space,
  type,
  TOUCH_MIN,
  TOUCH_PRIMARY,
} from '../theme';
import { Button, Card, SectionLabel } from '../components/ui';
import { StockMark } from '../components/Mark';
import { useStore } from '../store/useStore';
import { INGREDIENT_INDEX, searchIngredients } from '../data/ingredients';
import { COOK_THRESHOLD, confidenceOf, projectedQuantity, weeklyCheckQueue } from '../engine/confidence';
import { formatQuantity } from '../engine/scaling';
import type { Ingredient, PantryItem } from '../engine/types';

export function PantryScreen({ navigation }: { navigation: { navigate: (s: string) => void } }) {
  const { state, dispatch } = useStore();
  const [query, setQuery] = useState('');
  const [checking, setChecking] = useState(false);
  const now = Date.now();

  const items = useMemo(() => [...state.pantry.values()], [state.pantry]);

  const checkQueue = useMemo(
    () => weeklyCheckQueue(items, INGREDIENT_INDEX, now, 8),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items],
  );

  const visible = useMemo(() => {
    const allowed = new Set(searchIngredients(query).map((i) => i.id));
    return items.filter((it) => allowed.has(it.ingredientId));
  }, [items, query]);

  const { perishables, staples } = useMemo(() => {
    const p: PantryItem[] = [];
    const st: PantryItem[] = [];
    for (const it of visible) {
      const ing = INGREDIENT_INDEX.get(it.ingredientId);
      if (!ing) continue;
      (ing.cls === 'perishable' ? p : st).push(it);
    }
    const byName = (a: PantryItem, b: PantryItem) =>
      (INGREDIENT_INDEX.get(a.ingredientId)?.name ?? '').localeCompare(
        INGREDIENT_INDEX.get(b.ingredientId)?.name ?? '',
      );
    return { perishables: p.sort(byName), staples: st.sort(byName) };
  }, [visible]);

  /** Fraction of the dictionary we currently hold above par. Drives the header gauge. */
  const stockRatio = useMemo(() => {
    const all = [...INGREDIENT_INDEX.values()];
    const ae = state.household.adults + state.household.children * 0.6;
    let ok = 0;
    for (const ing of all) {
      const it = state.pantry.get(ing.id);
      if (!it) continue;
      if (projectedQuantity(it, ing, state.household, now) >= ing.parPerAdult * ae * 0.5) ok++;
    }
    return all.length ? ok / all.length : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.pantry, state.household]);

  if (!state.hydrated) return <View style={s.screen} />;

  if (checking && checkQueue.length > 0) {
    return (
      <WeeklyCheck
        queue={checkQueue}
        onDone={() => setChecking(false)}
        onAnswer={(id, qty) =>
          dispatch({ type: 'confirm', ingredientId: id, quantity: qty, now: Date.now() })
        }
      />
    );
  }

  return (
    <View style={s.screen}>
    <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
      <View style={s.header}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={type.display}>Pantry</Text>
          <Text style={[type.small, { color: color.muted }]}>
            {items.filter((i) => i.quantity > 0).length} items tracked
          </Text>
        </View>
        <StockMark ratio={stockRatio} size={46} />
      </View>

      {checkQueue.length > 0 ? (
        <Card style={{ gap: space.md }}>
          <Text style={type.subtitle}>
            {checkQueue.length} {checkQueue.length === 1 ? 'item needs' : 'items need'} a look
          </Text>
          <Text style={[type.body, { color: color.muted }]}>
            These have gone quiet enough that we will not vouch for them. Thirty seconds fixes it.
          </Text>
          <Button label="Start pantry check" onPress={() => setChecking(true)} variant="secondary" />
        </Card>
      ) : null}

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search: dhaniya, coriander, धनिया"
        placeholderTextColor={color.muted}
        style={s.input}
        accessibilityLabel="Search pantry"
      />

      {perishables.length > 0 ? (
        <View style={{ gap: space.sm }}>
          <SectionLabel>Perishable</SectionLabel>
          <Card style={{ padding: 0 }}>
            {perishables.map((it, i) => (
              <Row
                key={it.ingredientId}
                item={it}
                now={now}
                last={i === perishables.length - 1}
                onFinished={() =>
                  dispatch({
                    type: 'confirm',
                    ingredientId: it.ingredientId,
                    quantity: 0,
                    now: Date.now(),
                  })
                }
              />
            ))}
          </Card>
        </View>
      ) : null}

      {staples.length > 0 ? (
        <View style={{ gap: space.sm }}>
          <SectionLabel>Staples</SectionLabel>
          <Card style={{ padding: 0 }}>
            {staples.map((it, i) => (
              <Row
                key={it.ingredientId}
                item={it}
                now={now}
                last={i === staples.length - 1}
                onFinished={() =>
                  dispatch({
                    type: 'confirm',
                    ingredientId: it.ingredientId,
                    quantity: 0,
                    now: Date.now(),
                  })
                }
              />
            ))}
          </Card>
        </View>
      ) : null}
    </ScrollView>

    {/* Capture is the highest-value repeated action, so it gets the thumb-zone slot. */}
    <Pressable
      onPress={() => navigation.navigate('Capture')}
      accessibilityRole="button"
      accessibilityLabel="Add groceries by photo or voice"
      style={({ pressed }) => [s.fab, pressed && { transform: [{ scale: 0.95 }] }]}
    >
      <Text style={s.fabGlyph}>+</Text>
    </Pressable>
    </View>
  );
}

function Row({
  item,
  now,
  last,
  onFinished,
}: {
  item: PantryItem;
  now: number;
  last: boolean;
  onFinished: () => void;
}) {
  // Hooks first, always. No early return above this line.
  const { household } = useStore().state;

  const ing = INGREDIENT_INDEX.get(item.ingredientId);
  if (!ing) return null;

  const qty = projectedQuantity(item, ing, household, now);
  const conf = confidenceOf(item, ing, now);

  // Three states, one glance. Confidence is never shown as a number.
  const dot =
    qty <= 0
      ? { borderWidth: 2, borderColor: color.stateNeed }
      : conf >= COOK_THRESHOLD
        ? { backgroundColor: color.stateCook }
        : { borderWidth: 2, borderColor: color.stateCheck };

  return (
    <Pressable
      onLongPress={onFinished}
      accessibilityLabel={`${ing.name}, ${qty <= 0 ? 'out' : formatQuantity(qty, ing.unit)}. Long press to mark finished.`}
      style={({ pressed }) => [s.row, !last && s.rowLine, pressed && { opacity: 0.7 }]}
    >
      <View style={[s.dot, dot]} />
      <View style={{ flex: 1 }}>
        <Text style={type.body}>{ing.name}</Text>
        {qty <= 0 ? (
          <Text style={[type.small, { color: color.stateNeed }]}>Out</Text>
        ) : conf < COOK_THRESHOLD ? (
          <Text style={[type.small, { color: color.muted }]}>Not sure any more</Text>
        ) : null}
      </View>
      <Text style={[type.numeral, { color: qty <= 0 ? color.muted : color.ink }]}>
        {qty <= 0 ? '0' : formatQuantity(qty, ing.unit)}
      </Text>
    </Pressable>
  );
}

/** The 30-second correction pass. Only the least certain items, one tap each. */
function WeeklyCheck({
  queue,
  onAnswer,
  onDone,
}: {
  queue: PantryItem[];
  onAnswer: (ingredientId: string, quantity: number) => void;
  onDone: () => void;
}) {
  const [i, setI] = useState(0);
  const item = queue[i];
  const ing: Ingredient | undefined = item ? INGREDIENT_INDEX.get(item.ingredientId) : undefined;

  const next = () => {
    if (i + 1 >= queue.length) onDone();
    else setI(i + 1);
  };

  if (!item || !ing) {
    return (
      <View style={[s.screen, s.checkWrap]}>
        <Text style={type.title}>All caught up.</Text>
        <Button label="Back to pantry" onPress={onDone} />
      </View>
    );
  }

  return (
    <View style={[s.screen, s.checkWrap]}>
      <Text style={[type.small, { color: color.muted }]}>
        {i + 1} of {queue.length}
      </Text>
      <Text style={type.display}>Still have {ing.name.toLowerCase()}?</Text>
      <Text style={[type.body, { color: color.muted }]}>
        We last heard about this a while ago.
      </Text>

      <View style={{ gap: space.sm, marginTop: space.base }}>
        <Button
          label="Yes, still have it"
          onPress={() => {
            onAnswer(item.ingredientId, item.quantity);
            next();
          }}
        />
        <Button
          label="Running low"
          variant="secondary"
          onPress={() => {
            onAnswer(item.ingredientId, item.quantity * 0.25);
            next();
          }}
        />
        <Button
          label="All finished"
          variant="secondary"
          onPress={() => {
            onAnswer(item.ingredientId, 0);
            next();
          }}
        />
        <Button label="Skip" variant="quiet" onPress={next} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvas },
  scroll: { padding: space.base, gap: space.base, paddingBottom: FAB_CLEARANCE },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  input: {
    minHeight: TOUCH_PRIMARY,
    backgroundColor: color.card,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.line,
    paddingHorizontal: space.base,
    ...type.body,
    color: color.ink,
  },
  row: {
    minHeight: TOUCH_MIN,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.base,
    paddingVertical: space.sm,
  },
  rowLine: { borderBottomWidth: 1, borderBottomColor: color.lineSoft },
  dot: { width: 10, height: 10, borderRadius: 5 },
  checkWrap: { padding: space.lg, justifyContent: 'center', gap: space.sm },
  fab: {
    position: 'absolute',
    right: space.base,
    bottom: FAB_INSET,
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: color.petrol,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
    shadowOpacity: 0.22,
  },
  fabGlyph: { color: color.onPetrol, fontSize: 32, fontWeight: '400', lineHeight: 36 },
});
