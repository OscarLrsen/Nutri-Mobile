# Nutri Mobile

React Native (Expo, TypeScript, Expo Router) mobile client for Nutri — a
health-focused food-truck ordering platform. Built against the same
ASP.NET Core backend (`Nutri-Backend`) and the same Supabase project as the
existing web app (`Nutri-Frontend`).

**Status: infrastructure only.** No menu, checkout, payment, Nutri Anpassar,
profile, or order-history features exist yet. See
`../Nutri-Frontend/docs/nutri/NUTRI_MOBILE_TECHNICAL_SPECIFICATION_V1.md`
for the complete, verified backend contract and architecture recommendation
this app is built against — that document is the single source of truth for
every API/DTO/business-rule fact referenced in this codebase's comments.

## Getting started

```bash
npm install
cp .env.example .env.local   # already pre-filled with real dev values, see below
npm start
```

Then press `i` (iOS Simulator), `a` (Android Emulator), or scan the QR code
with the **Expo Go** app on a physical device.

### Backend connectivity (read this before you get a confusing network error)

`EXPO_PUBLIC_API_URL` in `.env.local` defaults to `http://localhost:5069`
(Nutri-Backend's local dev port). This works for the iOS Simulator. It will
**not** work for:

- **Android Emulator** — use `http://10.0.2.2:5069` instead.
- **A physical phone running Expo Go** — `localhost` on the phone refers to
  the phone itself, not your dev machine. Use your machine's LAN IP (e.g.
  `http://192.168.1.42:5069`) and make sure `Nutri-Backend`'s
  `AllowedOrigins` config includes it (it already has a LAN-IP example
  entry — see `Nutri-Backend/Program.cs`).

`EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` point at
the same single Supabase project the web app uses (`nutri-production` — there
is no separate staging Supabase instance). The publishable key is safe to
have in `.env.local`/`.env.example`; it's designed for client embedding
(same key already ships inside `Nutri-Frontend`'s public web bundle).

## Scripts

| Script | What it does |
|---|---|
| `npm start` | Start the Metro dev server (Expo Go compatible) |
| `npm run android` / `npm run ios` / `npm run web` | Start targeting a specific platform |
| `npm run lint` | ESLint (`eslint-config-expo` flat config) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run doctor` | `expo-doctor` — validates the whole Expo project config |

CI (`.github/workflows/ci.yml`) runs lint + typecheck on every push/PR,
mirroring `Nutri-Frontend`'s own `ci-cd.yml` pattern.

## Project structure

```
app/                 Expo Router — file-based routes
  _layout.tsx         Root layout: fonts, splash screen, all providers
  (tabs)/              Bottom-tab group: Meny · Varukorg · Mina sidor
  +not-found.tsx

components/
  ui/                 Design-system primitives (Button, Card, Badge, ThemedText, Screen)
  feedback/           Loading/Error/Empty states, app-wide ErrorBoundary

features/             Reserved for feature modules (empty — see features/README.md)

services/
  api/                Shared axios client + auth-aware interceptor
  auth/               Supabase RN client, AuthProvider, token-resolution helper
  storage/            SecureStore (auth) and AsyncStorage (general) wrappers

hooks/                Shared hooks (currently just a useAuth barrel)
lib/                  env.ts (Zod-validated env), queryClient.ts (TanStack Query)
constants/            Verified business-rule constants ported from the backend
theme/                Colors, typography, spacing, radius — ported from Nutri-Frontend
types/                Shared, feature-agnostic API types
utils/                money.ts (öre → kr formatting)
```

Every file above that ports a value or pattern from the web app links back
to the exact section of the technical spec it came from, in a comment —
if you're unsure whether something is real or invented, check that comment
first, then the spec, before assuming it's correct.

## Known environment quirks (not this project's fault, documented for the next person)

- `expo-doctor` will report a duplicate `react` install pulled in from
  `C:\Users\<you>\node_modules` — that's an **unrelated Vite project**
  (`nutri-react`) sitting directly in the Windows user home directory,
  outside this repo entirely. It doesn't affect Metro's actual bundling
  (verified via `npx expo export`), but if it ever becomes a real problem,
  the fix is on that unrelated project, not here.
- `npm install` requires `legacy-peer-deps=true` (already set in `.npmrc`)
  because `expo-router`'s web-only dependencies (`@radix-ui/*` via `vaul`)
  pin a `react-dom` peer range npm's strict resolver rejects otherwise. This
  is upstream, not a local misconfiguration.
