# Chimp Instagram Reel / Social Strategy

Automation for finding or queuing workplace/safety videos and posting to Instagram Reels under the Chimp account, with captions generated in the same voice as Chimp Chat.

## What’s implemented

1. **Chimp-voice caption generation** – Same personality as Chimp Chat (concise, dry wit, no emojis, safety-aware). Used for Reel captions.
2. **Firestore queue** – `instagram_reel_queue`. You add or auto-fill videos; the job generates captions and marks items “ready to post.”
3. **Scheduled job** – `scheduledChimpReel` runs **Mon / Wed / Fri at 9 AM Central**. It processes one pending item (generates caption, sets status to `caption_ready`). If the queue is empty and Pexels is configured, it enqueues one royalty-free video from Pexels.
4. **Optional Pexels** – When `PEXELS_API_KEY` is set, the job can pull one video from Pexels (e.g. “construction safety”, “workplace safety”) and add it to the queue so you don’t have to add every video by hand.

## Video sourcing (important)

- **Do not** scrape or repost random “fail” videos from YouTube, TikTok, Reddit, etc. That violates ToS and copyright.
- **Safe options:**
  - **Curated queue:** Add documents to `instagram_reel_queue` with a `videoUrl` you have rights to (your own clips, licensed, or used with permission).
  - **Pexels:** Royalty-free; the job can auto-enqueue from Pexels. These are stock/safety clips, not “fail” compilations.
- For real “workspace fail” clips, add them manually (e.g. from sources that grant reuse or that you’ve licensed).

## Instagram posting

- **Current behavior:** The job only generates captions and sets status to `caption_ready`. You post manually (copy caption + video URL from Firestore or a small admin view).
- **Full automation later:** Posting Reels via API requires:
  - Instagram **Business or Creator** account linked to a **Facebook Page**
  - Meta app with **Content Publishing** and **Instagram Graph API**
  - Long-lived **Page access token**
  - Video must be at a **public URL** when publishing (or use Meta’s resumable upload)
- Once you have those, we can add a step that calls the Instagram Content Publishing API after caption generation.

## Firestore: `instagram_reel_queue`

| Field          | Type     | Description |
|----------------|----------|-------------|
| `videoUrl`     | string   | **Required.** Public URL of the video (Reels need a URL Instagram can fetch). |
| `sourceLabel`  | string   | Optional. Short context for caption (e.g. "construction fail", "kitchen slip"). Used as prompt context. |
| `caption`      | string   | Set by the job when status becomes `caption_ready`. |
| `status`       | string   | `pending` \| `caption_ready` \| `posted` \| `failed` |
| `createdAt`    | timestamp| Set when the doc is created. |
| `updatedAt`    | timestamp| Set when caption is generated or status changes. |
| `postedAt`     | timestamp| Optional. Set when you post (or when IG API is added). |
| `errorMessage` | string   | Optional. Set when `status === 'failed'`. |
| `attribution`  | string   | Optional. e.g. "Video by X on Pexels" for Pexels-sourced items. |

**Manual add example (e.g. in Firebase Console):**

```json
{
  "videoUrl": "https://example.com/path/to/your-video.mp4",
  "sourceLabel": "construction ladder fail",
  "status": "pending",
  "createdAt": "<use server timestamp>"
}
```

## Functions

- **`generateReelCaption`** (callable) – Input: `{ videoContext?: string }`. Returns `{ caption }`. Use to test Chimp captions or generate a caption for a manual post.
- **`scheduledChimpReel`** – Scheduled Mon/Wed/Fri 9 AM Central. Processes one pending queue item (caption generation; optional Pexels enqueue when queue is empty).

## Secrets / config

- **`XAI_API_KEY`** – Required for caption generation (same as Chimp Chat).
- **`PEXELS_API_KEY`** – Optional. If set (non-empty), the job will enqueue one Pexels video when the queue is empty. Get a key at [Pexels API](https://www.pexels.com/api/). You can create the secret and leave it empty to disable Pexels.

## Cadence

- **Caption job:** 3× per week (Mon, Wed, Fri 9 AM Central).
- To post more often, add more docs to `instagram_reel_queue` or run the caption callable and post manually.

## Next steps (optional)

1. **Admin UI** – Small page to list `caption_ready` items (video URL + caption) and “Copy caption” / “Mark as posted.”
2. **Instagram API** – After Meta app + Page + token are set up, add a step in the job (or a separate scheduled function) to publish Reels via Content Publishing API using `videoUrl` and `caption`.
3. **Hashtags** – Extend the Chimp caption prompt to optionally append a small set of safety/workplace hashtags.
