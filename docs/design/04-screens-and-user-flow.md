# 04 · Screens and User Flow

> **In simple words:** This page shows how the app looks and how a person moves through it, from sign-in to "brief ready". The pictures are rough boxes, not final design.

## Screens

| Screen | Who | Tag |
|---|---|---|
| Sign in | everyone | [THIS BUILD] (scaffold already has auth) |
| Rooms list | signed-in | [THIS BUILD] |
| Create room | signed-in | [THIS BUILD] |
| Room board (main) | members | [THIS BUILD] |
| Run panel (part of the board) | members | [THIS BUILD] |
| Card detail | members | [THIS BUILD] |
| Brief | members | [THIS BUILD] (stretch) |
| Members / settings | owner (members: read) | [THIS BUILD] |

## Wireframes

### Rooms list
```
+--------------------------------------------------+
| ScoutRoom                          [ + New room ] |
+--------------------------------------------------+
| Which vector DB in 2026?     owner    3 online    |
| Competitor scan: Acme        viewer   0 online    |
+--------------------------------------------------+
```

### Create room
```
+------------------------------------+
| New room                           |
| Title    [______________________]  |
| Question [______________________]  |
|          [______________________]  |
|              [Cancel] [Create]     |
+------------------------------------+
```

### Room board (main screen)
```
+-------------------------------------------------------------+
| Which vector DB in 2026?        online: Sam, Priya   [Brief] |
+----------------------+--------------------------------------+
| RUN PANEL            | EVIDENCE BOARD                       |
| Status: running      | +----------------+ +---------------+ |
| Runs left: 3 of 5    | | Claim...       | | Claim...      | |
| [Run agent] [Stop]   | | exa - web      | | scholar-paper | |
|                      | | conf: high     | | conf: medium  | |
| Steps:               | | Keep 2 Rej 0   | | Keep 0 Rej 1  | |
|  1 Plan        done  | | [Keep] [Reject]| | [Keep][Reject]| |
|  2 Search 1/4  done  | +----------------+ +---------------+ |
|  3 Search 2/4  ...   |                                      |
+----------------------+--------------------------------------+
```

### Card detail
```
+--------------------------------------------+
| Claim: "Qdrant supports hybrid search..."  |
| Source: example.com/post   (web)  [Open]   |
| Confidence: high    Found in run #2        |
| Quote: "..."                               |
| Votes: Keep 2 (Sam, Priya)  Reject 0       |
|              [Keep]  [Reject]              |
+--------------------------------------------+
```

### Brief (stretch)
```
+--------------------------------------------+
| Brief (from 6 kept cards)   [Write brief]  |
| We recommend X because ... [1]. Y is ...[3]|
| Sources: [1] Card "..." -> link            |
+--------------------------------------------+
```

### Members / settings
```
+--------------------------------------------+
| Members                  [Create invite]   |
| Sam (owner)                                |
| Priya  [researcher v]  [Remove]            |
| Lee    [viewer v]      [Remove]            |
| Budget: max runs [ 5 ]        [Save]       |
+--------------------------------------------+
```

## User flow: sign-in to "brief ready"

```mermaid
flowchart TD
  A[Sign in] --> B[Rooms list]
  B --> C[Create room + question]
  C --> D[Room board]
  D --> E[Owner creates invite link]
  E --> F[Teammates join as researcher or viewer]
  D --> G[Run agent]
  G --> H[Steps and cards appear live]
  H --> I[Team votes keep or reject]
  I --> J{Enough kept cards?}
  J -- no --> G
  J -- yes --> K[Write brief]
  K --> L[Brief ready with citations]
```

## States of the room board

| State | What the user sees |
|---|---|
| **Loading** | Skeleton cards and a "Connecting..." line while the live connection opens. |
| **Empty** (no run yet) | "No evidence yet. Run the agent to start." Run button for owner/researcher. Viewers see "Waiting for the team to run the agent." |
| **Running** | Run panel shows steps as they finish. Cards appear one by one. Stop button. |
| **Error: run failed** | Red banner with the reason in plain words and the steps that did finish. "Run again" if runs are left. |
| **Error: no access** | "You are not a member of this room." No data is loaded. |
| **Error: connection lost** | Small banner "Reconnecting..." The live connection reconnects by itself (DeepSpace does this). Data shown stays visible. |
| **Budget reached** | Run button disabled with "Run limit reached. Ask the owner." |
