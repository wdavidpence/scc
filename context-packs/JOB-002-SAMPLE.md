# Ticket: JOB-002-SAMPLE
Spec: Fix confirmed pathfinding.js:94 array-destructuring failure

## DONE-WHEN
node scripts/verify-pathfinding.cjs exits 0

## Exact Owned Files
- src2/engine/pathfinding.js
- scripts/verify-pathfinding.cjs

## Required Interface Signatures
- NavGrid.findPath
- NavGrid.walkable

## Existing Failing Test & Command
Command: node scripts/verify-pathfinding.cjs
```
TypeError: Cannot read properties of undefined (reading 'get')
    at NavGrid.findPath (src2/engine/pathfinding.js:110:20)
FAIL: pathfinding A* search aborted at node 0
```

## Dependencies
- JOB-000

## Diff Cap
400 lines

## Forbidden Scope
- Do not modify source outside owned files, existing tests, images, config, git, DIGEST.md, or STARCRAFT_TEARDOWN.md
