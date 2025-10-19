from flask import Flask, render_template, request, send_file, abort
from werkzeug.utils import secure_filename
import tempfile, os, shutil, subprocess, zlib, base64

app = Flask(__name__, static_folder="static", template_folder="templates")
FFMPEG = shutil.which("ffmpeg")  # need ffmpeg for this to work right

def _b64_strip_and_chunk(raw_bytes: bytes) -> str:
    # base64 encode the bytes, drop the = padding, split into 76-char lines, add newline at end
    b64 = base64.b64encode(raw_bytes).decode("ascii").rstrip("=")
    parts = [b64[i:i + 76] for i in range(0, len(b64), 76)]
    return "\n".join(parts) + "\n"

def _escape_ffmeta(s: str) -> str:
    """
    Escape text for ffmetadata input.
    Important: replace actual newline characters with a backslash followed by a real newline
    (i.e. "\\\n" in Python source) — NOT a literal backslash-n sequence "\\n".
    """
    return (s
            .replace("\\", "\\\\")   # escape backslashes first
            .replace("=", "\\=")
            .replace(";", "\\;")
            .replace("#", "\\#")
            .replace("\n", "\\\n")   # BACKSLASH + REAL NEWLINE — this is intentional
           )


def transcode_to_ogg_opus(src: str, dst: str):
    # convert audio to ogg opus at 48k stereo with ffmpeg
    if not FFMPEG:
        raise RuntimeError("ffmpeg not found; please install ffmpeg")
    cmd = [
        FFMPEG, "-y", "-i", src,
        "-ac", "2", "-ar", "48000",
        "-c:a", "libopus", "-b:a", "128k",
        dst
    ]
    subprocess.check_call(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/embed", methods=["POST"])
def embed():
    # takes audio file upload, csv string for glyphs (crlf lines with trailing commas),
    # optional title. outputs ogg/opus with author and custom1 tags (gzipped base64)
    audio_file = request.files.get("audio")
    csv_text = request.form.get("csv")
    title = request.form.get("title") or "Glyph"
    if not audio_file or csv_text is None:
        return abort(400, "Missing audio file or csv data")

    filename = secure_filename(audio_file.filename or "input.ogg")
    base, ext = os.path.splitext(filename)

    # temp file for uploaded audio
    tmp_in = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
    tmp_in.close()
    audio_file.save(tmp_in.name)

    tmp_ogg = tempfile.NamedTemporaryFile(delete=False, suffix=".ogg")
    tmp_ogg.close()

    try:
        # try to get the codec with ffprobe, otherwise assume we need to transcode
        try:
            probe = subprocess.run(
                [shutil.which("ffprobe") or "ffprobe", "-v", "error",
                 "-select_streams", "a:0", "-show_entries", "stream=codec_name",
                 "-of", "default=noprint_wrappers=1:nokey=1", tmp_in.name],
                capture_output=True, text=True)
            codec = probe.stdout.strip().lower()
        except Exception:
            codec = ""

        # only transcode if it's not already opus in ogg container
        need_transcode = (codec != "opus") or (ext.lower() != ".ogg")
        if need_transcode:
            transcode_to_ogg_opus(tmp_in.name, tmp_ogg.name)
        else:
            shutil.copyfile(tmp_in.name, tmp_ogg.name)

        work_path = tmp_ogg.name

        # clean up csv lines to crlf, add trailing comma if missing
        lines = [ln.rstrip("\r\n") for ln in csv_text.splitlines()]
        norm_lines = [ln.rstrip(", \t") + "," for ln in lines]
        author_raw = ("\r\n".join(norm_lines) + "\r\n").encode("utf-8")

        # custom1 is empty for now
        custom1_raw = b""

        # compress with zlib, then base64 with stripping and chunking
        author_b64 = _b64_strip_and_chunk(zlib.compress(author_raw, zlib.Z_BEST_COMPRESSION))
        custom1_b64 = _b64_strip_and_chunk(zlib.compress(custom1_raw, zlib.Z_BEST_COMPRESSION))

        # tags needed for nothing phone glyph stuff
        metadata = {
            "TITLE": title,
            "ALBUM": "Glyph Tools",
            "AUTHOR": author_b64,
            "COMPOSER": "v1-Pacman Glyph Composer",
            "CUSTOM1": custom1_b64,
            "CUSTOM2": "26cols"
        }

        # put together the ffmetadata file
        ffmeta_lines = [";FFMETADATA1"]
        for k, v in metadata.items():
            ffmeta_lines.append(f"{k}={_escape_ffmeta(v)}")
        ffmeta_content = "\n".join(ffmeta_lines) + "\n"

        # use ffmpeg to inject metadata without re-encoding
        out_path = tempfile.NamedTemporaryFile(delete=False, suffix=".ogg")
        out_path.close()
        cmd = [
            FFMPEG, "-y", "-i", work_path, "-i", "-",
            "-map_metadata", "1", "-c:a", "copy", out_path.name
        ]
        proc = subprocess.run(cmd, input=ffmeta_content.encode("utf-8"), capture_output=True)
        if proc.returncode != 0:
            raise RuntimeError(f"ffmpeg metadata write failed: {proc.stderr.decode(errors='ignore')}")

        return send_file(out_path.name, as_attachment=True, download_name=f"{base}_glyphed.ogg")
    except Exception as e:
        return abort(500, f"Embed failed: {e}")
    finally:
        # clean up temp input
        try:
            if os.path.exists(tmp_in.name):
                os.unlink(tmp_in.name)
        except Exception:
            pass

if __name__ == "__main__":
    app.run(debug=True, port=5000)
