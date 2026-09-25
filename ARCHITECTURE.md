# Architecture — MVP

```
GitHub Pull Request
        |
        v
GitHub Actions
        |
        +----> wrangler preview --name pr-123
        |             |
        |             v
        |      Cloudflare Worker Preview
        |             |
        |             +--> Preview URL
        |
        +----> PR comment

PR closed
   |
   v
GitHub Actions
   |
   +----> wrangler preview delete --name pr-123

Failure
   |
   v
workflow_run
   |
   v
Gemini diagnosis (optional)
```

## State model to add later

PENDING → BUILDING → PROVISIONING → READY → UPDATING → DELETING → DELETED

FAILED is a terminal state for an individual deployment attempt, not necessarily for the whole PR environment.
