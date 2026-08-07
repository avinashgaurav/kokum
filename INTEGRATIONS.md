# Ordering integrations

Code: `app/src/integrations/order.ts`.

---

## The honest verdict

**None of Zepto, Blinkit, Swiggy Instamart, Swiggy or Zomato exposes a public ordering or
cart-building API.** There is no partner programme a solo app can join to build carts
programmatically in any of them.

Anything that appears to do this is calling their private endpoints. That breaks their terms
of service, breaks on every one of their releases, and risks the user's account. Kokum does
not do it, and a PR that adds it will be rejected regardless of how well it works on the day.

What is available and legitimate:

| Platform | Mechanism | Verdict |
|---|---|---|
| Zepto | Universal link / `zepto://` search | Deep-link only |
| Blinkit | Universal link / legacy `grofers://` search | Deep-link only |
| Swiggy Instamart | Universal link / `swiggy://` search | Deep-link only |
| Swiggy (food) | Universal link / `swiggy://` dish search | Deep-link only |
| Zomato | Universal link / `zomato://` dish search | Deep-link only |
| BigBasket | Search URL, historical affiliate programme | Deep-link; affiliate worth checking |
| Amazon Fresh / Amazon.in | Multi-item cart-add URL, Product Advertising API | The only real programmatic cart path |

The Amazon path is genuinely different: `amazon.in` supports building a multi-item cart from a
URL, and there is a documented affiliate API. It is the one place a real "add all of this to a
cart" button could exist. It is not built, because Amazon Fresh coverage does not match
10-minute delivery in most Indian cities, which is what people actually use.

---

## `[VERIFY]` on every URL

Every scheme in `order.ts` carries `verified: false` and a `[VERIFY]` note at the top of the
file. They come from training knowledge, not from a device test, and quick-commerce apps
change them without notice.

**This has never been tested on a real handset.** That is the single largest unverified claim
in the codebase. Before shipping, and again every release, run the harness below.

### Device harness

For each provider, on a real phone with the app installed and again with it uninstalled:

1. Tap an item in the Order tab
2. Record: opened the right app / opened the app on the wrong screen / fell back to web /
   dead tap
3. Note the OS and app version

Record the results in a dated table in this file. A scheme that fails should be removed from
`appUrl` rather than left to fail silently, since the web fallback works.

| Date | Platform | iOS app | Android app | Web fallback | Notes |
|---|---|---|---|---|---|
| _not yet run_ | | | | | |

---

## How degradation works

```
openSearch(provider, query)
  1. canOpenURL(appUrl)  →  openURL(appUrl)      the app, on the right search
  2. otherwise           →  openURL(webUrl)      a browser page that always works
  3. otherwise           →  false                caller shows Copy list
```

A broken scheme degrades to a browser page, never to a dead tap. On iOS, `canOpenURL` throws
unless the scheme is declared in `LSApplicationQueriesSchemes`, which is why `app.json`
declares `zepto`, `grofers`, `blinkit`, `swiggy` and `zomato`, and why the call is wrapped in
a try.

---

## The shipped UX

1. Review the Next order list, grouped by aisle with quantities rolled up
2. Pick a platform once
3. The list becomes a checklist. Tap an item, their app opens on that search, you add it,
   come back, it ticks off.
4. **Copy list** and **Share** for anything that accepts pasted text
5. *Don't want to cook* deep-links Swiggy or Zomato for the finished dish instead

The Order screen says this out loud: *"No grocery app lets us build your cart for you, so this
is the honest version."* Users forgive a limitation they understand and resent one that is
hidden from them.

Everything sits behind the `OrderProvider` interface, so a real partner API can be dropped in
per platform later without touching a screen.

---

## Bill-back: the loop that actually matters

Automating the cart is blocked. **Automating the reconciliation is not, and is worth more.**

Every grocery order produces an invoice with exact items, quantities and prices. Photograph it,
and `parseImage(..., 'bill')` restocks the entire pantry at full confidence in one action.

This is built and working. It is the single highest-value feature in the app, and it exists
precisely *because* the cart API does not:

- The two moments that matter are **what arrived** and **what got cooked**. Both are now
  captured with near-zero effort.
- Neither depends on a partnership, an approval, or a scheme that can change next Tuesday.
- A bill is the highest-quality input the parser ever gets: exact names, exact quantities,
  exact prices.

The Order screen's *"I ordered these, restock the pantry"* button is the manual version of the
same loop, for when you did not keep the bill.

---

## What is not built

- **Live price comparison.** Would need real APIs.
- **Automatic bill capture from email or SMS.** Technically possible by forwarding to an
  address the app watches, but it needs a server, which the app does not currently have.
- **Amazon multi-item cart.** The one legitimate programmatic path, unbuilt for the coverage
  reason above.
- **Affiliate revenue.** BigBasket and Amazon both have programmes. Not pursued.
