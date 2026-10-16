import { Alert as NativeAlert, Platform, type AlertButton } from 'react-native';

/**
 * Alert.alert with a working web fallback.
 *
 * react-native-web ships Alert as a no-op, so on web a confirm dialog never appears and its
 * onPress never runs (the Order tab's "restock the pantry" button did nothing). On web this
 * maps a two-choice alert onto window.confirm and anything else onto window.alert. Native is
 * unchanged.
 */
function alert(title: string, message?: string, buttons?: AlertButton[]): void {
  if (Platform.OS !== 'web') {
    NativeAlert.alert(title, message, buttons);
    return;
  }
  const text = message ? `${title}\n\n${message}` : title;
  // Web shows at most two choices (OK and Cancel) and loses destructive styling. With two or more
  // buttons it always asks: the marked cancel button, or else the first, is the Cancel choice, so
  // a destructive action never runs without a yes.
  if (buttons && buttons.length >= 2) {
    const cancel = buttons.find((b) => b.style === 'cancel') ?? buttons[0]!;
    const action = buttons.find((b) => b !== cancel)!;
    if (window.confirm(text)) action.onPress?.();
    else cancel.onPress?.();
    return;
  }
  window.alert(text);
  buttons?.[0]?.onPress?.();
}

export const Alert = { alert };
