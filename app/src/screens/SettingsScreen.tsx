import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { color, radius, space, type, TOUCH_MIN, TOUCH_PRIMARY } from '../theme';
import { Button, Card, Chip, SectionLabel } from '../components/ui';
import { useStore } from '../store/useStore';
import type { Cooktop, Diet, Equipment, Observance } from '../engine/types';
import { RECIPE_INDEX } from '../data/recipes';
import { INGREDIENT_INDEX } from '../data/ingredients';
import { rupees, weekInsights } from '../engine/insights';
import {
  CLOUD_CONFIGURED,
  createInvite,
  currentSession,
  joinHousehold,
  type Invite,
  signIn,
  signOut,
  type CloudSession,
} from '../db/supabase';
import { syncPantry } from '../db/sync';
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

const OBSERVANCES: { id: Observance; label: string; note: string }[] = [
  { id: 'no-onion-garlic', label: 'No onion or garlic', note: 'Always on' },
  { id: 'navratri', label: 'Navratri vrat', note: 'No allium, no grain or pulses' },
  { id: 'shravan', label: 'Shravan', note: 'Vegetarian, no allium' },
  { id: 'ekadashi', label: 'Ekadashi', note: 'Vegetarian, no allium' },
];

const BUDGETS = [
  { label: 'Not tracked', paise: undefined },
  { label: 'Rs 1,500', paise: 150_000 },
  { label: 'Rs 2,500', paise: 250_000 },
  { label: 'Rs 4,000', paise: 400_000 },
];

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

      <Card style={{ gap: space.md }}>
        <SectionLabel>Fasting and festivals</SectionLabel>
        <View style={s.chips}>
          {OBSERVANCES.map((o) => (
            <Chip
              key={o.id}
              label={o.label}
              active={h.observances.includes(o.id)}
              onPress={() => set({ observances: toggle(h.observances, o.id) })}
            />
          ))}
        </View>
        <Text style={[type.small, { color: color.muted }]}>
          {h.observances.length === 0
            ? 'Turn one on and it filters every suggestion, the same way an allergy does.'
            : OBSERVANCES.filter((o) => h.observances.includes(o.id))
                .map((o) => `${o.label}: ${o.note.toLowerCase()}`)
                .join('. ') + '.'}
        </Text>
      </Card>

      <Card style={{ gap: space.md }}>
        <SectionLabel>Weekly grocery budget</SectionLabel>
        <View style={s.chips}>
          {BUDGETS.map((b) => (
            <Chip
              key={b.label}
              label={b.label}
              active={h.weeklyBudgetPaise === b.paise}
              onPress={() => set({ weeklyBudgetPaise: b.paise })}
            />
          ))}
        </View>
        <Text style={[type.small, { color: color.muted }]}>
          Estimated from what you cook, using rough retail prices. Useful as a direction, not
          as an accounting of what you actually spent.
        </Text>
      </Card>

      <SharingCard />

      <InsightsCard />

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
 * Household sharing.
 *
 * Optional in every sense: absent config, this card explains that and does nothing. The app
 * is local-first, so sync adds a second phone rather than becoming the source of truth. A
 * failed sync leaves the local pantry exactly as it was.
 */
