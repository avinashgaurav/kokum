import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../components/alert';

import { color, radius, space, type, TOUCH_MIN } from '../theme';
import { Button, Card, Chip, Empty, SectionLabel } from '../components/ui';
import { useStore } from '../store/useStore';
import { INGREDIENT_INDEX } from '../data/ingredients';
import { shortfall, type ShortfallLine } from '../engine/suggest';
import { formatQuantity } from '../engine/scaling';
import {
  GROCERY_PROVIDERS,
  listAsText,
  openSearch,
  type ProviderId,
} from '../integrations/order';

const PROVIDER_ORDER: ProviderId[] = ['zepto', 'blinkit', 'instamart', 'bigbasket'];

export function OrderScreen() {
  const { state, dispatch } = useStore();
  const [provider, setProvider] = useState<ProviderId>('zepto');
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const now = Date.now();

  const lines = useMemo(
    () => shortfall(state.pantry, INGREDIENT_INDEX, state.household, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.pantry, state.household],
  );

  const byAisle = useMemo(() => {
    const groups = new Map<string, ShortfallLine[]>();
    for (const l of lines) {
      const arr = groups.get(l.aisle) ?? [];
      arr.push(l);
      groups.set(l.aisle, arr);
    }
    return [...groups.entries()];
  }, [lines]);

  const asText = () =>
    listAsText(
      lines.map((l) => ({
        name: INGREDIENT_INDEX.get(l.ingredientId)?.name ?? l.ingredientId,
        qty: formatQuantity(l.needed, l.unit),
      })),
    );

  if (!state.hydrated) return <View style={s.screen} />;

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.scroll}>
      <View style={{ gap: 2 }}>
        <Text style={type.display}>Next order</Text>
        <Text style={[type.small, { color: color.muted }]}>
          {lines.length} {lines.length === 1 ? 'item' : 'items'} below par
        </Text>
      </View>

      {lines.length === 0 ? (
        <Empty
          title="Nothing to buy"
          body="Everything is at or above its par level. This fills up on its own as stock runs down."
        />
      ) : (
        <>
          <View style={{ gap: space.sm }}>
            <SectionLabel>Order from</SectionLabel>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
              {PROVIDER_ORDER.map((p) => (
                <Chip
                  key={p}
                  label={GROCERY_PROVIDERS[p].label}
                  active={provider === p}
                  onPress={() => setProvider(p)}
                />
              ))}
            </ScrollView>
            <Text style={[type.small, { color: color.muted }]}>
              Tapping an item opens {GROCERY_PROVIDERS[provider].label} on that search. Add it
              there, come back, and it ticks off here. No grocery app lets us build your cart
              for you, so this is the honest version.
            </Text>
          </View>

          {byAisle.map(([aisle, group]) => (
            <View key={aisle} style={{ gap: space.sm }}>
              <SectionLabel>{aisle}</SectionLabel>
              <Card style={{ padding: 0 }}>
                {group.map((l, i) => {
                  const ing = INGREDIENT_INDEX.get(l.ingredientId);
                  const name = ing?.name ?? l.ingredientId;
                  const done = ticked.has(l.ingredientId);
                  return (
                    <Pressable
                      key={l.ingredientId}
                      onPress={async () => {
                        await openSearch(GROCERY_PROVIDERS[provider], name);
                        setTicked((prev) => new Set(prev).add(l.ingredientId));
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Search ${name} on ${GROCERY_PROVIDERS[provider].label}`}
                      style={({ pressed }) => [
                        s.row,
                        i < group.length - 1 && s.rowLine,
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      <View style={[s.check, done && s.checkOn]}>
                        {done ? <Text style={s.tick}>✓</Text> : null}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[type.body, done && s.struck]}>{name}</Text>
                        {l.reason === 'for-dish' ? (
                          <Text style={[type.small, { color: color.stateNeed }]}>
                            For a dish you wanted
                          </Text>
                        ) : null}
                      </View>
                      <Text style={[type.numeral, { color: done ? color.muted : color.ink }]}>
                        {formatQuantity(l.needed, l.unit)}
                      </Text>
                    </Pressable>
                  );
                })}
              </Card>
            </View>
          ))}

          <View style={{ gap: space.sm }}>
            <Button
              label="Share list"
              variant="secondary"
              onPress={() => Share.share({ message: asText() }).catch(() => {})}
            />
            <Button
              label="I ordered these, restock the pantry"
              onPress={() => {
                Alert.alert(
                  'Mark as delivered?',
                  'This adds every item on the list to your pantry at full confidence. Do it once the order actually arrives.',
                  [
                    { text: 'Not yet', style: 'cancel' },
                    {
                      text: 'Delivered',
                      onPress: () => {
                        dispatch({
                          type: 'restock',
                          lines: lines.map((l) => ({
                            ingredientId: l.ingredientId,
                            quantity: l.needed,
                            unit: l.unit,
                            storage:
                              INGREDIENT_INDEX.get(l.ingredientId)?.cls === 'perishable'
                                ? ('fridge' as const)
                                : ('counter' as const),
                          })),
                          now: Date.now(),
                        });
                        setTicked(new Set());
                      },
                    },
                  ],
                );
              }}
            />
          </View>
        </>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvas },
  scroll: { padding: space.base, gap: space.base },
  chips: { gap: space.sm, paddingRight: space.base },
  row: {
    minHeight: TOUCH_MIN,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.base,
    paddingVertical: space.sm,
  },
  rowLine: { borderBottomWidth: 1, borderBottomColor: color.lineSoft },
  check: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: color.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: color.petrol, borderColor: color.petrol },
  tick: { color: color.onPetrol, fontSize: 14, fontWeight: '700', lineHeight: 16 },
  struck: { textDecorationLine: 'line-through', color: color.muted },
});
