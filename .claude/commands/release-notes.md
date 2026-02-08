# Release Notes Generator

Generate short, dense release notes for changes from staging to main.

## Instructions

1. Get the diff between main and staging:

   - Run: `git fetch origin && git log origin/main..origin/staging --oneline --no-decorate`
   - Review commit messages for context

2. Generate concise release notes following this format:

   - Group by category (Features, Improvements, Fixes, Technical)
   - Each item is 1 line max
   - Focus on user-facing changes
   - Skip internal refactors unless significant
   - Use present tense ("Add", "Fix", "Improve")
   - No emojis, no marketing language

3. Output format:

```
## Release Notes - [Date]

### Features
- One-line description of what users can now do

### Improvements
- One-line description of enhancement

### Fixes
- One-line description of bug fixed

### Technical
- One-line description of significant internal change (if any)
```

4. Keep total length under 15 lines. Prioritize user impact over technical details.

5. Save to `.scratch/release-notes-[date].md`
