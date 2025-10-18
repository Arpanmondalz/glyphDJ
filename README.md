# Glyph DJ

This is a simple web tool for creating and adding custom glyph light effects to any audio file (Only works with OGG format). **This version only works with the Nothing Phone (2a) and (2a) pro** (Support for other Nothing Phone models coming soon!) 

I created this tool due to the lack of quick and simple tools to create custom glyph light effects for ringtones, and notifications. I kept it as user friendly as possible, requiring no additional tools like audacity, etc. It includes a nice frontend created with flask. 
You can record your light sequence right from your keyboard using key bindings, tweak them on a timeline, and then export an OGG file with the glyph info fed into its metadata. It works like playing a keyboard 🎹, with a keyboard ⌨

When you load it into the Nothing Phone (2a) ringtones or the glyph composer app, you'll see the lights flash exactly the way you recorded. 

***

## What It Does

- Lets you record glyphs in real time by holding down Q, W, E, R (For the top left addressable glyph), L (for the right vertical glyph), or M (for the tiny bottom left glyph) on your keyboard.
- Includes a simple timeline where you can drag, resize, or remove your recorded segments.
- Supports audio playback with a scrubber, playhead, and zoom controls.
- Outputs OGG files with the glyph data embedded (compressed with zlib, base64-encoded into AUTHOR and CUSTOM1 tags) that work seamlessly on the Nothing Phone 2a.

***

## Getting Started

### What You Need

- Python 3.10 or newer.
- FFmpeg in your system's PATH for handling audio encoding and metadata (it's essential for smooth transcoding and tag insertion).
  - On macOS: Run `brew install ffmpeg`.
  - On Debian or Ubuntu: `sudo apt install ffmpeg`.
  - On Windows with Chocolatey: `choco install ffmpeg`.
- The Python dependencies listed in `requirements.txt` (I'll cover installation next).

### Setup and Launch

```bash
git clone https://github.com/Arpanmondalz/glyphDJ.git
cd glyphDJ

# Optional: Set up a virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

pip install -r requirements.txt

# Fire up the development server
python app.py
```

Just head over to http://localhost:5000 in your browser to get going.

***

## How to Use It

### Basic technicalities

- Nothing Phones' Glyph LEDs(until 3a pro) are indexed from 0 to n-1 where n is the total number of addressable LED segments. 
- In case of the Phone (2a) series, the bottom LED of the top left Glyph is the first index `[0]`. 
- And since this is an addressable Glyph, the top of this Glyph ends with LED `[23]`. So there are 24 addressable LED segments here. 
- In this web app, we divide this Glyph into 4 segments instead of 24 to make it easir to control. 
- The Middle right vertical Glyph is indexed `[24]`
- The little bottom left Glyph is indexed `[25]`

### Start composing

1. Hit the **Import music (OGG)** button and pick an OGG file.
2. Use the built-in audio controls to play, pause, or scrub through the track.
3. Start recording by holding down a key while the audio plays:
   - `Q` controls the top-left area (LEDs 0 through 5).
   - `W` hits the next top section (LEDs 6 to 11).
   - `E` for the following top row (LEDs 12 to 17).
   - `R` covers the last top LEDs (18 to 23).
   - `L` lights up the middle-right vertical Glyph (LED 24).
   - `M` turns on the bottom-left Glyph (LED 25).
4. Once recorded, you can adjust the segments by clicking and dragging them around on the timeline.
5. When you're happy, click **Export OGG** to grab your modified file, named something like `yourfile_glyphed.ogg`.
6. Transfer it to your Nothing Phone 2a and load it into the Glyph Composer app.

***

## Details on Format and Phone Compatibility

- The glyph data is in CSV format with 26 columns (one for each LED index from 0 to 25), and values range from 0 to 4095 for brightness.
- Every CSV line wraps with a trailing comma and uses CRLF line endings (`\r\n`) to play nice with the phone's official tools.
- Metadata gets embedded via the AUTHOR tag (zlib-compressed, base64 without padding, broken into 76-character lines), plus CUSTOM1, COMPOSER set to "v1-Pacman Glyph Composer", and CUSTOM2 as "26cols" to match what the device looks for.

If the file doesn't import properly on your phone, double-check these:
- Audio should be Opus codec inside an Ogg container for best results.
- AUTHOR tag must decode to valid 26-column CSV rows.
- Peek at the tags with `vorbiscomment -l file.ogg` or use `ffprobe` to verify the codec.

***

## Building and Contributing

I'd love some help if you're interested! Some ideas for improvements:
- Adding support for other Nothing phones (High Priority)
- Visual indication for the Glyph interface insted of the rectangles
- Package it into an android app (?)

When you make changes, just submit a pull request with a quick note on what you did.

***

## Shoutouts and Sources

- Thanks to the following sources for helping me understand the glyph metadata in OGG files:
  - [custom-nothing-glyph-tools](https://github.com/SebiAi/custom-nothing-glyph-tools)
  - [Glyphtones guide](https://glyphtones.firu.dev/guide)

Put together by **Arpan Mondal** in 2025.

***

## License Info

MIT License covers this project—check out the `LICENSE` file for the full terms.