function SharingCard() {
  const { state, dispatch } = useStore();
  const [session, setSession] = useState<CloudSession | null>(null);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [invite, setInvite] = useState<Invite | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    currentSession().then((sess) => {
      if (!cancelled) setSession(sess);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!CLOUD_CONFIGURED) {
    return (
      <Card style={{ gap: space.sm }}>
        <SectionLabel>Sharing with someone</SectionLabel>
        <Text style={[type.body, { color: color.inkSoft }]}>
          Not set up in this build. Kokum runs entirely on this phone, which is why everything
          else works with no account and no connection.
        </Text>
        <Text style={[type.small, { color: color.muted }]}>
          To share a pantry with someone, add a Supabase URL and anon key to .env and run the
          migrations in supabase/migrations.
        </Text>
      </Card>
    );
  }

  async function doSync() {
    setBusy(true);
    const result = await syncPantry({
      household: state.household,
      pantry: state.pantry,
      cookLog: state.cookLog,
      leftovers: state.leftovers,
    });
    if (result.ok && result.merged) {
      dispatch({ type: 'merge-pantry', pantry: result.merged });
    }
    setNote(result.message);
    setBusy(false);
  }

  return (
    <Card style={{ gap: space.md }}>
      <SectionLabel>Sharing with someone</SectionLabel>

      {session ? (
        <>
          <Text style={[type.body, { color: color.inkSoft }]}>
            Signed in as {session.email ?? 'your account'}.
          </Text>

          {session.householdId && session.role === 'owner' ? (
            <>
              <Text style={[type.small, { color: color.muted }]}>
                Invite whoever else cooks here. They enter the code on their phone. Each code
                works once and lasts 7 days.
              </Text>
              {invite ? (
                <Text selectable style={s.code}>
                  {invite.code}
                </Text>
              ) : null}
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                {(['member', 'cook'] as const).map((role) => (
                  <Button
                    key={role}
                    label={role === 'member' ? 'Invite a member' : 'Invite a cook'}
                    variant="secondary"
                    disabled={busy}
                    onPress={async () => {
                      setBusy(true);
                      const r = await createInvite(session.householdId!, role);
                      if (r.ok) {
                        setInvite(r.invite);
                        setNote(null);
                      } else {
                        setNote(r.message);
                      }
                      setBusy(false);
                    }}
                  />
                ))}
              </View>
            </>
          ) : null}

          <Button label={busy ? 'Syncing' : 'Sync now'} onPress={doSync} disabled={busy} />

          <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="Invite code"
              placeholderTextColor={color.muted}
              style={[s.keyInput, { flex: 1 }]}
              autoCapitalize="characters"
              autoCorrect={false}
              accessibilityLabel="Invite code to join another household"
            />
            <Button
              label="Join"
              variant="secondary"
              disabled={!code.trim() || busy}
              onPress={async () => {
                setBusy(true);
                const r = await joinHousehold(code.trim());
                setNote(r.message);
                if (r.ok) setSession(await currentSession());
                setCode('');
                setBusy(false);
              }}
            />
          </View>

          <Button
            label="Sign out"
            variant="quiet"
            onPress={async () => {
              await signOut();
              setSession(null);
              setInvite(null);
              setNote(null);
            }}
          />

          <Text style={[type.small, { color: color.muted }]}>
            When two phones disagree about an item, the more recent look at the kitchen wins.
            Nothing is merged behind your back.
          </Text>
        </>
      ) : (
        <>
          <Text style={[type.body, { color: color.inkSoft }]}>
            Sign in to share one pantry across phones, so whoever gets home first can mark the
            paneer finished.
          </Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={color.muted}
            style={s.keyInput}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            accessibilityLabel="Email for a sign-in link"
          />
          <Button
            label="Email me a link"
            disabled={!email.trim() || busy}
            onPress={async () => {
              setBusy(true);
              const r = await signIn(email);
              setNote(r.message);
              setBusy(false);
            }}
          />
        </>
      )}

      {note ? <Text style={[type.small, { color: color.petrol }]}>{note}</Text> : null}
    </Card>
  );
}

/**
 * The weekly read: nutrition, spend and waste.
 *
 * Every number here is a heuristic derived from the cook log and shelf-life clocks, not a
 * measurement, and the copy says so. When there is not enough logged cooking to say anything
 * honest, the headline is null and this card says that rather than inventing an observation.
 */
function InsightsCard() {
  const { state } = useStore();
  const now = Date.now();

  const insights = useMemo(
    () =>
      weekInsights(
        state.cookLog,
        RECIPE_INDEX,
        INGREDIENT_INDEX,
        state.pantry,
        state.household,
        now,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.cookLog, state.pantry, state.household],
  );

  if (insights.daysCooked === 0) {
    return (
      <Card style={{ gap: space.sm }}>
        <SectionLabel>This week</SectionLabel>
        <Text style={[type.body, { color: color.muted }]}>
          Nothing logged yet. Tap "I cooked this" on Today and this fills in.
        </Text>
      </Card>
    );
  }

  return (
    <Card style={{ gap: space.md }}>
      <SectionLabel>This week</SectionLabel>

      <View style={s.statRow}>
        <Stat label="Days cooked" value={String(insights.daysCooked)} />
        <Stat label="Cuisines" value={String(insights.varietyCount)} />
        <Stat
          label="Protein / day"
          value={insights.proteinPerAdultPerDay > 0 ? `${insights.proteinPerAdultPerDay} g` : 'Not yet'}
        />
      </View>

      <View style={s.statRow}>
        <Stat
          label="Kcal / day"
          value={insights.kcalPerAdultPerDay > 0 ? String(insights.kcalPerAdultPerDay) : 'Not yet'}
        />
        <Stat label="Groceries used" value={rupees(insights.spentPaise)} />
        <Stat
          label="Went off"
          value={insights.wastedPaise > 0 ? rupees(insights.wastedPaise) : 'None'}
        />
      </View>

      {insights.headline ? (
        <Text style={[type.body, { color: color.inkSoft }]}>{insights.headline}</Text>
      ) : (
        <Text style={[type.small, { color: color.muted }]}>
          Not enough cooking logged this week to say anything useful yet.
        </Text>
      )}

      {insights.wasted.length > 0 ? (
        <Text style={[type.small, { color: color.muted }]}>
          Past its date:{' '}
          {insights.wasted
            .slice(0, 4)
            .map((w) => INGREDIENT_INDEX.get(w.ingredientId)?.name.toLowerCase() ?? w.ingredientId)
            .join(', ')}
          . This is an estimate from shelf-life dates, so something you ate and never confirmed
          will show up here too.
        </Text>
      ) : null}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={[type.numeral, { fontSize: 19 }]}>{value}</Text>
      <Text style={[type.small, { color: color.muted, fontSize: 11.5 }]}>{label}</Text>
    </View>
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
  statRow: { flexDirection: 'row', gap: space.md },
  code: {
    fontFamily: 'Courier',
    fontSize: 13,
    color: color.petrol,
    backgroundColor: color.petrolWash,
    padding: space.md,
    borderRadius: radius.sm,
  },
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
