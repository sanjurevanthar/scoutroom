# 03 · Roles and Permissions

> **In simple words:** DeepSpace has three built-in roles for the whole app. ScoutRoom needs roles *per room* (owner, researcher, viewer). So we store each person's room role in a members collection, and every write goes through a server action that checks it. Reading is protected by DeepSpace's own rules.

**RBAC** (role-based access control) means "what you can do depends on your role". DeepSpace checks it inside the **Durable Object** (the server-side object that stores the data), before data is sent to a browser.

## The problem to solve

DeepSpace's built-in roles are app-wide: `viewer`, `member`, `admin`. Every signed-in user is `member`. The app owner is `admin`.
*Source: https://docs.deep.space/concepts/permissions#roles*

So "researcher in Room A but viewer in Room B" is **not** a built-in role. We model it ourselves.

## Role x action table

| Action | Owner | Researcher | Viewer | Not a member |
|---|:-:|:-:|:-:|:-:|
| Create a room (becomes its owner) | yes | yes | yes | yes (any signed-in user) |
| Read the board (room, cards, steps, votes, brief) | yes | yes | yes | no |
| Invite / remove members, change roles | yes | no | no | no |
| Set the run budget | yes | no | no | no |
| Run the agent / stop a run | yes | yes | no | no |
| Vote keep / reject | yes | yes | no | no |
| Write the brief (F4) | yes | yes | no | no |

## How each rule is enforced

| Rule | DeepSpace piece | Checked where |
|---|---|---|
| Only members can **read** a room's data | Collection `read: 'team'` + a `team_members` collection (`teamId`, `userId`, `status`) | Durable Object, before sending over the socket |
| Only the right role can **write** | Server action reads the caller's `role` from `team_members`, refuses otherwise | Server (worker). The UI hides buttons too, but that is only UX |
| Normal users cannot write records directly | Collections set `create/update/delete: false` for `member` (server actions bypass RBAC) | Durable Object |
| One vote per person per card | `uniqueOn: ['cardId','userId']` + `userBound` user column | Durable Object |
| Nobody can enqueue their own agent job | `authorizeWrite` on the job room set to deny all client writes; only our server action enqueues | Durable Object |
| Owner-only actions | Action checks `role === 'owner'` in `team_members` | Server |

*Sources: https://docs.deep.space/concepts/permissions#the-permissions-block (team level, `uniqueOn`), https://docs.deep.space/guides/server-actions (actions bypass RBAC, callerJwt/userId verified), https://docs.deep.space/guides/background-jobs#who-can-enqueue (`authorizeWrite`).*

## Important: the default job room is too open

The scaffold's `AppJobRoom` lets **any** signed-in `member` enqueue, cancel, or retry jobs from the browser (`worker.ts`). If we left that, a researcher-less user could enqueue an agent run directly and skip the role check, the lock, and the budget. So this build **closes it** (deny all client writes) and enqueues only from the `startRun` server action. See [11-decisions-and-risks.md](11-decisions-and-risks.md) (D4).

## Decided

- **Stop a run:** owner **and** researchers (any of them, not only the person who started it). The server action checks the role.
- **Invites are links** with a fixed role (researcher or viewer). Never `owner`. They expire and can be revoked.
- **Who pays:** the owner's AI key pays for every run, whoever clicks Run. That is why Run and Stop are limited to owner and researchers, and why the run limit exists (see D10 in [11](11-decisions-and-risks.md)).
- **If the spike fails:** if T2 (the `team` read rule) fails, reads fall back to `collaboratorsField` (see R1 in [11](11-decisions-and-risks.md)); the table above stays the same.

## What each role sees in the UI

- **Owner:** everything, plus Settings (budget) and Members.
- **Researcher:** board, Run button, Stop, vote buttons, Brief.
- **Viewer:** board and brief, read-only. Buttons for run and vote are hidden, and the server would refuse them anyway.

## TO VERIFY (details in 11)

- T2: the `team` read level with a `team_members` collection that has an extra `role` column, and `teamId` on every collection.
- T7: who `createdBy` is for records written by a server action.
