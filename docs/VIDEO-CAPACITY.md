# How much video can `meet.pathment.me` actually carry?

Asked because nobody knew, and the honest answer is: **less than Pathment already
asks of it on a busy evening.** This works the number out from what is deployed
and what the workspace actually does, so the next decision is a decision rather
than a guess.

Measured 17 October 2026 against production.

---

## 1. What is deployed

One **Oracle Cloud Always Free Ampere A1 — 1 OCPU, 6 GB, Mumbai** (`ap-mumbai-1`),
running *all* of prosody, jicofo, jitsi-videobridge2, nginx and coturn together
(`OPS-RUNBOOK.local.md`, §Host). Both staging and production point at it.

Two things about that configuration matter more than the CPU count:

- **P2P is disabled on purpose.** Dominant-speaker detection drives review
  talk-time, and it is a bridge feature, so even a 2-person call is relayed.
  Nothing bypasses this box.
- **coturn is on the same host.** Anyone behind a restrictive network relays
  their media *through this box twice* — in and out — so a TURN user costs
  roughly double a direct one.

## 2. What the workspace actually asks of it

| | |
|---|---|
| Clans | 48 |
| Average members | 18.5 |
| Largest clan | **49** (`Code Stark Clan 2026 · Standing`) |
| Review sessions held | 340 |
| Highest observed concurrency | **4 sessions in the same hour** |

## 3. The arithmetic

An SFU's cost grows with the **square** of the room: every participant sends one
stream up, and the bridge sends it to everyone else. For N people the bridge
carries N uplinks and **N × (N−1)** downlinks.

Before the change in §4 the client set no `channelLastN` and no resolution cap, so
Jitsi's defaults applied: every camera forwarded to everybody, up to 720p.

Per-tile bitrates used below are Jitsi's simulcast layers: 180p ≈ 150 kbps,
360p ≈ 500 kbps, 720p ≈ 1.2 Mbps. Small tiles in a grid request the low layer.

| Room | Downstreams | Bridge egress (uncapped) |
|---|---|---|
| 6 | 30 | ~6 Mbps |
| 12 | 132 | ~26 Mbps |
| **20** (a typical clan) | 380 | **~76 Mbps** |
| **49** (the largest clan) | 2,352 | **~470 Mbps** |

Against that:

- **Bandwidth.** Ampere A1 is documented as scaling network bandwidth with OCPU
  count — roughly 1 Gbps per OCPU; confirm the current figure on Oracle's
  Flexible Shapes page before relying on it. At 1 OCPU, one 49-person call is
  already using about half the NIC, and four concurrent 20-person reviews
  (~300 Mbps) is a third of it.
- **CPU is the tighter limit, not bandwidth.** Community sizing for Jitsi puts a
  4-core box at roughly 100 concurrent participants across all conferences. One
  ARM core, sharing the machine with prosody, jicofo, nginx and coturn, is
  realistically **25–35 concurrent participants in total** — and that is the
  optimistic reading.

**Planning envelope, pending a real load test:** target 20–25 concurrent
participants total, treat 30 as a soft ceiling, and do not promise a reliable
49-person room on this 1-OCPU VM. One room of about 20 or two rooms of about
8–12 each is the conservative operating shape. This is an engineering estimate,
not a vendor guarantee; TURN-heavy use and screen sharing lower the ceiling.

Monthly egress is *not* the binding constraint: ~76 Mbps for an hour is ~34 GB,
and 48 clans meeting weekly is roughly 6–7 TB/month against a 10 TB Always Free
allowance. Tight, but the box falls over long before the quota does.

## 4. What has been done about it (free, already applied)

`components/shared/JitsiRoom.tsx` now sets:

- **`channelLastN: 9`** — only the nine most recent speakers' *video* is
  forwarded. Audio is untouched: everyone is still heard. In a review, where one
  person speaks at a time, this costs nothing anyone will notice.
- **360p cap** (`constraints.video.height.max`) and `startVideoQuality: 360`.
- Simulcast left **on**, which is what lets the bridge send a small layer to a
  small tile.

Effect on the same rooms:

| Room | Before | After | |
|---|---|---|---|
| 20 | ~76 Mbps | **~27 Mbps** | −65% |
| 49 | ~470 Mbps | **~66 Mbps** | −86% |

The 49-person call becomes possible, and four concurrent 20-person reviews drop
to roughly 110 Mbps — within reach of the current box rather than well past it.

## 5. What to do next, cheapest first

1. **Check whether the VM can be resized within the free allowance.** Oracle's
   current Always Free documentation describes **1,500 OCPU-hours and 9,000
   GB-hours per month**, equivalent to **2 OCPU / 12 GB continuously** across the
   tenancy. Pathment uses 1 OCPU / 6 GB. If no other A1 VM consumes the allowance,
   resizing to 2/12 is the first improvement to evaluate. Confirm the live
   tenancy limits before changing the shape.
2. **Move coturn to its own box** once resized, so relayed users stop paying
   double on the machine doing the mixing.
3. **Watch it.** `grep -c "Created new conference" /var/log/jitsi/jicofo.log` and
   JVB's `/colibri/stats` endpoint give participant counts and bitrate; without
   a number from a real review this document is still arithmetic.
4. **Stagger the reviews.** Four clans at 7pm is a scheduling choice, and
   spreading them is free.

## 6. On moving to "the Google Meet SDK"

**It would not do this job.** Google's Meet offering splits three ways, and none
of them is "embed a Meet call in your page":

- The **Meet Add-ons SDK** (GA for web since September 2024) puts *your app
  inside Meet*, which is the opposite direction.
- The **Meet REST API** creates and manages meetings and fetches conference
  records afterwards. It does not host video in your UI.
- The **Meet Media API** (Developer Preview) exposes raw streams, which means
  building a client, not adopting one.

Using Meet would mean sending mentors and mentees *out* of Pathment to a Google
URL — and with them goes the thing the call is actually for: attendance,
dominant-speaker talk-time, the contribution scoring and the "finish session"
handshake all come from being inside the room.

If a managed SFU is wanted later, the cheap move is **JaaS (8x8)**: every piece
of Jitsi coupling in this codebase is the `JITSI_DOMAIN` env var
(`docs/COHORT-REVIEW-VIDEO.md` §Provider-flexible), so it is a config change
rather than a rewrite. Daily, LiveKit and Twilio are the other embeddable
options. Do §5.1 first — it is free, and it may well end the conversation.

## Sources

- [Oracle — Always Free Resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm)
- [Google Meet SDK and API overview](https://developers.google.com/workspace/meet/overview)
- [Google Meet Add-ons SDK is now available](https://workspaceupdates.googleblog.com/2024/09/google-meet-add-ons-sdk-is-now-available.html)
