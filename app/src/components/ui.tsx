import React from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { color, radius, shadow, space, type, TOUCH_MIN, TOUCH_PRIMARY } from '../theme';
import type { DishAssessment } from '../engine/types';

/**
 * State is never encoded by colour alone. Each state carries a shape and a word as well,
 * so it survives colour blindness and a sunlit kitchen. See AGENTS.md.
 */
export function StateBadge({ assessment }: { assessment: DishAssessment }) {
  const { state, missing } = assessment;

  const spec =
    state === 'cook-now'
      ? { fg: color.stateCook, bg: color.stateCookWash, text: 'Cook now' }
      : state === 'need-items'
        ? {
            fg: color.stateNeed,
            bg: color.stateNeedWash,
            text: missing.length === 1 ? 'Need 1 item' : `Need ${missing.length} items`,
          }
        : { fg: color.stateCheck, bg: color.stateCheckWash, text: 'Check first' };

  return (
    <View style={[s.badge, { backgroundColor: spec.bg }]}>
      <View
        style={[
          s.dot,
          state === 'cook-now'
            ? { backgroundColor: spec.fg }
            : { borderWidth: 2, borderColor: spec.fg },
        ]}
      />
      <Text style={[s.badgeText, { color: spec.fg }]}>{spec.text}</Text>
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'quiet';
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        s.btn,
        variant === 'primary' && s.btnPrimary,
        variant === 'secondary' && s.btnSecondary,
        variant === 'quiet' && s.btnQuiet,
        pressed && { opacity: 0.82 },
        disabled && { opacity: 0.4 },
      ]}
    >
      <Text
        style={[
          s.btnText,
          variant === 'primary' ? { color: color.onPetrol } : { color: color.petrol },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      style={({ pressed }) => [s.chip, active && s.chipActive, pressed && { opacity: 0.8 }]}
    >
      <Text style={[s.chipText, active && { color: color.onPetrol }]}>{label}</Text>
    </Pressable>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text style={s.sectionLabel}>{String(children).toUpperCase()}</Text>;
}

/** Empty states always carry the next action. Never a dead end. */
export function Empty({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <Card style={{ gap: space.md, alignItems: 'flex-start' }}>
      <Text style={type.subtitle}>{title}</Text>
      <Text style={[type.body, { color: color.muted }]}>{body}</Text>
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} variant="secondary" />
      ) : null}
    </Card>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: color.card,
    borderRadius: radius.md,
    padding: space.base,
    borderWidth: 1,
    borderColor: color.lineSoft,
    ...shadow.card,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  badgeText: { ...type.label, fontSize: 10.5, letterSpacing: 0.9 },
  btn: {
    minHeight: TOUCH_PRIMARY,
    paddingHorizontal: space.lg,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: { backgroundColor: color.petrol },
  btnSecondary: { backgroundColor: color.petrolWash },
  btnQuiet: { backgroundColor: 'transparent', minHeight: TOUCH_MIN },
  btnText: { ...type.subtitle },
  chip: {
    minHeight: TOUCH_MIN - 8,
    justifyContent: 'center',
    paddingHorizontal: space.base,
    borderRadius: radius.pill,
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.line,
  },
  chipActive: { backgroundColor: color.petrol, borderColor: color.petrol },
  chipText: { ...type.body, color: color.inkSoft },
  sectionLabel: { ...type.label, color: color.muted },
});
