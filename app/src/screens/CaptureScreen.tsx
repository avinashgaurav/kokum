import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from '../components/alert';

import { color, radius, space, type, TOUCH_MIN, TOUCH_PRIMARY } from '../theme';
import { Button, Card, SectionLabel } from '../components/ui';
import { useStore } from '../store/useStore';
import { INGREDIENT_INDEX } from '../data/ingredients';
import { formatQuantity } from '../engine/scaling';
import type { Unit } from '../engine/types';
import { parseImage, parseText, type ParseSource, type ParsedLine } from '../ai/parse';

/**
 * Ingestion. Photo of a bill, photo of a list, photo of a shelf, or spoken/typed words.
 *
 * Voice uses the keyboard's own dictation button rather than a speech-recognition module.
 * That is a deliberate choice, not a shortcut: it needs no native dependency, works in
 * Expo Go, respects whatever language the user's keyboard is set to, and handles Hinglish
 * exactly as well as their phone already does.
 *
 * Every path lands on the confirm step. Nothing reaches the pantry unreviewed. See AGENTS.md.
 */

type Stage = 'choose' | 'speak' | 'working' | 'confirm';

interface Draft extends ParsedLine {
  keep: boolean;
}

const LOW_CONFIDENCE = 0.7;

export function CaptureScreen({ navigation }: { navigation: { goBack: () => void } }) {
  const { dispatch } = useStore();
  const [stage, setStage] = useState<Stage>('choose');
  const [spoken, setSpoken] = useState('');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [unparsed, setUnparsed] = useState<string[]>([]);
  const [source, setSource] = useState<ParseSource>('bill');

  async function pickAndParse(kind: 'bill' | 'list-photo' | 'shelf-photo', fromCamera: boolean) {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Kokum needs access to read your grocery list.');
      return;
    }

    const opts: ImagePicker.ImagePickerOptions = {
      base64: true,
      quality: 0.7,
      mediaTypes: ['images'],
    };
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync(opts)
      : await ImagePicker.launchImageLibraryAsync(opts);

    const asset = result.canceled ? null : result.assets[0];
    if (!asset?.base64) return;

    setSource(kind);
    setStage('working');
    const parsed = await parseImage(asset.base64, 'image/jpeg', kind);
    land(parsed);
  }

  async function speakAndParse() {
    if (!spoken.trim()) return;
    setSource('voice');
    setStage('working');
    land(await parseText(spoken, 'voice'));
  }

  function land(result: Awaited<ReturnType<typeof parseText>>) {
    if (!result.ok) {
      setStage('choose');
      Alert.alert(
        result.reason === 'no-key' ? 'No API key' : 'Could not read that',
        result.message,
      );
      return;
    }
    if (result.value.lines.length === 0) {
      setStage('choose');
      Alert.alert('Nothing found', 'No grocery items came out of that. Try a clearer photo.');
      return;
    }
    setDrafts(result.value.lines.map((l) => ({ ...l, keep: l.ingredientId !== null })));
    setUnparsed(result.value.unparsed);
    setStage('confirm');
  }

  function apply() {
    const lines = drafts
      .filter((d) => d.keep && d.ingredientId)
      .map((d) => ({
        ingredientId: d.ingredientId!,
        quantity: d.quantity,
        unit: d.unit,
        storage:
          INGREDIENT_INDEX.get(d.ingredientId!)?.cls === 'perishable'
            ? ('fridge' as const)
            : ('counter' as const),
      }));

    if (lines.length === 0) {
      navigation.goBack();
      return;
    }
    dispatch({ type: 'restock', lines, now: Date.now() });
    navigation.goBack();
  }

  if (stage === 'working') {
    return (
      <View style={[s.screen, s.center]}>
        <ActivityIndicator size="large" color={color.petrol} />
        <Text style={[type.title, { marginTop: space.base }]}>Reading your list</Text>
        <Text style={[type.body, { color: color.muted, marginTop: 4 }]}>
          {source === 'voice' ? 'Working out quantities' : 'Finding items and quantities'}
        </Text>
      </View>
    );
  }

  if (stage === 'confirm') {
    const flagged = drafts.filter((d) => d.keep && d.confidence < LOW_CONFIDENCE).length;
    return (
      <ScrollView style={s.screen} contentContainerStyle={s.scroll}>
        <View style={{ gap: 3 }}>
          <Text style={type.display}>Check this</Text>
          <Text style={[type.small, { color: color.muted }]}>
            {drafts.filter((d) => d.keep).length} items
            {flagged > 0 ? ` · ${flagged} worth a second look` : ' · all look right'}
          </Text>
        </View>

        <Text style={[type.body, { color: color.inkSoft }]}>
          Tap a quantity to change it, tap an item to drop it. Getting these right is what keeps
          the pantry honest later.
        </Text>

        {drafts.map((d, i) => (
          <DraftRow
            key={`${d.rawText}-${i}`}
            draft={d}
            onToggle={() =>
              setDrafts((prev) => prev.map((x, j) => (j === i ? { ...x, keep: !x.keep } : x)))
            }
            onQuantity={(q) =>
              setDrafts((prev) => prev.map((x, j) => (j === i ? { ...x, quantity: q } : x)))
            }
          />
        ))}

        {unparsed.length > 0 ? (
          <Card style={{ gap: space.sm }}>
            <SectionLabel>Not recognised</SectionLabel>
            <Text style={[type.body, { color: color.inkSoft }]}>{unparsed.join(', ')}</Text>
            <Text style={[type.small, { color: color.muted }]}>
              These are not in the ingredient dictionary yet, so they were left out rather than
              guessed at.
            </Text>
          </Card>
        ) : null}

        <View style={{ gap: space.sm, marginTop: space.sm }}>
          <Button label={`Add ${drafts.filter((d) => d.keep).length} items`} onPress={apply} />
          <Button label="Cancel" variant="quiet" onPress={() => navigation.goBack()} />
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>
    );
  }

  if (stage === 'speak') {
    return (
      <ScrollView style={s.screen} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 3 }}>
          <Text style={type.display}>Say what you bought</Text>
          <Text style={[type.small, { color: color.muted }]}>
            Tap the microphone on your keyboard and talk, or type it
          </Text>
        </View>

        <TextInput
          value={spoken}
          onChangeText={setSpoken}
          placeholder="do kilo aata, ek litre doodh, dhaniya, paneer 200 gram"
          placeholderTextColor={color.muted}
          style={s.speech}
          multiline
          autoFocus
          textAlignVertical="top"
          accessibilityLabel="Dictate or type your grocery list"
        />

        <Text style={[type.small, { color: color.muted }]}>
          Hinglish is fine. Kilos, litres, packets and words like pav or dedh all work.
        </Text>

        <View style={{ gap: space.sm }}>
          <Button label="Read this" onPress={speakAndParse} disabled={!spoken.trim()} />
          <Button label="Back" variant="quiet" onPress={() => setStage('choose')} />
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.scroll}>
      <View style={{ gap: 3 }}>
        <Text style={type.display}>Add groceries</Text>
        <Text style={[type.small, { color: color.muted }]}>
          Everything goes through a check before it reaches your pantry
        </Text>
      </View>

      <Option
        title="Photo of the bill"
        body="The best one. A delivery invoice has exact items and quantities, so almost nothing needs correcting."
        badge="Most accurate"
        onPress={() => pickAndParse('bill', true)}
        onAlt={() => pickAndParse('bill', false)}
      />
      <Option
        title="Photo of a list"
        body="Handwritten or typed, in any script. Quantities are often missing, so expect a few taps."
        onPress={() => pickAndParse('list-photo', true)}
        onAlt={() => pickAndParse('list-photo', false)}
      />
      <Option
        title="Photo of the shelf"
        body="Snap the fridge or counter. Tells us what you have, but not how much, so everything comes in low-confidence."
        onPress={() => pickAndParse('shelf-photo', true)}
        onAlt={() => pickAndParse('shelf-photo', false)}
      />
      <Option
        title="Say it out loud"
        body="Use your keyboard's microphone. Hinglish, kilos, packets, all handled."
        onPress={() => setStage('speak')}
      />

      <Button label="Cancel" variant="quiet" onPress={() => navigation.goBack()} />
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function Option({
  title,
  body,
  badge,
  onPress,
  onAlt,
}: {
  title: string;
  body: string;
  badge?: string;
  onPress: () => void;
  onAlt?: () => void;
}) {
  return (
    <Card style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Text style={[type.subtitle, { flex: 1 }]}>{title}</Text>
        {badge ? (
          <View style={s.badge}>
            <Text style={s.badgeText}>{badge.toUpperCase()}</Text>
          </View>
        ) : null}
      </View>
      <Text style={[type.small, { color: color.muted }]}>{body}</Text>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <View style={{ flex: 1 }}>
          <Button label={onAlt ? 'Camera' : 'Open'} onPress={onPress} variant="secondary" />
        </View>
        {onAlt ? (
          <View style={{ flex: 1 }}>
            <Button label="Choose photo" onPress={onAlt} variant="secondary" />
          </View>
        ) : null}
      </View>
    </Card>
  );
}

