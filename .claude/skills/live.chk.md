---
name: live.chk
description: Verify the current repo's site is actually live and serving the latest deploy
trigger: slash_command_and_auto
---
Detect this repo's deploy mechanism (GitHub Pages, Actions deploy workflow, or
other configured target). Verify deployment is enabled, verify the deploy
workflow ran successfully on the last commit, and verify the live URL responds
with 200. Report the live URL and last deploy timestamp. If no deploy target is
configured, say so.
