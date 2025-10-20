/**
 * Glyph DJ Frontend Logic
 *
 * This script handles all the user interface interactions for the Glyph DJ tool.
 * It allows users to:
 *  - Load an OGG audio file.
 *  - Record glyph light patterns by pressing keys (Q, W, E, R, L, M).
 *  - See a live preview of the glyphs.
 *  - Edit the recorded patterns on a timeline (move and resize).
 *  - Export the audio with embedded glyph data for the Nothing Phone 2a.
 */

// --- Constants & Configuration ---

const FRAME_HZ = 60; // The target frame rate for the glyph animation.
const FRAME_MS = 1000 / FRAME_HZ; // How many milliseconds per frame.
const NUM_LEDS = 26; // Total number of LED zones on the device.

// Maps keyboard keys to their corresponding LED indices and timeline colors.
const KEY_MAP = {
    'q': { indices: [0, 1, 2, 3, 4, 5],       color: 'var(--c0)' },
    'w': { indices: [6, 7, 8, 9, 10, 11],      color: 'var(--c1)' },
    'e': { indices: [12, 13, 14, 15, 16, 17],  color: 'var(--c2)' },
    'r': { indices: [18, 19, 20, 21, 22, 23],  color: 'var(--c3)' },
    'l': { indices: [24],                     color: 'var(--c4)' },
    'm': { indices: [25],                     color: 'var(--c5)' },
};
const TRACK_KEYS = Object.keys(KEY_MAP);


// --- DOM Element References ---

const audioEl = document.getElementById('audio');
const fileInput = document.getElementById('fileInput');
const speedRange = document.getElementById('speedRange');
const speedVal = document.getElementById('speedVal');
const zoomRange = document.getElementById('zoomRange');
const clearAllBtn = document.getElementById('clearAll');
const exportOggBtn = document.getElementById('exportOgg');

const timelineEl = document.getElementById('timeline');
const playheadEl = document.getElementById('playhead');
const glyphPreviewEl = document.getElementById('glyphPreview');


// --- Application State ---

let selectedAudioFile = null; // The user's selected .ogg file.
let duration = 0; // Duration of the loaded audio in seconds.
let zoomFactor = 1; // Timeline zoom level.

// This holds our main data: an array of segments for each track.
// e.g., segments[0] is an array of {start, end, fade} for the 'q' track.
let segments = TRACK_KEYS.map(() => []);

// currently selected segment DOM element (or null)
let selectedSegmentEl = null;


// Tracks currently active recordings (when a key is held down).
let activeRecording = {};

// Keeps track of which keys are currently pressed to avoid repeat events.
let keyDown = {};

// Interval timer for updating the playhead during playback.
let scrubInterval = null;


// --- Initial Setup ---

// Creates the static glyph preview panel on the right side of the screen.
function buildGlyphPreview() {
    glyphPreviewEl.innerHTML = '';
    const rows = [
        ['q', 'w', 'e', 'r'],
        ['l'],
        ['m']
    ];

    rows.forEach(r => {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'glyphRow';

        r.forEach(k => {
            const box = document.createElement('div');
            box.className = 'glyphBox';

            const seg = document.createElement('div');
            seg.className = 'glyphSegment';
            seg.style.background = KEY_MAP[k].color;
            seg.dataset.key = k; // Store the key for later reference.

            box.appendChild(seg);
            rowDiv.appendChild(box);
        });

        glyphPreviewEl.appendChild(rowDiv);
    });
}


// --- Audio Handling ---

// Loads an audio file into the <audio> element.
function loadAudio(file) {
    const url = URL.createObjectURL(file);
    audioEl.src = url;

    // Once metadata is loaded, we know the duration.
    audioEl.onloadedmetadata = () => {
        duration = audioEl.duration || 0;
        renderTimeline();
        // Make sure the preview is correct for the starting position.
        updateGlyphPreviewAtTime(0);
    };
}

// --- Event Listeners ---

fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
        selectedAudioFile = e.target.files[0];
        loadAudio(selectedAudioFile);
    }
});

speedRange.addEventListener('input', () => {
    const v = parseFloat(speedRange.value);
    audioEl.playbackRate = v;
    speedVal.textContent = v.toFixed(2) + 'x';
});

zoomRange.addEventListener('input', () => {
    zoomFactor = parseFloat(zoomRange.value);
    renderTimeline();
});

// Update the playhead's position as the audio plays.
audioEl.addEventListener('play', () => {
    scrubInterval = setInterval(() => {
        const currentTime = audioEl.currentTime;
        updatePlayhead(currentTime);
        updateGlyphPreviewAtTime(currentTime);
    }, 16); // ~60fps
});

audioEl.addEventListener('pause', () => {
    clearInterval(scrubInterval);
    scrubInterval = null;
    // Update preview one last time when playback stops.
    updateGlyphPreviewAtTime(audioEl.currentTime || 0);
});

// When the user seeks, update everything.
audioEl.addEventListener('seeked', () => {
    const currentTime = audioEl.currentTime || 0;
    updatePlayhead(currentTime);
    updateGlyphPreviewAtTime(currentTime);
});


// Handles seeking when the user clicks on the timeline.
document.getElementById('timelineWrap').addEventListener('click', (ev) => {
    const rect = timelineEl.getBoundingClientRect();
    const x = ev.clientX - rect.left;

    // Use the actual scroll width for an accurate calculation.
    const timelineWidth = Math.max(timelineEl.scrollWidth, 1200 * zoomFactor);
    const targetTime = clamp((x / timelineWidth) * duration, 0, duration);

    audioEl.currentTime = targetTime;
    updatePlayhead(targetTime);
    updateGlyphPreviewAtTime(targetTime);
});

// --- Timeline Rendering & Interaction ---

function updatePlayhead(time) {
    const px = time * 100 * zoomFactor;
    playheadEl.style.transform = `translateX(${px}px)`;
}

// Re-draws the entire timeline based on the current `segments` data.
function renderTimeline() {
    
    // Clear selection reference because DOM nodes will be replaced
    selectedSegmentEl = null;

    timelineEl.innerHTML = ''; // Clear the old timeline first.

    TRACK_KEYS.forEach((key, trackIndex) => {
        const row = document.createElement('div');
        row.className = 'row';

        const label = document.createElement('div');
        label.className = 'rowLabel';
        label.textContent = key.toUpperCase();

        const content = document.createElement('div');
        content.className = 'rowContent';

        segments[trackIndex].forEach(seg => {
            const endTime = seg.end === null ? (audioEl.currentTime || seg.start) : seg.end;
            const left = seg.start * 100 * zoomFactor;
            const width = (Math.max(endTime - seg.start, 0.02)) * 100 * zoomFactor;

            const el = document.createElement('div');
            el.className = 'segment';
            el.style.left = `${left}px`;
            el.style.width = `${width}px`;
            el.style.background = KEY_MAP[key].color;

            // Attach event handlers to make the segment draggable and resizable.
            makeSegmentInteractive(el, seg, trackIndex);

            content.appendChild(el);
        });

        row.appendChild(label);
        row.appendChild(content);
        timelineEl.appendChild(row);
    });

    // After re-rendering, ensure the playhead and preview are still in the right state.
    updatePlayhead(audioEl.currentTime || 0);
    updateGlyphPreviewAtTime(audioEl.currentTime || 0);
}

