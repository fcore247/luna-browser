# Luna Search with Tavily

Luna Browser 1.3.1 adds Tavily to Luna Search.
Tavily is the first recommended provider during setup. Brave remains available,
and Google works without an API key. Existing configured Brave profiles keep their
provider until the user switches it.

Choose a provider in **Settings → Search** or the guided setup. Tavily and Brave
keys are stored separately in the existing protected backend secret store. Keys
are not returned to the frontend. Search results stay in Luna Search.

## Free allowance

Tavily currently offers 1,000 free credits per month, with no credit card required.
A basic search costs one credit. An account and API key are still required.
Further usage depends on the user's Tavily plan. Luna always explicitly requests
basic search with automatic parameter selection disabled; it does not select a
more expensive advanced search in the background.

Verified 28 October 2026:
- https://docs.tavily.com/documentation/api-credits
- https://docs.tavily.com/documentation/api-reference/endpoint/search

Create your account and key at https://app.tavily.com/home, then paste the key into
Luna's setup. The dashboard opens in a native Luna tab. A new copy made while the
active provider page is exactly https://app.tavily.com/home is inserted into the
key field automatically, just like Brave. Earlier clipboard contents and copies
from other pages are ignored. Saving still requires an explicit click or Enter.

## Implementation and limits

The backend sends an authenticated HTTPS POST to Tavily, requests up to 20 web
results, and adapts them to the existing sanitized Luna result format. Tavily does
not offer offset pagination, so Luna does not show a fake next page or spend
another credit to repeat the same results. Tavily results do not populate Brave's
separate video/news/FAQ blocks. Result text is sanitized and non-HTTP(S) links are
rejected. Provider error bodies are never displayed or logged by this client.

The redesigned provider cards support keyboard selection. Custom dropdowns keep
native form values, with styled listboxes, checkmarks, type-ahead, arrow keys,
Home/End, Enter, Escape, and a fallback for engines without the Popover API.

## Tests and build

Use the build instructions in README.en.md. The release version is `1.3.1`. The Windows package needs both its EXE and the `native`
folder; Windows support remains experimental. macOS source is included but needs
a Mac for compilation and runtime verification.

New backend tests cover the Tavily request contract, response sanitization,
credential-safe errors, separate keys and persisted provider choice. New browser
tests cover provider switching, free-plan copy, Google without a key, dropdowns,
and the fully bundled production startup. No live Tavily search was made without
the user's API key; HTTP tests use a local fixture server.
