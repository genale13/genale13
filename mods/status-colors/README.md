# status-colors

A Claude Code mod that colors lines of Claude's replies by status:

- lines starting with ✅ are drawn green (positive answer, success, done and verified)
- lines starting with ❌ are drawn red (error, failure, issue)
- lines starting with ⚠️ are drawn yellow (unresolved, skipped, awaiting a decision)

Code blocks and unmarked text are left as they are. The mod only colors the
lines; the `CLAUDE.md` at the root of this repository asks Claude to write the
markers.

## Install

```
/plugin install status-colors --marketplace genale13/genale13
```

Answer `y` to add the marketplace, then pick a scope.

## Test

```
claude plugin test mods/status-colors
```
