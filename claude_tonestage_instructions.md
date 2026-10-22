# ToneStage — Create the React Native Project First

> **Important:** If you have not created the React Native project yet, complete these steps before asking Claude Code to implement the app.

## 1. App name and identifiers

- **App display name:** ToneStage
- **Tagline:** Your Sound. Your Stage.
- **React Native project/folder name:** `ToneStage`
- **Android application ID:** `com.tonestage.app`
- **Language:** JavaScript
- **Framework:** React Native CLI (not Expo)
- **Initial target:** Android

The name is a working name. Before publishing, check Google Play and trademark availability.

## 2. Create the project on Windows

Open PowerShell or the VS Code terminal and navigate to the parent folder where you keep your coding projects. For example:

```powershell
cd D:\Projects
```

Use your own preferred folder if it is different. Then run:

```powershell
npx @react-native-community/cli@latest init ToneStage --package-name com.tonestage.app --title ToneStage --pm npm
```

Wait for the command to finish. It creates the `ToneStage` folder and installs the initial dependencies. If the CLI asks for confirmation, read the prompt before proceeding.

> Do not run the initialization command inside an existing project folder with the same name. If `ToneStage` already exists, choose another parent folder or inspect the existing folder first.

## 3. Open the project in VS Code

```powershell
cd ToneStage
code .
```

If the `code` command is unavailable, open VS Code manually and select **File → Open Folder → ToneStage**.

## 4. Verify the environment and run the starter app

First check the React Native environment:

```powershell
npx @react-native-community/cli doctor
```

Connect an Android phone with USB debugging enabled, or start an Android emulator. Make sure the phone is authorized for USB debugging.

Open two terminals in the project folder.

**Terminal 1 — start Metro:**

```powershell
npm start
```

**Terminal 2 — build and install on Android:**

```powershell
npm run android
```

If the project template does not provide that script, use:

```powershell
npx @react-native-community/cli run-android
```

Wait for the first Android build to finish. The initial Gradle build can take several minutes. Confirm that the default React Native starter screen opens on the phone/emulator before adding features.

If a build fails, save the full error output and resolve the environment/build problem before proceeding. Do not install random dependencies to try to fix an unrelated environment error.

## 5. Add this instruction file to the project

Save this Markdown file in the **root of the `ToneStage` folder**, alongside `package.json` and `android/`. Its filename can be:

`claude_tonestage_instructions.md`

Then open Claude Code from that folder and send this prompt:

> Read `claude_tonestage_instructions.md` completely and follow its instructions. First inspect my newly created React Native Android project, report the installed versions and current architecture, and verify the starter app/build configuration. Do not replace or regenerate the project. Start with the repository audit and the first small part of Milestone 1. Implement the ToneStage splash screen according to the instructions without disrupting the existing launch configuration. Make actual code changes, run available Android build checks, and report exactly what was and was not tested. Do not implement the entire application in one pass.

---

# Claude Code Project Instructions — ToneStage Mobile

> Salin prompt ini ke Claude Code dari folder root proyek React Native. Minta Claude membaca seluruh proyek sebelum mengubah file. Implementasi dilakukan bertahap, bukan sekaligus.

## Project Overview

Build an Android application using **React Native CLI and JavaScript** for recording electric-guitar performances with video. The workflow is inspired by OBS Studio's sources, audio mixer, monitoring, and recording features, adapted for a mobile phone.

The app has three independent sources:

1. **Video:** Xiaomi Yi Action Camera Gen 1 over Wi-Fi using its live RTSP stream.
2. **Guitar audio:** Sonicake Pocket Master connected to Android through USB OTG as an external audio interface.
3. **Backing track:** A local MP3 or WAV file selected from the phone.

The user must be able to preview the camera, play a backing track, capture clean guitar audio, monitor the mix, and export a synchronized video directly to the phone.

**Critical requirement:** Capture the camera's live stream directly. Never rely on importing or transferring recordings from the camera's SD card. The camera is a live video source, not a file source.

## Technology and Architecture

- React Native CLI, JavaScript, Android-first. Do not use Expo.
- Kotlin for Android native modules.
- Consider C++ with Oboe/AAudio for low-latency audio only when justified.
- Evaluate Android Media3/ExoPlayer for RTSP preview and MediaCodec/MediaMuxer or FFmpeg for recording/export.
- Use Android USB host/audio APIs or a maintained compatible native solution for external audio capture.
- Keep UI, camera handling, audio capture, playback, recording orchestration, and export logic separated.
- Prefer simple, maintainable, learning-friendly code. Avoid unnecessary abstraction.
- Inspect the current React Native, Gradle, Android Gradle Plugin, Java/Kotlin, and SDK versions before selecting dependencies.
- Check dependency compatibility and maintenance status before adding libraries.
- Preserve working code and existing conventions where reasonable.

