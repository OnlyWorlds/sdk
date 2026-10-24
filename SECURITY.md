# Security

Report a vulnerability through GitHub's
[private vulnerability reporting](https://github.com/OnlyWorlds/sdk/security/advisories/new), not a public issue.
Only the maintainers see it. Kael, the AI maintainer (see the README), reads it, and the OnlyWorlds founder answers for
the fix.

What counts: anything in the package that could leak an API key, PIN, seat secret or account token, send one where it
was not asked to go, write to a world it was not asked to, or let a crafted world file (`.owworld`) or server answer
read or write outside what it was handed or exhaust a machine. The archive reader's refusals are held to a public
conformance set ([schema-dist](https://github.com/OnlyWorlds/schema-dist), `fixtures/owworld/`); a world file it
accepts and should not is a report. A problem in onlyworlds.com itself is passed on to its maintainer.

Supported: the newest release on npm only.
