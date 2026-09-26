# Architecture

```
Pull Request
    |
    v
GitHub Actions
    |
    +----> Central D1 control plane
    |        |
    |        +--> BUILDING / READY / FAILED
    |        +--> DELETING / DELETED
    |        +--> AI diagnosis state
    |
    +----> Cloudflare Worker Preview
    |        |
    |        +--> Preview URL
    |        +--> D1 isolated per PR
    |
    +----> Gemini diagnosis on failure
    |
    v
Production Dashboard
```

## Runtime states

`PENDING → BUILDING → READY → UPDATING → DELETING → DELETED`

`FAILED` is used when a Preview build/provisioning attempt fails.

## Data planes

**Control plane**

Central D1 database:

`instant-preview-control-plane`

Stores one row per PR with lifecycle status, commit, Preview URL, isolated D1 name, and AI diagnosis state.

**Preview data plane**

Each PR gets a dedicated D1 database:

`instant-preview-pr-<PR_NUMBER>`

and a Cloudflare Worker Preview:

`pr-<PR_NUMBER>-instant-preview-environments.film083oxf.workers.dev`

The database is reused across pushes to the same PR and deleted during cleanup.

## Dashboard

The dashboard Worker reads only the central D1 control plane. It does not call the GitHub API at runtime, avoiding GitHub API rate-limit dependency.
