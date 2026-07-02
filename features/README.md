# features/

Reserved for feature-based modules in future phases (e.g. `features/meny/`,
`features/varukorg/`, `features/nutri-anpassar/`, `features/konto/`), each
owning its own screens' business logic, feature-local components, and
feature-local hooks — mirroring how Nutri-Frontend organizes its
`src/context/`, `src/components/`, and `src/app/<route>/` per feature area.

**Empty by design in this phase.** No menu, checkout, payment, Nutri
Anpassar, profile, or order-history logic exists yet — see
`NUTRI_MOBILE_TECHNICAL_SPECIFICATION_V1.md` in Nutri-Frontend's
`docs/nutri/` for the full backend contract each future feature module will
consume, and `app/(tabs)/` for the placeholder screens each feature will
eventually fill in.

Convention for when a feature module is added:

```
features/<name>/
├── screens/       # if a screen needs more than trivial JSX, extract it here
│                  # and keep app/(tabs)/<name>.tsx as a thin re-export
├── components/    # feature-local, non-shared components
├── hooks/         # feature-local hooks (e.g. useCart, useMenu)
├── api.ts         # feature-scoped API calls, using services/api/client.ts
└── types.ts       # feature-scoped DTOs, copied exactly from the spec — never invented
```
