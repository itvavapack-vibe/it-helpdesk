---
name: create-skill
description: 'Help the user create a reusable workspace skill (SKILL.md) for VS Code agent customization.'
argument-hint: What should this skill produce?
---

# Create Skill

This skill guides the author through creating a new `SKILL.md` file that packages a workflow and can be used as a reusable Copilot skill.

## What this skill does

- clarifies the desired outcome for the new skill
- determines whether it should be workspace-scoped or user-scoped
- chooses the right customization primitive for the task
- drafts the skill frontmatter and body content
- validates the final skill structure and location

## Use when

- you want to create a new `SKILL.md` that encapsulates a repeatable workflow
- you need a workspace-scoped skill that helps developers follow a process
- you want a structured authoring template for Copilot custom skills

## Workflow

1. Ask the user what the new skill should produce.
2. Confirm whether the skill is workspace-scoped or personal.
3. Identify the target file location and naming convention.
4. Draft the new `SKILL.md` with a clear description and step-by-step guidance.
5. Verify YAML frontmatter, description, and path.

## Example prompt

- `Create a SKILL.md that helps generate release notes from commit history.`
- `Draft a workspace skill for reviewing new feature PRs against our checklist.`
- `Build a skill that guides authors to write code review summaries.`

## Notes

- Workspace skills should live under `.github/skills/<name>/SKILL.md`.
- Use descriptive `description` text so the agent can discover the skill.
- Keep the workflow concise and actionable.