function DraftRow({
  draft,
  onToggle,
  onQuantity,
}: {
  draft: Draft;
  onToggle: () => void;
  onQuantity: (q: number) => void;
}) {
  const ing = draft.ingredientId ? INGREDIENT_INDEX.get(draft.ingredientId) : undefined;
  const unsure = draft.confidence < LOW_CONFIDENCE;
  const step = stepFor(draft.unit, draft.quantity);

  return (
    <Card
      style={{
        gap: space.sm,
        opacity: draft.keep ? 1 : 0.45,
        borderLeftWidth: 3,
        borderLeftColor: !draft.keep
          ? color.line
          : unsure
            ? color.stateNeed
            : color.stateCook,
      }}
    >
      <Pressable onPress={onToggle} accessibilityRole="button" style={{ gap: 2 }}>
        <Text style={type.subtitle}>{ing?.name ?? draft.rawText}</Text>
        <Text style={[type.small, { color: color.muted }]}>
          heard as "{draft.rawText}"{unsure ? ' · not sure about this one' : ''}
        </Text>
      </Pressable>

      <View style={s.qtyRow}>
        <Pressable
          onPress={() => onQuantity(Math.max(step, draft.quantity - step))}
          accessibilityLabel="Less"
          style={({ pressed }) => [s.qtyBtn, pressed && { opacity: 0.6 }]}
        >
          <Text style={s.qtyGlyph}>−</Text>
        </Pressable>
        <Text style={[type.numeral, s.qtyValue]}>
          {formatQuantity(draft.quantity, draft.unit)}
        </Text>
        <Pressable
          onPress={() => onQuantity(draft.quantity + step)}
          accessibilityLabel="More"
          style={({ pressed }) => [s.qtyBtn, pressed && { opacity: 0.6 }]}
        >
          <Text style={s.qtyGlyph}>+</Text>
        </Pressable>
        <Text style={[type.small, { color: color.muted, marginLeft: 'auto' }]}>
          {draft.keep ? 'tap name to drop' : 'dropped'}
        </Text>
      </View>
    </Card>
  );
}

/** Steps that match how people actually buy things, rather than a fixed increment. */
function stepFor(unit: Unit, current: number): number {
  if (unit === 'piece' || unit === 'bunch') return 1;
  if (current >= 1000) return 500;
  if (current >= 200) return 100;
  return 50;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvas },
  scroll: { padding: space.base, gap: space.base },
  center: { alignItems: 'center', justifyContent: 'center' },
  speech: {
    minHeight: 150,
    backgroundColor: color.card,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.line,
    padding: space.base,
    ...type.body,
    lineHeight: 24,
    color: color.ink,
  },
  badge: {
    backgroundColor: color.stateCookWash,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  badgeText: { ...type.label, fontSize: 9.5, color: color.stateCook },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  qtyBtn: {
    width: TOUCH_MIN,
    height: TOUCH_MIN,
    borderRadius: radius.sm,
    backgroundColor: color.petrolWash,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyGlyph: { fontSize: 22, color: color.petrol, fontWeight: '600', lineHeight: 26 },
  qtyValue: { minWidth: 84, textAlign: 'center' },
});