## Camera: Xiaomi Yi Action Camera Gen 1

Implement a wireless live camera source.

Expected workflow:

1. The phone connects to the Yi camera's Wi-Fi network.
2. The app allows the user to configure the camera IP and RTSP URL.
3. Test the commonly reported URL `rtsp://192.168.42.1/live`, but do not assume it works with every firmware or configuration.
4. Investigate whether the camera needs a live-view activation command.
5. Display a real preview, connection state, decoded resolution, and useful errors.
6. Allow starting/stopping capture of the incoming live stream to phone storage when technically supported.
7. Release sockets, decoders, and other resources correctly.

Protocol reference for investigation:
https://github.com/mariomka/yi-action-camera

Constraints:
- Do not claim 1080p unless the actual live stream supports it.
- Report the actual decoded stream resolution.
- Handle Wi-Fi loss, RTSP errors, timeouts, and unsupported codecs.
- Never silently fall back to SD-card transfer.
- Before committing to a recording library, verify whether it can save/remux incoming RTSP media or whether a custom native pipeline/re-encoding is required.

## Guitar Audio: Sonicake Pocket Master

The Pocket Master is expected to connect through USB OTG as an audio interface.

Implement:
- Real USB audio device/connection status.
- Inspection of supported sample rates, channels, and formats.
- Clean PCM guitar capture, preferably WAV.
- A live input level meter and clipping indication.
- Start/stop/save controls.
- Safe handling of USB disconnection and reconnection.
- Proper resource cleanup and clear errors.

Target 44.1 kHz only if confirmed to be supported by the actual device. Do not assume a specific format, channel count, or USB routing configuration. Test with the physical device.

Keep the guitar recording separate from backing-track audio and monitoring mix. Do not make phone microphone capture a mandatory fallback.

## Backing Track

Implement a local MP3/WAV player using Android's document picker or an appropriate maintained picker library.

Required:
- Select a file.
- Show file name, duration, and playback position.
- Play, pause, stop, and seek.
- Independent volume.
- Maintain reliable playback timing for later synchronization.
- Preserve the original file or a safe URI/reference.
- Do not mix the backing track into the clean guitar recording during capture.

## Audio Mixer and Monitoring

Create separate mixer channels for:
- Guitar input.
- Backing track.
- Master/monitor output.

Each channel should have:
- Volume control.
- Mute.
- Level meter.
- Source/device status.
- Clipping indication where applicable.

Allow selecting compatible output devices, such as wired headphones, USB audio output, or Bluetooth when supported.

Important:
- Distinguish recorded source levels from monitoring levels.
- Avoid feedback loops and accidental re-recording of the monitored mix.
- Explain limitations if the phone cannot use the Pocket Master for input and output simultaneously.
- Warn about high monitoring latency.
- Do not promise zero latency.
- Prefer direct monitoring through the Pocket Master if supported and appropriate.
- Verify whether backing-track playback can actually be routed to the Pocket Master's headphone output. Do not assume this works.
- Bluetooth monitoring may have too much latency for real-time guitar performance; show an appropriate warning.

## Recording, Synchronization, and Export

The final result combines:
- Live video from the Yi camera.
- Clean guitar audio from the Pocket Master.
- The selected backing track.

Requirements:
1. Start/stop recording with clear status.
2. Save camera video directly from its live stream.
3. Save clean guitar audio separately.
4. Track audio sample positions, media timestamps, and backing-track playback timing.
5. Preserve intermediate files until export completes successfully.
6. Combine video and audio during finalization.
7. Export a playable synchronized MP4.
8. Report export failures and allow retry.
9. Include a manual synchronization offset if testing shows a consistent delay.
10. Never claim synchronization is accurate until verified on a physical device.

Investigate whether video can be remuxed without re-encoding. Explain trade-offs before implementing a costly pipeline. JavaScript timers alone must not be the source of truth for media synchronization.

## UI and Visual Design

Create a polished, mobile-first dark interface inspired by OBS Studio but redesigned for Android. All user-facing labels and errors must be in **Indonesian**.

Main recording screen:
- Camera preview.
- Camera connection indicator.
- Audio input indicator.
- Backing-track player.
- Compact audio mixer.
- Monitoring output selector.
- Prominent record/stop button.
- Recording duration and available-storage indicator.

Additional screens:
- Sources and devices.
- Audio routing/monitoring.
- Recording settings.
- Recorded projects and exports.
- App settings.

Design principles:
- Dark studio theme, comfortable for use while recording.
- Strong visual hierarchy and readable typography.
- Clear icons and genuine device/recording states.
- Controls reachable on a phone screen.
- Avoid cramming a desktop-sized OBS layout into a mobile screen.
- Use reusable components and consistent spacing.
- Use real functionality, not mock data or decorative fake status.

