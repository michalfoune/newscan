---
name: No unsolicited git commits or pushes
description: Never commit or push to git unless the user explicitly asks. User handles all git operations themselves.
type: feedback
---

Do not run `git add`, `git commit`, or `git push` unless the user explicitly asks for it.

**Why:** User was surprised when I started pushing to git during a debugging session without being asked. They handle all git operations themselves.

**How to apply:** Make code edits freely, but stop at the file changes. Never stage, commit, or push on their behalf unless they say "commit this" or "push this."
