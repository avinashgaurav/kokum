import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { color, FAB_CLEARANCE, FAB_INSET, FAB_SIZE, radius, shadow, space, type, TOUCH_PRIMARY } from '../theme';
import { Button, Card, Chip, Empty, SectionLabel, StateBadge } from '../components/ui';
import { Mark } from '../components/Mark';
import { useStore } from '../store/useStore';
import { INGREDIENT_INDEX } from '../data/ingredients';
import { RECIPES } from '../data/recipes';
import { suggest, surpriseMe, type SuggestInput } from '../engine/suggest';
import { formatQuantity } from '../engine/scaling';
import type { Suggestion } from '../engine/types';
import { FOOD_PROVIDERS, GROCERY_PROVIDERS, openSearch } from '../integrations/order';
import { rerank } from '../ai/rerank';

const MOODS = ['comfort', 'quick', 'light', 'wholesome', 'weekend', 'impress', 'breakfast'];

export function TodayScreen({ navigation }: { navigation: { navigate: (s: string) => void } }) {
  const { state, dispatch } = useStore();
  const [query, setQuery] = useState('');
  const [mood, setMood] = useState<string | null>(null);
  const [surprise, setSurprise] = useState<Suggestion | null>(null);
  const now = Date.now();

  const input: SuggestInput = useMemo(
    () => ({
      recipes: RECIPES,
      pantry: state.pantry,
      ingredients: INGREDIENT_INDEX,
      household: state.household,
      cookLog: state.cookLog,
      now,
    }),
    // `now` intentionally excluded: re-deriving on every tick would reshuffle the list
    // under the user's thumb. It refreshes on any real state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.pantry, state.household, state.cookLog],
  );

  const isPull = query.trim().length > 0 || mood !== null;

  const results = useMemo(
    () =>
      suggest(input, {
        kind: isPull ? 'pull' : 'push',
        query: query.trim() || undefined,
        moods: mood ? [mood] : undefined,
        limit: isPull ? 8 : 3,
      }),
    [input, isPull, query, mood],
  );

  /**
   * Claude's ordering and sentences, keyed by recipe id. The screen renders the
   * deterministic result first and swaps these in when they arrive, so the app is never
   * waiting on the network to tell you what to cook. Offline, this map just stays empty.
   *
   * Only the sentence and the order come from Claude. Every dish state and missing-item
   * list on screen is the one this device computed. See AGENTS.md.
   */
  const [aiReasons, setAiReasons] = useState<Record<string, string>>({});
  const [aiOrder, setAiOrder] = useState<string[] | null>(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    if (results.length === 0) {
      setAiReasons({});
      setAiOrder(null);
      return;
    }
    const seq = ++requestSeq.current;
    let cancelled = false;

    (async () => {
      const out = await rerank(
        results,
        state.household,
        [...state.pantry.keys()],
        query.trim() || mood || undefined,
      );
      // Drop anything that came back after the user moved on.
      if (cancelled || seq !== requestSeq.current || !out.ok) return;
      setAiReasons(Object.fromEntries(out.value.map((r) => [r.suggestion.recipe.id, r.reason])));
      setAiOrder(out.value.map((r) => r.suggestion.recipe.id));
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results]);

  /** Apply Claude's order if we have one, otherwise keep the deterministic order. */
  const shown = useMemo(() => {
    if (!aiOrder) return results;
    const byId = new Map(results.map((r) => [r.recipe.id, r]));
    const ordered = aiOrder.map((id) => byId.get(id)).filter((x): x is Suggestion => !!x);
    // Anything the reranker did not mention still appears, after the rest.
    for (const r of results) if (!aiOrder.includes(r.recipe.id)) ordered.push(r);
    return ordered;
  }, [results, aiOrder]);

  if (!state.hydrated) return <View style={s.screen} />;

  return (
    <View style={s.screen}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.header}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={type.display}>Tonight</Text>
            <Text style={[type.small, { color: color.muted }]}>
              {state.household.adults + state.household.children} eating ·{' '}
              {state.household.cooktop}
            </Text>
          </View>
          <Button
            label="Plan the week"
            variant="secondary"
            onPress={() => navigation.navigate('Week')}
          />
        </View>

        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="What do you feel like? Try biryani, or something light"
          placeholderTextColor={color.muted}
          style={s.input}
          returnKeyType="search"
          accessibilityLabel="Search dishes or describe a mood"
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
          {MOODS.map((m) => (
            <Chip
              key={m}
              label={m}
              active={mood === m}
              onPress={() => setMood(mood === m ? null : m)}
            />
          ))}
        </ScrollView>

        {isPull ? (
          <Text style={[type.small, { color: color.muted }]}>
            Showing everything, including dishes you would need to shop for.
          </Text>
        ) : null}

        {shown.length === 0 ? (
          <Empty
            title="Nothing to suggest yet"
            body="Your pantry does not have enough in it to back a dish. Add what you have and this fills up."
            actionLabel="Go to Pantry"
            onAction={() => setQuery('')}
          />
        ) : (
          shown.map((sg) => (
            <DishCard
              key={sg.recipe.id}
              suggestion={sg}
              reason={aiReasons[sg.recipe.id] ?? sg.reason}
              onCook={() => dispatch({ type: 'cook', recipe: sg.recipe, now: Date.now() })}
            />
          ))
        )}

        {surprise ? (
          <View style={{ gap: space.sm }}>
            <SectionLabel>Surprise</SectionLabel>
            <DishCard
              suggestion={surprise}
              reason={aiReasons[surprise.recipe.id] ?? surprise.reason}
              onCook={() => {
                dispatch({ type: 'cook', recipe: surprise.recipe, now: Date.now() });
                setSurprise(null);
              }}
            />
          </View>
        ) : null}
      </ScrollView>

      {/* Thumb zone. The one floating action, bottom right. */}
      <Pressable
        onPress={() => setSurprise(surpriseMe(input, Date.now() % 997))}
        accessibilityRole="button"
        accessibilityLabel="Surprise me with a dish"
        style={({ pressed }) => [s.fab, pressed && { transform: [{ scale: 0.95 }] }]}
      >
        <Mark size={34} on={color.onPetrol} off="rgba(255,255,255,0.42)" />
      </Pressable>
    </View>
  );
}

