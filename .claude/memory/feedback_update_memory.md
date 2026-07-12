---
name: always-update-memory-after-changes
description: "Always update memory files after every code change, without being asked"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 19d5c8a1-c885-4a13-a043-829744e75788
---

After every code change — no matter how small — update the relevant memory files immediately before ending the response.

**Why:** User explicitly asked for this. Manually asking or reminding to update memory wastes time and breaks the workflow.

**How to apply:**
- After any feature addition or bug fix, identify which memory files are affected (booking_sheet_behaviour.md, design_decisions.md, vehicles_rates.md, project_context.md) and update them in the same response as the code change.
- Also update CLAUDE.md in the repo if the change affects permanent project-level documentation.
- No need to ask or announce — just do it as part of completing every task.
