# Sentry privacy policy

**Last updated: November 24, 2026**

## Summary

- Sentry only checks a page when you click its icon. It never watches your browsing.
- Your full web address never leaves your browser. Only a scrambled, partial piece of it is
  sent out, to check against a known-bad list.
- No tracking, no analytics, no accounts.
- Nothing is sold or shared with anyone.

No check is perfect. Sentry can miss a bad page or flag a safe one, so use your own judgment too.

## When Sentry runs

Sentry only runs when you click the Sentry icon in your toolbar. It looks at the address of the
page open in your current tab at that moment, and nothing else. It does not run in the
background, and it does not watch, log, or react to pages you visit unless you click the icon.

## What leaves your browser, and where it goes

| Service               | What is sent                                                                      | Why                                                              |
| --------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Our Cloudflare Worker | A scrambled (hashed), 4-byte piece of the page's address — never the full address | Relays the check to Google Safe Browsing and compares the result |
| Google Safe Browsing  | The same 4-byte hashed pieces, relayed by our Worker                              | To check whether the page is a known phishing or malware site    |

That's the only outside service Sentry talks to today. The comparison that decides whether your
page matches anything is finished inside your browser — Google and our Worker never see your
full address.

## What stays in your browser

The page's full address, and the final result of comparing it against Safe Browsing's answer,
never leave your browser. Sentry also runs a couple of basic checks (like noticing a bare number
address instead of a name) entirely on your device.

Sentry does not currently save a history of pages you've checked, and it has no settings to turn
on or off. Each time you click the icon, it starts fresh.

## What we don't collect or do

- We don't track which sites you visit.
- We don't use analytics, ads, or any error-reporting service.
- We don't read or send the content of the page you're on — only its address.
- We don't create accounts or ask you to sign in.
- We don't sell or share anything with anyone.

## Permissions and why

| Permission  | Why Sentry needs it                                                                        |
| ----------- | ------------------------------------------------------------------------------------------ |
| `activeTab` | Lets Sentry see the address of the page you're on — only for the moment you click its icon |

Sentry does not ask for access to your browsing history, your tabs in general, or any site you
haven't actively asked it to check.

## Third-party services

- **Google Safe Browsing** — Sentry checks pages against Google's list of known unsafe sites.
  When a page matches, the result is shown as "Advisory provided by Google." See
  [Google's Privacy Policy](https://policies.google.com/privacy).
- **Cloudflare** — our Worker, which relays the Safe Browsing check, runs on Cloudflare. See
  [Cloudflare's Privacy Policy](https://www.cloudflare.com/privacypolicy/).

## Chrome Web Store Limited Use disclosure

The information Sentry handles is used only for its single purpose: checking whether the current
page or a link is phishing or malware. It is not transferred or sold to third parties, and it is
not used for advertising, creditworthiness, or lending decisions. Sentry's use of this
information complies with the Chrome Web Store User Data Policy, including its Limited Use
requirements.

## Children

Sentry is not directed at children and does not knowingly collect personal information from
anyone.

## Changes to this policy

If this policy changes, the update will be posted on this page with a new "Last updated" date.

## Contact

Questions about this policy can be sent to the Western Cyber Society (WCS) team at
[TODO: WCS CONTACT EMAIL].
