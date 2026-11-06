## Production UI Policy

- Never expose development notes, roadmap notices,
  implementation plans or future-feature announcements
  in production-facing interfaces.

- Forbidden examples:
  "Coming soon"
  "Available later"
  "Data will appear here later"
  "This section is under development"
  "Feature will be added in the future"

- Do not render UI sections for features that have
  not been implemented or are not part of the current scope.

- Do not create fake functionality, mock statistics,
  fabricated user data or decorative placeholder widgets.

- If a feature is planned but not implemented,
  omit its UI entirely unless explicitly requested.

- Distinguish between:
  1. Unimplemented feature
  2. Implemented feature with no data
  3. Loading state
  4. Error state
  5. No search results

- Empty states are allowed only for implemented features
  when their data is genuinely absent.

- Before completion, audit all user-facing text for
  development-related messages and placeholder content.