function DishCard({
  suggestion,
  reason,
  onCook,
}: {
  suggestion: Suggestion;
  reason: string;
  onCook: () => void;
}) {
  const { recipe, assessment } = suggestion;
  const missingNames = assessment.missing.map(
    (m) => INGREDIENT_INDEX.get(m.ingredientId)?.name ?? m.ingredientId,
  );

  return (
    <Card style={{ gap: space.md }}>
      <StateBadge assessment={assessment} />

      <View style={{ gap: 3 }}>
        <Text style={type.title}>{recipe.name}</Text>
        <Text style={[type.small, { color: color.muted }]}>
          {recipe.minutes} min · {recipe.cuisine}
        </Text>
      </View>

      <Text style={[type.body, { color: color.inkSoft }]}>{reason}</Text>

      {assessment.state === 'need-items' ? (
        <View style={s.missingBox}>
          {assessment.missing.map((m) => {
            const ing = INGREDIENT_INDEX.get(m.ingredientId);
            return (
              <View key={m.ingredientId} style={s.missingRow}>
                <Text style={[type.body, { color: color.ink }]}>{ing?.name ?? m.ingredientId}</Text>
                <Text style={[type.numeral, { color: color.stateNeed }]}>
                  {formatQuantity(m.needed - m.have, m.unit)}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}

      {assessment.optionalMissing.length > 0 && assessment.state === 'cook-now' ? (
        <Text style={[type.small, { color: color.muted }]}>
          Without{' '}
          {assessment.optionalMissing
            .map((id) => INGREDIENT_INDEX.get(id)?.name.toLowerCase() ?? id)
            .join(', ')}
          , which is fine.
        </Text>
      ) : null}

      <View style={{ gap: space.sm }}>
        {assessment.state === 'cook-now' ? (
          <Button label="I cooked this" onPress={onCook} />
        ) : assessment.state === 'need-items' ? (
          <>
            <Button
              label="Order what's missing"
              onPress={() => openSearch(GROCERY_PROVIDERS.zepto, missingNames.join(' '))}
              variant="secondary"
            />
            <Button
              label={`Order ${recipe.name} instead`}
              onPress={() => openSearch(FOOD_PROVIDERS.swiggy, recipe.name)}
              variant="quiet"
            />
          </>
        ) : (
          <Button
            label={`Still have ${assessment.uncertain
              .map((id) => INGREDIENT_INDEX.get(id)?.name.toLowerCase() ?? id)
              .join(' and ')}?`}
            onPress={onCook}
            variant="secondary"
          />
        )}
      </View>
    </Card>
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
  chips: { gap: space.sm, paddingVertical: 2, paddingRight: space.base },
  missingBox: {
    backgroundColor: color.stateNeedWash,
    borderRadius: radius.sm,
    padding: space.md,
    gap: 6,
  },
  missingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
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
});
