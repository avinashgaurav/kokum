import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { color, radius, space, type, TOUCH_MIN, TOUCH_PRIMARY } from '../theme';
import { Button, Card, Chip, SectionLabel } from '../components/ui';
import { useStore } from '../store/useStore';
import type { Cooktop, Diet, Equipment } from '../engine/types';
import { getApiKey, setApiKey } from '../ai/client';

const DIETS: { id: Diet; label: string }[] = [
  { id: 'veg', label: 'Veg' },
  { id: 'egg', label: 'Egg' },
  { id: 'nonveg', label: 'Non-veg' },
  { id: 'jain', label: 'Jain' },
  { id: 'vegan', label: 'Vegan' },
];

const COOKTOPS: { id: Cooktop; label: string }[] = [
  { id: 'gas', label: 'Gas' },
  { id: 'induction', label: 'Induction' },
  { id: 'both', label: 'Both' },
];

const EQUIPMENT: { id: Equipment; label: string }[] = [
  { id: 'cooker', label: 'Pressure cooker' },
  { id: 'kadhai', label: 'Kadhai' },
  { id: 'tawa', label: 'Tawa' },
  { id: 'mixer', label: 'Mixer' },
  { id: 'oven', label: 'Oven' },
  { id: 'airfryer', label: 'Air fryer' },
  { id: 'microwave', label: 'Microwave' },
];

const ALLERGENS = ['dairy', 'gluten', 'egg', 'nuts'];

export function SettingsScreen() {
  const { state, dispatch } = useStore();
  const h = state.household;
  const set = (patch: Parameters<typeof dispatch>[0] extends never ? never : object) =>
    dispatch({ type: 'household', patch });

  const toggle = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((x) => x !== value) : [...list, value];

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.scroll}>
      <Text style={type.display}>Setup</Text>

      <Card style={{ gap: space.md }}>
        <SectionLabel>Who you cook for</SectionLabel>
        <Stepper
          label="Adults"
          value={h.adults}
          min={1}
          onChange={(adults) => set({ adults })}
        />
        <Stepper
          label="Children"
          value={h.children}
          min={0}
          onChange={(children) => set({ children })}
        />
        <Text style={[type.small, { color: color.muted }]}>
          Quantities scale from this. A child counts as 0.6 of an adult portion.
        </Text>
      </Card>

      <Card style={{ gap: space.md }}>
        <SectionLabel>Cooktop</SectionLabel>
        <View style={s.chips}>
          {COOKTOPS.map((c) => (
            <Chip
              key={c.id}
              label={c.label}
              active={h.cooktop === c.id}
              onPress={() => set({ cooktop: c.id })}
            />
          ))}
        </View>
        <Stepper
          label="Burners"
          value={h.burners}
          min={1}
          onChange={(burners) => set({ burners })}
        />
        <Text style={[type.small, { color: color.muted }]}>
          {h.cooktop === 'induction'
            ? 'Induction has no open flame, so we will not suggest phulka puffed on the fire or charred baingan bharta.'
            : 'Gas unlocks open-flame dishes: phulka on the fire, charred baingan for bharta.'}
        </Text>
      </Card>

      <Card style={{ gap: space.md }}>
        <SectionLabel>Diet</SectionLabel>
        <View style={s.chips}>
          {DIETS.map((d) => (
            <Chip
              key={d.id}
              label={d.label}
              active={h.diet === d.id}
              onPress={() => set({ diet: d.id })}
            />
          ))}
        </View>
      </Card>

      <Card style={{ gap: space.md }}>
        <SectionLabel>Allergies</SectionLabel>
        <View style={s.chips}>
          {ALLERGENS.map((a) => (
            <Chip
              key={a}
              label={a}
              active={h.allergies.includes(a)}
              onPress={() => set({ allergies: toggle(h.allergies, a) })}
            />
          ))}
        </View>
        <Text style={[type.small, { color: color.muted }]}>
          Absolute. An allergen is never suggested, in any mode, however you search.
        </Text>
      </Card>

      <Card style={{ gap: space.md }}>
        <SectionLabel>Equipment</SectionLabel>
        <View style={s.chips}>
          {EQUIPMENT.map((e) => (
            <Chip
              key={e.id}
              label={e.label}
              active={h.equipment.includes(e.id)}
              onPress={() => set({ equipment: toggle(h.equipment, e.id) })}
            />
          ))}
        </View>
      </Card>

      <ApiKeyCard />

      <Card style={{ gap: space.sm }}>
        <SectionLabel>About</SectionLabel>
        <Text style={[type.body, { color: color.inkSoft }]}>
          Kokum works out what is in your kitchen from what you buy and what you cook. It is a
          careful estimate, not a sensor: when it is not sure, it asks rather than guessing.
        </Text>
        <Text style={[type.small, { color: color.muted }]}>
          Everything stays on this device. Nothing is uploaded.
        </Text>
      </Card>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

