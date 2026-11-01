# THEUX Audio Intelligence Studio

Openverse searches openly licensed recordings. Earshot produces local sound effects and checks recorded audio against written cue descriptions. Real Sound is Earshot's bundled professional real-recording mixer, used when all selected cues are from Openverse.

Run `git pull origin main` after the current video finishes, then `INSTALL-LOCAL-AUDIO.bat`, then restart `THEUX-AI.bat`. The installer creates a separate CPU Python environment without modifying AMD ROCm. It downloads Earshot and open models, about 1.1 GB on first setup. FFmpeg and FFprobe are required.

Under a completed video, Audio Studio can sample still frames using local Ollama vision (if configured), suggest approximate sound cue positions, use prompt inference as a fallback, find Openverse sound candidates, and let you choose sounds and confirm individual licenses. Earshot bank presets can replace recordings. Real Sound's deterministic mixer masters cue-aligned real recordings; hybrid/synthesized setups use FFmpeg. Audio credits are exported. Your original MP4 remains unchanged.

Cues from sampled still frames are *inferences*, not frame-exact motion detection. Openverse metadata and availability must be verified at the original source. Real Sound's extensive multi-critic human/agent review process is not automated. Video render and model integration still require a real Windows end-to-end test.
