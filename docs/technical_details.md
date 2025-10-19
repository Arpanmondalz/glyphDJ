# Technical Notes for Glyph DJ (Nothing Phone 2a)

Here's a rundown of the precise file structures, metadata rules, and encoding steps that Glyph DJ follows to make sure exported OGG files load up properly in the Nothing Phone 2a's Glyph Composer.

> **Key Aims**
> - Generate a CSV that captures glyph LED states at 60 Hz (one frame every 16.666 ms), with 26 columns for indices 0 through 25.
> - Compress and encode that CSV into Vorbis comments so the Nothing Glyph Composer app picks it up as valid glyph data.
> - Stick to Ogg containers with Opus audio (48 kHz stereo) to keep things reliable on the device.

***

## 1. Raw Glyph CSV Format (What's in the AUTHOR Payload)

- **Frame Rate:** Locked at 60 Hz, meaning a new row every 16.666... ms.
- **Columns:** Exactly 26 (for Phone (2a) series), one for each LED zone from 0 to 25. Values are whole numbers between 0 and 4095 (where 4095 means full brightness).
- **Row Layout:** Commas separate the values, and there's a trailing comma after the last one in each row.
  - For example (showing the first few and last):  
    ```
    4095,4095,0,0,0, ... ,0,
    ```
  - **Key Point:** That extra comma after the 26th value is crucial—each row ends with a comma.
- **Line Endings:** Use CRLF (`\r\n`) between rows, and add one more at the very end of the whole CSV.
- **Overall Size:** For an audio track of T seconds, you'll have `ceil(T * 60)` rows. Every row needs 26 numbers followed by that trailing comma.

***

## 2. LED Zone Mapping on Nothing Phone 2a (Indices 0–25)

