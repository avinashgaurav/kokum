import { Linking } from 'react-native';

/**
 * Ordering handoff. See INTEGRATIONS.md and DECISIONS.md D-002.
 *
 * None of these platforms exposes a public ordering or cart-building API. Deep-link search
 * handoff is the only ToS-safe path: we open their app on the right search, the user taps
 * add, and comes back. Everything is behind this interface so a real partner API can be
 * dropped in per platform later without touching a screen.
 *
 * [VERIFY] Every URL below comes from training knowledge, not from a device test.
 * Quick-commerce apps change schemes without notice. Run the harness in
 * scripts/verify-deeplinks.md on a real handset before shipping, and again every release.
 */

export type ProviderId = 'zepto' | 'blinkit' | 'instamart' | 'bigbasket';
export type FoodProviderId = 'swiggy' | 'zomato';

export interface OrderProvider {
  id: ProviderId | FoodProviderId;
  label: string;
  /** App scheme attempted first. */
  appUrl: (query: string) => string;
  /** Universal link used when the app is not installed. Always works in a browser. */
  webUrl: (query: string) => string;
  verified: false;
}

const q = encodeURIComponent;

export const GROCERY_PROVIDERS: Record<ProviderId, OrderProvider> = {
  zepto: {
    id: 'zepto',
    label: 'Zepto',
    appUrl: (s) => `zepto://search?query=${q(s)}`,
    webUrl: (s) => `https://www.zeptonow.com/search?query=${q(s)}`,
    verified: false,
  },
  blinkit: {
    id: 'blinkit',
    label: 'Blinkit',
    appUrl: (s) => `grofers://search?q=${q(s)}`,
    webUrl: (s) => `https://blinkit.com/s/?q=${q(s)}`,
    verified: false,
  },
  instamart: {
    id: 'instamart',
    label: 'Instamart',
    appUrl: (s) => `swiggy://instamart/search?query=${q(s)}`,
    webUrl: (s) => `https://www.swiggy.com/instamart/search?custom_back=true&query=${q(s)}`,
    verified: false,
  },
  bigbasket: {
    id: 'bigbasket',
    label: 'BigBasket',
    appUrl: (s) => `bigbasket://search?q=${q(s)}`,
    webUrl: (s) => `https://www.bigbasket.com/ps/?q=${q(s)}`,
    verified: false,
  },
};

export const FOOD_PROVIDERS: Record<FoodProviderId, OrderProvider> = {
  swiggy: {
    id: 'swiggy',
    label: 'Swiggy',
    appUrl: (s) => `swiggy://search?query=${q(s)}`,
    webUrl: (s) => `https://www.swiggy.com/search?query=${q(s)}`,
    verified: false,
  },
  zomato: {
    id: 'zomato',
    label: 'Zomato',
    appUrl: (s) => `zomato://search?q=${q(s)}`,
    webUrl: (s) => `https://www.zomato.com/india/delivery?q=${q(s)}`,
    verified: false,
  },
};

/**
 * Try the app, fall back to the web link. A broken scheme degrades to a browser page,
 * never to a dead tap.
 */
export async function openSearch(provider: OrderProvider, query: string): Promise<boolean> {
  const app = provider.appUrl(query);
  try {
    if (await Linking.canOpenURL(app)) {
      await Linking.openURL(app);
      return true;
    }
  } catch {
    // canOpenURL throws on iOS when the scheme is not declared in LSApplicationQueriesSchemes.
  }
  try {
    await Linking.openURL(provider.webUrl(query));
    return true;
  } catch {
    return false;
  }
}

/** Plain text for the Copy list and Share buttons, for apps that accept pasted input. */
export function listAsText(lines: { name: string; qty: string }[]): string {
  return lines.map((l) => `${l.name} - ${l.qty}`).join('\n');
}
