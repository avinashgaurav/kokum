import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Alert } from '../components/alert';

import { color, radius, space, type, TOUCH_PRIMARY } from '../theme';
import { Button, Card, Chip, Empty, SectionLabel, StateBadge } from '../components/ui';
import { useStore } from '../store/useStore';
import { INGREDIENT_INDEX } from '../data/ingredients';
import { RECIPES } from '../data/recipes';
import type { SuggestInput } from '../engine/suggest';
import { leftoverWindow, liveLeftovers, planWeek, withGuests } from '../engine/plan';
import { formatQuantity } from '../engine/scaling';

/**
 * The week: leftovers, guests, and a seven-day plan.
 *
 * Grouped rather than split into three screens because they are one decision. Whether to
 * cook tonight depends on what is already in the fridge and how many people are eating,
 * and a plan that ignores either is wrong before it renders.
 */

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function WeekScreen({ navigation }: { navigation: { goBack: () => void } }) {
  const { state, dispatch } = useStore();
  const [guests, setGuests] = useState(0);
  const [newLeftover, setNewLeftover] = useState('');
  const now = Date.now();

  const startOfToday = useMemo(() => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const household = useMemo(
    () => (guests > 0 ? withGuests(state.household, guests) : state.household),
    [state.household, guests],
  );

  const input: SuggestInput = useMemo(
    () => ({
      recipes: RECIPES,
      pantry: state.pantry,
      ingredients: INGREDIENT_INDEX,
      household,
      cookLog: state.cookLog,
      now: startOfToday,
    }),
    [state.pantry, state.cookLog, household, startOfToday],
  );

  const plan = useMemo(
    () => planWeek(input, state.leftovers, startOfToday),
    [input, state.leftovers, startOfToday],
  );

  const fridge = useMemo(() => liveLeftovers(state.leftovers, now), [state.leftovers, now]);

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
      <View style={{ gap: 3 }}>
        <Text style={type.display}>The week</Text>
        <Text style={[type.small, { color: color.muted }]}>
          One restock, seven days of decisions
        </Text>
      </View>

      {/* ---------- guests ---------- */}
      <Card style={{ gap: space.md }}>
        <SectionLabel>Anyone extra?</SectionLabel>
        <View style={s.chips}>
          {[0, 1, 2, 3, 4, 6].map((n) => (
            <Chip
              key={n}
              label={n === 0 ? 'Just us' : `+${n}`}
              active={guests === n}
              onPress={() => setGuests(n)}
            />
          ))}
        </View>
        <Text style={[type.small, { color: color.muted }]}>
          {guests === 0
            ? `Cooking for ${state.household.adults + state.household.children}.`
            : `Cooking for ${household.adults + household.children}. Quantities and the shopping list below have been rescaled, and your saved profile is untouched.`}
        </Text>
      </Card>

      {/* ---------- leftovers ---------- */}
      <Card style={{ gap: space.md }}>
        <SectionLabel>Already cooked</SectionLabel>
        {fridge.length === 0 ? (
          <Text style={[type.body, { color: color.muted }]}>
            Nothing in the fridge. Add leftovers here and the plan will eat them before
            suggesting anything new.
          </Text>
        ) : (
          fridge.map((l) => (
            <View key={l.id} style={s.leftoverRow}>
              <View style={{ flex: 1 }}>
                <Text style={type.body}>{l.label}</Text>
                <Text style={[type.small, { color: color.muted }]}>
                  {l.portions} {l.portions === 1 ? 'portion' : 'portions'} ·{' '}
                  {leftoverWindow(l, now)}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: space.xs }}>
                <Button
                  label="Ate it"
                  variant="secondary"
                  onPress={() => dispatch({ type: 'eat-leftover', id: l.id })}
                />
                <Button
                  label="Binned"
                  variant="quiet"
                  onPress={() => dispatch({ type: 'bin-leftover', id: l.id })}
                />
              </View>
            </View>
          ))
        )}

        <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
          <TextInput
            value={newLeftover}
            onChangeText={setNewLeftover}
            placeholder="Leftover rajma"
            placeholderTextColor={color.muted}
            style={[s.input, { flex: 1 }]}
            accessibilityLabel="Add a leftover"
          />
          <Button
            label="Add"
            variant="secondary"
            disabled={!newLeftover.trim()}
            onPress={() => {
              dispatch({
                type: 'add-leftover',
                label: newLeftover.trim(),
                recipeId: null,
                portions: 2,
                now: Date.now(),
              });
              setNewLeftover('');
            }}
          />
        </View>
      </Card>

      {/* ---------- the plan ---------- */}
      <View style={{ gap: space.sm }}>
        <SectionLabel>Seven days</SectionLabel>
        <Card style={{ padding: 0 }}>
          {plan.days.map((d, i) => {
            const dow = DAY_NAMES[new Date(d.day).getDay()];
            return (
              <View key={d.day} style={[s.dayRow, i < plan.days.length - 1 && s.dayLine]}>
                <Text style={s.dayName}>{i === 0 ? 'Today' : dow}</Text>
                <View style={{ flex: 1, gap: 4 }}>
                  {d.leftover ? (
                    <>
                      <Text style={type.body}>{d.leftover.label}</Text>
                      <Text style={[type.small, { color: color.stateCook }]}>
                        Already in the fridge
                      </Text>
                    </>
                  ) : d.suggestion ? (
                    <>
                      <Text style={type.body}>{d.suggestion.recipe.name}</Text>
                      <StateBadge assessment={d.suggestion.assessment} />
                    </>
                  ) : (
                    <Text style={[type.body, { color: color.muted }]}>Nothing to plan yet</Text>
                  )}
                </View>
              </View>
            );
          })}
        </Card>
        <Text style={[type.small, { color: color.muted }]}>
          Each day is planned against what the previous days will have used, so the same 200 g
          of paneer is never spent twice.
        </Text>
      </View>

      {/* ---------- shopping ---------- */}
      <View style={{ gap: space.sm }}>
        <SectionLabel>What the week needs</SectionLabel>
        {plan.shopping.length === 0 ? (
          <Empty title="Nothing to buy" body="Your pantry already covers the whole week." />
        ) : (
          <Card style={{ padding: 0 }}>
            {plan.shopping.map((l, i) => {
              const ing = INGREDIENT_INDEX.get(l.ingredientId);
              return (
                <View
                  key={l.ingredientId}
                  style={[s.dayRow, i < plan.shopping.length - 1 && s.dayLine]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={type.body}>{ing?.name ?? l.ingredientId}</Text>
                    <Text style={[type.small, { color: color.muted }]}>{l.aisle}</Text>
                  </View>
                  <Text style={type.numeral}>{formatQuantity(l.needed, l.unit)}</Text>
                </View>
              );
            })}
          </Card>
        )}
        <Button
          label="Send this to the Order tab"
          variant="secondary"
          onPress={() =>
            Alert.alert(
              'Already there',
              'The Order tab is computed from the same shortfall, so this list is already waiting for you.',
            )
          }
        />
      </View>

      <Button label="Back" variant="quiet" onPress={() => navigation.goBack()} />
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvas },
  scroll: { padding: space.base, gap: space.base },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  input: {
    minHeight: TOUCH_PRIMARY,
    backgroundColor: color.canvas,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.line,
    paddingHorizontal: space.base,
    ...type.body,
    color: color.ink,
  },
  leftoverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingBottom: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: color.lineSoft,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.base,
    paddingVertical: space.md,
  },
  dayLine: { borderBottomWidth: 1, borderBottomColor: color.lineSoft },
  dayName: { ...type.label, color: color.muted, width: 46 },
});