- Total of 26 LED zones, indexed 0 to 25.
- In the Glyph DJ interface, we tie keyboard keys to these like so:
  - `Q` → zones 0 to 5 (top-left glyph's first chunk)
  - `W` → zones 6 to 11
  - `E` → zones 12 to 17
  - `R` → zones 18 to 23
  - `L` → zone 24 (middle-right area)
  - `M` → zone 25 (bottom-left spot)
- The top-left glyph gets split into four parts (Q, W, E, R), each handling six LEDs in a row.

***

## 3. How Compression and Base64 Work (For AUTHOR and CUSTOM1)

The phone and related tools don't want plain CSV in the Vorbis comments—they expect it processed this way:

1. **Start with Raw Bytes:** Turn the CSV into UTF-8 bytes, keeping those CRLF endings and trailing commas.
2. **Zlib Compression:** Squash it down using standard zlib (follows RFC specs).
3. **Base64 Encoding:** Convert the compressed bytes to base64.
4. **Drop the Padding:** Strip out any `=` characters at the end (that's how the tools and docs handle it).
5. **Line Breaks:** Chop the base64 into chunks of 76 characters, joining them with `\n`, and tack on a final `\n`.
6. **Into Vorbis Comments:** Stuff this formatted text into the tags—at minimum, the `AUTHOR` one. For `CUSTOM1`, use the same or an empty version (processed identically).

> This specific chain (zlib compress → base64 encode → no padding → 76-char lines) comes straight from the reference tools and real-world tests on the device.

***

## 4. Essential Vorbis Comment Tags (The Full Set We Use)

To get solid results with the Nothing Phone 2a Composer, we include these tags:

- `AUTHOR` — Holds the main glyph data (that compressed, encoded CSV). **This one's non-negotiable.**
- `CUSTOM1` — Needs to be there (even if the composer might pull timeline or dot info from it). It can hold an empty payload (zlib'd and encoded like above), but the tag itself must exist.
- `COMPOSER` — Lock it to this exact string from the device docs and community stuff:  
  ```
  v1-Pacman Glyph Composer
  ```
- `CUSTOM2` — Flags the format, like `26cols` for the Phone 2a setup.
- `TITLE` — A user-friendly name for the track (we pull it from the audio's base filename).
- `ALBUM` / `ARTIST` — Nice-to-haves for extra info.

**What Glyph DJ Does:** We format `AUTHOR` and `CUSTOM1` with the full zlib+base64 treatment, set `COMPOSER` to `v1-Pacman Glyph Composer`, `CUSTOM2` to `26cols`, and `TITLE` to the original filename sans extension. This setup has proven to work best for imports.

***

## 5. Audio Container and Codec Specs

- **Top Choice:** Ogg wrapper around Opus codec at 48 kHz stereo—most versions of the composer are happiest with this.
- If the input isn't already Ogg/Opus (say, it's MP3, WAV, or plain Vorbis), the server side transcodes it using FFmpeg to Ogg/Opus: `-ac 2 -ar 48000 -c:a libopus -b:a 128k`. Glyph DJ handles this automatically to avoid headaches.
- Double-check post-export with `ffprobe` that the codec reads as `opus`.

***

## 6. Naming the Export File

- We name outputs like:  
  ```
  <original-filename>_glyphed.ogg
  ```
- The file downloads straight from the app and should plug right into the phone's Glyph Composer.

***

## 7. How We Build the CSV (Code Breakdown)

- **Sampling the Timeline:** Hit it at 60 Hz. For every frame, figure out the brightness level for all 26 zones.
- **User Segments:** We store recordings as objects like `{ start_seconds, end_seconds, fade_seconds }` for each key track (Q/W/E/R/L/M). If a track covers multiple zones, those get the same brightness in the relevant frames.
- **Per-Frame Values:** Inside a segment (from start to end time), set brightness to 4095. For the fade-out (last few seconds), scale it down linearly to 0.
- **Turning Matrix into CSV:** Build a frames-by-26 array, then for each row: join values with commas, add the trailing one (`'v0,v1,...,v25,'`), and link rows with CRLF (`\r\n`). Cap it off with a final `\r\n`.

***

## 8. Server-Side Embedding Process (Step-by-Step)

1. Grab the uploaded audio and raw CSV text.
2. If it's not Opus in Ogg, transcode via FFmpeg to 48 kHz Opus stereo.
3. Clean up the CSV: enforce CRLF lines, trailing commas, and the ending CRLF (just in case).
4. `author_raw = csv.encode('utf-8')`
5. `author_compressed = zlib.compress(author_raw)`
6. `author_b64 = base64.b64encode(author_compressed).decode('ascii').rstrip('=')`  // Ditch the padding
7. Split `author_b64` into 76-char lines, add `\n` between them, and one more at the end.
8. Assemble the tag map: `TITLE`, `ALBUM`, `AUTHOR` (as multi-line), `COMPOSER`, `CUSTOM1`, `CUSTOM2`.
9. Use FFmpeg like `ffmpeg -i infile -i - -map_metadata 1 -c:a copy out.ogg`, feeding the metadata as FFMETADATA1 text via stdin for safe tag writing. (FFmpeg's great for this; Mutagen works too, but pairing it with the transcode step is solid.)
10. Send the finished OGG back to the user.

***

## 9. Checking and Troubleshooting

- **Look at the Tags:**  
  ```bash
  vorbiscomment -l output_glyphed.ogg
  ```
  Expect `AUTHOR=` with a bunch of 76-char base64 lines, plus `CUSTOM1=`, `COMPOSER=v1-Pacman Glyph Composer`, `CUSTOM2=26cols`, and `TITLE=...`.

- **Verify Codec:**  
  ```bash
  ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 output_glyphed.ogg
  ```
  Output: `opus`.

- **Unpack the AUTHOR Tag (Simple Python Snippet):**  
  ```python
  import base64, zlib
  b64 = "<paste the joined AUTHOR lines here>"
  # Pad with '=' if the length isn't divisible by 4
  padded = b64 + '=' * (-len(b64) % 4)
  csv_bytes = zlib.decompress(base64.b64decode(padded))
  print(csv_bytes.decode('utf-8')[:1000])
  ```
  You should see CSV with CRLF and trailing commas.

***

## Sources

- [custom-nothing-glyph-tools (GitHub)](https://github.com/SebiAi/custom-nothing-glyph-tools/blob/main/docs/9_Technical%20Details.md)
- [Glyphtones Guide](https://glyphtones.firu.dev/guide)
- [ffmpeg documentation](https://ffmpeg.org/documentation.html)
- [Mutagen (Python tagging library)](https://mutagen.readthedocs.io/)

***