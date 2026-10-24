---
name: vishnuai-render-horizontal
description: Use when rendering landscape videos with VishnuAI CLI, including original video plus bilingual subtitles or dubbed video plus target-language subtitles.
---

# VishnuAI Render Horizontal

Use this skill for `render-horizontal`. Read `skills/vishnuai-cli/references/cli-contract.md` first for binary location, execution working directory, configuration, and JSON behavior.

## Bilingual Subtitle Video

```bash
(cd "$VISHNUAI_CWD" && "$VISHNUAI_CLI" render-horizontal \
  --workdir "$WORKDIR" \
  --video "$WORKDIR/origin_video.mp4" \
  --subtitle "$WORKDIR/bilingual_srt.srt")
```

## Dubbed Video

```bash
(cd "$VISHNUAI_CWD" && "$VISHNUAI_CLI" render-horizontal \
  --workdir "$WORKDIR" \
  --video "$WORKDIR/video_with_tts.mp4" \
  --subtitle "$WORKDIR/target_language_srt.srt" \
  --dubbed)
```

## Inputs

- `--video`: source video, or omit when manifest has the correct input.
- `--audio`: optional replacement audio.
- `--subtitle`: usually `bilingual_srt.srt` for bilingual, `target_language_srt.srt` for dubbed.
- `--workdir`: directory containing `vishnuai_manifest.json`.
- `--subtitle-style-file`: optional JSON override merged with the default subtitle style.

## Outputs

- `horizontal_bilingual.mp4` for the default variant.
- `horizontal_dubbed.mp4` with `--dubbed`.
- Both variants are reported through the manifest key `horizontal_video`.

## Verification

- Require terminal JSON with `"ok": true`.
- Confirm output video exists and has video/audio streams.
- Extract a preview frame when checking subtitle placement.
- For manifest and error handling, read `skills/vishnuai-cli/references/cli-contract.md`.
