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
  const cancel = buttons?.find((b) => b.style === 'cancel');
  const action = buttons?.find((b) => b.style !== 'cancel');
  if (cancel && action) {
    if (window.confirm(text)) action.onPress?.();
    else cancel.onPress?.();
    return;
  }
  window.alert(text);
  (action ?? cancel)?.onPress?.();
}

export const Alert = { alert };
