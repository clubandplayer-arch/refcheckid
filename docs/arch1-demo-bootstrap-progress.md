# ARCH-1 Demo Bootstrap — Progress Tracker

This document is the official progress tracker for the ARCH-1 Demo Bootstrap milestones.

## Current status

Milestone 1 is complete.

## Milestone 1 — Progettazione dell'infrastruttura Demo Bootstrap

### Stato

Completed.

### Obiettivo raggiunto

Defined the official Demo Bootstrap infrastructure design for a reproducible ARCH-1 demo environment in a fresh Codespace. The design preserves the existing application workflows and explicitly forbids direct SQL/table/storage population.

### File modificati

- `docs/ARCH-1_Demo_Bootstrap_Design.md`
- `docs/arch1-demo-bootstrap-progress.md`

### Decisioni architetturali

- The bootstrap will be driven by one root command, planned as `pnpm demo:bootstrap`.
- Demo data will be centralized in a deterministic Demo Manifest.
- Demo photo assets will be versioned as input assets, but storage will be populated only through Upload Intent and Upload Complete.
- Federation Sync is the only allowed mechanism for creating non-photo domain demo data.
- Upload Intent, Upload Complete, and Federation Approval are the only allowed mechanisms for creating official demo photos.
- Verification must check both logical API state and physical storage object existence.
- Destructive reset is intentionally out of scope until an official demo reset workflow exists.

### Problemi risolti

- Documented the missing reproducible Codespace procedure as an explicit bootstrap architecture gap.
- Defined how to avoid the previous fragile state where database photo records and physical storage could diverge.
- Defined milestone boundaries so subsequent work can be implemented incrementally without changing existing production workflows.

### Test eseguiti

- `find .. -name AGENTS.md -print`
- `find docs refcheckid-docs -maxdepth 3 -type f | sort | sed -n '1,120p'`
- `git diff --check`
- `pnpm -s lint`

### TODO rimasti

- Milestone 2: implement the deterministic Demo Manifest and select the source of truth for demo data shared by Backend, Web, and Mobile.
- Milestone 3: implement the bootstrap runner orchestration.
- Milestone 4: implement official photo upload through Upload Intent and Upload Complete.
- Milestone 5: implement Federation Approval automation.
- Milestone 6: implement verification and doctor commands.
- Milestone 7: complete Backend/Web/Mobile integration validation.

## Milestone 2 — Implementazione del Demo Manifest

### Stato

Pending.

### Obiettivo

Define a deterministic dataset, remove duplication between Web and Backend demo data, identify the source of truth, and prepare asset loading.

## Milestone 3 — Implementazione del Demo Bootstrap Runner

### Stato

Pending.

### Obiettivo

Implement login for demo users, Federation Sync, and bootstrap orchestration.

## Milestone 4 — Workflow ufficiale Upload Photo

### Stato

Pending.

### Obiettivo

Implement Upload Intent and Upload Complete through public application endpoints only.

## Milestone 5 — Workflow Federation Approval

### Stato

Pending.

### Obiettivo

Automatically approve demo photos through the official federation approval workflow.

## Milestone 6 — Verification & Doctor

### Stato

Pending.

### Obiettivo

Implement API, storage, and database verification with final reporting and a doctor command.

## Milestone 7 — Integrazione finale

### Stato

Pending.

### Obiettivo

Validate the full demo environment across Backend, Web, and Mobile.