## Splash Screen and App Branding

Create a polished, native-feeling splash screen for the application. The working app name is **ToneStage**; keep the name and branding easy to change later.

Visual direction:
- Premium dark studio aesthetic.
- Near-black or deep charcoal background.
- A simple, memorable logo combining a guitar pick or guitar silhouette with a subtle waveform or recording indicator.
- Clear app name: **ToneStage**.
- Optional short subtitle: **Record. Play. Create.**
- Minimal, professional, high contrast; avoid excessive gradients, visual clutter, or a generic template look.
- Match the app's dark UI theme.
- Center the logo and name with balanced spacing and safe-area awareness.
- Use a subtle, short animation only if it can be implemented reliably and does not delay startup unnecessarily.
- Support the Android 12+ system splash-screen requirements as well as the project's actual minimum Android version.
- Ensure the splash screen transitions smoothly to the app and does not show a blank/white flash.

Implementation requirements:
1. Inspect the project's Android version, minimum SDK, existing launch theme, and React Native setup first.
2. Prefer Android's native splash-screen mechanism compatible with the project's SDK; use a maintained React Native splash library only if needed and compatible.
3. Create the logo as a scalable vector/native drawable when practical so it stays crisp at different densities.
4. Add any required splash assets and theme configuration in the correct Android resource folders.
5. Keep splash-screen branding consistent with the in-app header/icon.
6. Do not block startup while waiting for the camera, USB device, or audio engine.
7. Do not put real device initialization or network connection logic in the splash screen.
8. Verify that the splash screen displays on a real Android launch and that it transitions correctly.

If image assets are needed, first decide whether a simple vector drawable is sufficient. Do not add a large raster asset unnecessarily. If you create an image-based logo, include its source/editable version when practical and document how to replace it.

## Suggested Project Separation

Adapt to the existing repository rather than forcing this exact structure:

- JavaScript screens and reusable UI components.
- Camera/RTSP native module.
- USB audio/audio-engine native module.
- Backing-track playback service.
- Recording orchestration service.
- Media export/synchronization service.
- Permissions, lifecycle, and device handling.
- Local project/recording metadata.
- Splash-screen and app-branding assets.

Do not put all logic in one screen or component.

## Milestones

### Milestone 0 — Repository audit and design plan
- Inspect project files and current versions.
- Report architecture and build configuration.
- Identify risks and dependency options.
- Review splash-screen implementation requirements.
- Propose the smallest testable first milestone.
- Do not rewrite the project structure unnecessarily.

### Milestone 1 — Yi RTSP proof of concept
- Implement editable RTSP URL, connect/disconnect, preview, connection state, actual resolution, and errors.
- Investigate required Yi Gen 1 stream activation.
- Implement direct stream recording only if the selected pipeline genuinely supports it.
- Run build checks and provide physical-device test steps.

### Milestone 2 — Pocket Master audio proof of concept
- Detect the device and inspect capabilities.
- Record clean guitar audio to WAV.
- Show a level meter and clipping indication.
- Test simultaneous operation with camera preview/recording.

### Milestone 3 — Backing-track player and mixer
- Implement local file selection and playback.
- Add independent channel levels, mute, meters, and monitoring selection.
- Test real Android routing and latency.

### Milestone 4 — Recording orchestration
- Record video and clean guitar audio concurrently.
- Track timestamps and playback positions.
- Preserve intermediate files and handle failures.

### Milestone 5 — Synchronization and export
- Combine video, guitar audio, and backing track.
- Export MP4 and test synchronization on actual recordings.
- Add offset correction if necessary.

### Milestone 6 — UI polish and release readiness
- Complete the mobile UI and splash screen.
- Test lifecycle, screen rotation, Wi-Fi/USB disconnection, storage limits, and recovery.
- Document setup, testing, and release build steps.

## How You Must Work

Before coding:
1. Inspect the existing repository and relevant files.
2. Report installed versions and the current architecture.
3. Identify uncertain hardware capabilities and dependencies.
4. Explain which items require physical-device verification.
5. Present a concise implementation plan.

Then implement **Milestone 0 and the first small part of Milestone 1 only**. Include the splash screen only if it can be added without disrupting the existing launch configuration; otherwise provide a separate implementation plan and implement it in a focused change.

When modifying the repository:
- Make actual changes rather than only printing code.
- Do not overwrite unrelated working code.
- Run available Android/Gradle build checks.
- Fix errors introduced by your changes.
- List changed files and explain them.
- Clearly state what was and was not tested.
- Never pretend an untested feature works.

Start by inspecting the repository. Do not implement the entire application in one pass.