/**
 * Claude API key. Stored in the device keychain via expo-secure-store, never in app state
 * and never written to disk in plaintext. Everything except photo and voice reading works
 * without it, so this screen says so plainly rather than nagging.
 */
function ApiKeyCard() {
  const [key, setKey] = useState('');
  const [saved, setSaved] = useState<boolean | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getApiKey().then((k) => {
      if (!cancelled) setSaved(k !== null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    await setApiKey(key);
    setSaved(key.trim().length > 0);
    setKey('');
    setEditing(false);
  }

  return (
    <Card style={{ gap: space.md }}>
      <SectionLabel>Reading photos and voice</SectionLabel>

      {saved && !editing ? (
        <>
          <Text style={[type.body, { color: color.inkSoft }]}>
            Your Claude key is set. Photo and voice capture are working.
          </Text>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <Button label="Replace key" variant="secondary" onPress={() => setEditing(true)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label="Remove"
                variant="quiet"
                onPress={async () => {
                  await setApiKey('');
                  setSaved(false);
                }}
              />
            </View>
          </View>
        </>
      ) : (
        <>
          <Text style={[type.body, { color: color.inkSoft }]}>
            Kokum uses Claude to read grocery bills, handwritten lists and spoken input. Paste a
            key from console.anthropic.com to turn that on.
          </Text>
          <TextInput
            value={key}
            onChangeText={setKey}
            placeholder="sk-ant-..."
            placeholderTextColor={color.muted}
            style={s.keyInput}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            accessibilityLabel="Claude API key"
          />
          <Button label="Save key" onPress={save} disabled={!key.trim()} />
          <Text style={[type.small, { color: color.muted }]}>
            Stored in your phone's keychain. It goes to Anthropic and nowhere else. Everything
            else in Kokum works without it.
          </Text>
        </>
      )}
    </Card>
  );
}

function Stepper({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  onChange: (n: number) => void;
}) {
  return (
    <View style={s.stepRow}>
      <Text style={type.body}>{label}</Text>
      <View style={s.stepper}>
        <Pressable
          onPress={() => onChange(Math.max(min, value - 1))}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
          style={({ pressed }) => [s.stepBtn, pressed && { opacity: 0.6 }]}
        >
          <Text style={s.stepGlyph}>−</Text>
        </Pressable>
        <Text style={[type.numeral, s.stepValue]}>{value}</Text>
        <Pressable
          onPress={() => onChange(value + 1)}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
          style={({ pressed }) => [s.stepBtn, pressed && { opacity: 0.6 }]}
        >
          <Text style={s.stepGlyph}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvas },
  scroll: { padding: space.base, gap: space.base },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  stepBtn: {
    width: TOUCH_MIN,
    height: TOUCH_MIN,
    borderRadius: radius.sm,
    backgroundColor: color.petrolWash,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepGlyph: { fontSize: 22, color: color.petrol, fontWeight: '600', lineHeight: 26 },
  stepValue: { minWidth: 28, textAlign: 'center' },
  keyInput: {
    minHeight: TOUCH_PRIMARY,
    backgroundColor: color.canvas,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.line,
    paddingHorizontal: space.base,
    ...type.body,
    color: color.ink,
  },
});
