# Security policy

Cockroach Smash is a small hobby project and a testbed for invisible-prompt
defenses. Reports are welcome.

## Reporting a vulnerability

Please report privately through GitHub: **Security** tab of this repository →
**Report a vulnerability**. Do not open a public issue for security problems.

Include what you did, what you expected, and what happened. For text that gets
through the filters, give the code points (for example `U+E0041`), not the raw
characters.

## In scope

- Text that reaches storage or other players with hidden or direction-changing
  characters still in it
- Reading a complaint without smashing its cockroach
- Changing data outside the game rules (counts, other people's cockroaches,
  the Hall of fame)
- Getting code to run in other players' browsers
- Hidden characters in this repository's files

## Out of scope

- Visible prompt injection (instructions in plain words): it cannot be filtered
  and is a known limit
- Rude or offensive complaints: moderation, not security
- Creating several anonymous identities (private windows): a known limit of
  playing without accounts
- Denial of service, spamming the live site, or tests that leave lasting data

## Testing against the live site

Use `npm run test:live`: it uses only the public key, behaves like one visitor and
cleans up after itself. Please do not flood the live site; run the local suite
(`npm test`) for anything heavy.