function makeSegmentInteractive(el, seg, trackIndex) {
  // attach references so we can find & remove the underlying segment later
  el._segmentRef = seg;
  el._trackIndex = trackIndex;

  // click = select
  el.addEventListener('click', (ev) => {
    ev.stopPropagation(); // Prevent timeline click from firing.
    // Deselect all other segments.
    document.querySelectorAll('.segment').forEach(s => s.classList.remove('selected'));
    el.classList.add('selected');
    selectedSegmentEl = el;
  });

  // double-click = delete with confirmation
  el.addEventListener('dblclick', (ev) => {
    ev.stopPropagation();
    if (!confirm('Delete this segment?')) return;
    const arr = segments[trackIndex];
    const idx = arr.indexOf(seg);
    if (idx >= 0) {
      arr.splice(idx, 1);
      selectedSegmentEl = null;
      renderTimeline();
    }
  });

  // make draggable/resizable as before
  let mode = null, startX = 0, startLeft = 0, startWidth = 0;
  el.addEventListener('mousedown', (ev) => {
    ev.stopPropagation();
    startX = ev.clientX;
    startLeft = parseFloat(el.style.left || 0);
    startWidth = parseFloat(el.style.width || 0);
    const rect = el.getBoundingClientRect();
    const relX = ev.clientX - rect.left;
    if (relX < 8) mode = 'resize-left';
    else if (relX > rect.width - 8) mode = 'resize-right';
    else mode = 'move';

    function onMove(e) {
      const dx = e.clientX - startX;
      const totalScale = 100 * zoomFactor;
      if (mode === 'move') {
        const newLeft = Math.max(0, startLeft + dx);
        el.style.left = newLeft + 'px';
        seg.start = pxToTime(newLeft);
        if (seg.end !== null) seg.end = seg.start + (startWidth / totalScale);
      } else if (mode === 'resize-left') {
        const newLeft = Math.max(0, startLeft + dx);
        const newWidth = Math.max(6, startWidth - dx);
        el.style.left = newLeft + 'px';
        el.style.width = newWidth + 'px';
        seg.start = pxToTime(newLeft);
        seg.end = pxToTime(newLeft + newWidth);
      } else if (mode === 'resize-right') {
        const newWidth = Math.max(6, startWidth + dx);
        el.style.width = newWidth + 'px';
        seg.end = pxToTime(startLeft + newWidth);
      }
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      mode = null;
      updateGlyphPreviewAtTime(audioEl.currentTime || 0);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

function pxToTime(px) {
    return px / (100 * zoomFactor);
}


// --- Keyboard Recording Logic ---

document.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (!KEY_MAP[k] || keyDown[k]) {
        return; // Not a valid key or already held down.
    }
    keyDown[k] = true;

    const trackIndex = TRACK_KEYS.indexOf(k);
    const newSegment = { start: audioEl.currentTime || 0, end: null, fade: 0.12 };

    segments[trackIndex].push(newSegment);
    activeRecording[k] = newSegment;

    setGlyphPreview(k, true);
    renderTimeline();
});

document.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (!KEY_MAP[k]) return;

    keyDown[k] = false;
    const seg = activeRecording[k];

    if (seg) {
        // Finalize the segment's end time.
        seg.end = Math.max((audioEl.currentTime || seg.start), seg.start + 0.02);
        activeRecording[k] = null;
        setGlyphPreview(k, false);
        renderTimeline();
    }
});


// --- UI Update Functions ---

// Instantly toggles the visual state of a glyph in the preview panel.
// Used for immediate feedback during recording.
function setGlyphPreview(key, isOn) {
    const el = glyphPreviewEl.querySelector(`.glyphSegment[data-key="${key}"]`);
    if (el) {
        el.classList.toggle('on', isOn);
    }
}

// Updates the entire glyph preview based on the playhead's current time.
function updateGlyphPreviewAtTime(time) {
    const activeStates = {};
    TRACK_KEYS.forEach(k => activeStates[k] = false);

    segments.forEach((trackSegs, trackIndex) => {
        for (const seg of trackSegs) {
            const segEnd = seg.end === null ? (audioEl.currentTime || seg.start) : seg.end;
            const fade = seg.fade || 0;
            if (time >= seg.start && time <= segEnd + fade) {
                activeStates[TRACK_KEYS[trackIndex]] = true;
                break; // Found an active segment, no need to check others in this track.
            }
        }
    });

    // Apply the computed states to the DOM.
    document.querySelectorAll('.glyphSegment').forEach(el => {
        const key = el.dataset.key;
        if (key) {
            el.classList.toggle('on', !!activeStates[key]);
        }
    });
}


clearAllBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear the entire timeline?')) {
        segments = TRACK_KEYS.map(() => []);
        activeRecording = {};
        document.querySelectorAll('.glyphSegment').forEach(s => s.classList.remove('on'));
        renderTimeline();
    }
});


// --- Export Logic ---

// Converts the `segments` data into a time-based CSV matrix.
function buildCsvString() {
    if (!duration || !isFinite(duration)) return null;

    const frameCount = Math.ceil(duration / (FRAME_MS / 1000));
    const matrix = Array.from({ length: frameCount }, () => new Array(NUM_LEDS).fill(0));

    segments.forEach((trackSegs, trackIndex) => {
        const indices = KEY_MAP[TRACK_KEYS[trackIndex]].indices;
        trackSegs.forEach(seg => {
            const startFrame = Math.floor(seg.start / (FRAME_MS / 1000));
            const segEnd = seg.end === null ? (audioEl.currentTime || seg.start) : seg.end;
            const endFrame = Math.ceil(segEnd / (FRAME_MS / 1000));
            const fadeFrames = Math.max(0, Math.round((seg.fade || 0) / (FRAME_MS / 1000)));

            for (let f = startFrame; f <= endFrame && f < frameCount; f++) {
                let value = 4095; // Max brightness.
                // Apply fade out if necessary.
                if (fadeFrames > 0 && f > endFrame - fadeFrames) {
                    const progress = (endFrame - f) / fadeFrames;
                    value = Math.round(4095 * Math.max(0, progress));
                }
                indices.forEach(ledIndex => {
                    matrix[f][ledIndex] = Math.max(matrix[f][ledIndex], value);
                });
            }
        });
    });

    // Format as CSV with trailing comma and CRLF line endings.
    const lines = matrix.map(row => row.join(',') + ',');
    return lines.join('\r\n') + '\r\n';
}

exportOggBtn.addEventListener('click', async () => {
    if (!selectedAudioFile) {
        alert('Please import an OGG audio file first.');
        return;
    }
    const csv = buildCsvString();
    if (!csv) {
        alert('There is nothing to export. Record something on the timeline first.');
        return;
    }

    exportOggBtn.disabled = true;
    exportOggBtn.textContent = 'Working...';

    try {
        const formData = new FormData();
        formData.append('audio', selectedAudioFile, selectedAudioFile.name);
        formData.append('csv', csv);
        formData.append('title', selectedAudioFile.name.replace(/\.[^/.]+$/, ''));

        const response = await fetch('/embed', { method: 'POST', body: formData });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Server returned an error.');
        }

        const blob = await response.blob();
        const baseName = selectedAudioFile.name.replace(/\.[^/.]+$/, '');
        const downloadUrl = URL.createObjectURL(blob);

        // Create a temporary link to trigger the download.
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `${baseName}_glyphed.ogg`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(downloadUrl);

    } catch (err) {
        alert('Export failed: ' + err.message);
    } finally {
        exportOggBtn.disabled = false;
        exportOggBtn.textContent = 'Export OGG';
    }
});

// Delete selected segment with Delete or Backspace
document.addEventListener('keydown', (e) => {
  // ignore when typing in inputs or if no selection
  const activeTag = document.activeElement && document.activeElement.tagName;
  if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || !selectedSegmentEl) return;

  if (e.key === 'Delete' || e.key === 'Backspace') {
    const el = selectedSegmentEl;
    if (!el || !el._segmentRef) return;
    const ti = el._trackIndex;
    const seg = el._segmentRef;
    const arr = segments[ti];
    const idx = arr.indexOf(seg);
    if (idx >= 0) {
      // remove and re-render
      arr.splice(idx, 1);
      selectedSegmentEl = null;
      renderTimeline();
    }
  }
});


// --- Utility Functions ---

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}


buildGlyphPreview();
