/* stt_core.js
   Mira X Common STT Utility
   - Standardizes Web Speech API usage
   - Deterministic final results (Deduplication)
   - Robust Lifecycle (Backoff Restart)
   - Execution Guards (Mutex + Cooldowns)
*/

(function (global) {
    const SpeechRecognition = global.SpeechRecognition || global.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        console.warn("[STT Core] Web Speech API not supported.");
        global.MiraSTT = {
            isSupported: false,
            start: () => { },
            guard: (id, fn) => { fn(); } // Fallback: run immediately if STT not supported? Or no-op.
        };
        return;
    }

    class STTManager {
        constructor() {
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = false;
            this.recognition.interimResults = false;
            this.recognition.lang = "ko-KR";
            this.recognition.maxAlternatives = 1;

            // Logic State
            this.isListening = false;      // Engine state
            this.shouldBeListening = false;// Desired state
            this.callback = null;          // Result handler

            // Hardening: Deduplication
            this.lastTranscript = "";
            this.lastTranscriptTime = 0;

            // Hardening: Lifecycle Backoff
            this.restartTimer = null;
            this.backoffMs = 300;
            this.MAX_BACKOFF = 2000;
            this.stableConnectionTimer = null;

            // Hardening: Guards (Mutex & Cooldown)
            this.isExecuting = false;      // Mutex
            this.globalCooldownUntil = 0;
            this.commandCooldowns = {};    // Map<CommandID, UnlockTime>

            // Event Bindings
            this.recognition.onstart = () => {
                this.isListening = true;
                // If connection stays alive for 5s, reset backoff
                if (this.stableConnectionTimer) clearTimeout(this.stableConnectionTimer);
                this.stableConnectionTimer = setTimeout(() => {
                    this.backoffMs = 300;
                }, 5000);
            };

            this.recognition.onend = () => {
                this.isListening = false;
                this.handleEnd();
            };

            this.recognition.onerror = (event) => {
                // console.warn("[STT Core] Error:", event.error);
                if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                    this.shouldBeListening = false; // Stop trying
                    console.error("[STT Core] Permission denied or service unavailable. Stopping.");
                }
            };

            this.recognition.onresult = (event) => this.processResult(event);
        }

        // --- Lifecycle ---

        start(onResultCallback) {
            if (onResultCallback) this.callback = onResultCallback;
            this.shouldBeListening = true;
            this.backoffMs = 300; // Reset on explicit start
            this._startEngine();
        }

        _startEngine() {
            if (this.isListening) return;
            try {
                this.recognition.start();
            } catch (e) {
                // console.warn("[STT Core] Start ignored:", e);
            }
        }

        handleEnd() {
            if (this.shouldBeListening) {
                if (this.restartTimer) clearTimeout(this.restartTimer);
                this.restartTimer = setTimeout(() => {
                    this._startEngine();
                    // Exponential backoff
                    this.backoffMs = Math.min(this.backoffMs * 1.5, this.MAX_BACKOFF);
                }, this.backoffMs);
            }
        }

        // --- Processing ---

        normalize(text) {
            if (!text) return "";
            return text.replace(/\s+/g, "").trim();
        }

        processResult(event) {
            if (!event.results || !event.results.length) return;
            const result = event.results[event.results.length - 1];
            if (!result.isFinal) return;

            const raw = result[0].transcript;
            const normalized = this.normalize(raw);
            const now = Date.now();

            // 1. Transcript Deduplication
            if (normalized === this.lastTranscript && (now - this.lastTranscriptTime < 1000)) {
                console.log("[STT Core] Dedupe ignored:", normalized);
                return;
            }

            this.lastTranscript = normalized;
            this.lastTranscriptTime = now;

            console.log("[STT FINAL]", normalized);
            if (this.callback) this.callback(normalized);
        }

        // --- Guards ---

        /**
         * Safe Command Execution
         * @param {string} commandId - Unique ID for per-command cooldown (e.g., 'keep_open')
         * @param {Function} actionFn - function to execute
         */
        guard(commandId, actionFn) {
            const now = Date.now();

            // 1. Mutex (Wait previous action)
            if (this.isExecuting) {
                console.log("[STT Guard] Blocked (Busy):", commandId);
                return;
            }

            // 2. Global Cooldown (Throttle all commands)
            if (now < this.globalCooldownUntil) {
                console.log("[STT Guard] Blocked (Global Cooldown):", commandId);
                return;
            }

            // 3. Command Cooldown (Throttle specific command)
            if (this.commandCooldowns[commandId] && now < this.commandCooldowns[commandId]) {
                console.log("[STT Guard] Blocked (CMD Cooldown):", commandId);
                return;
            }

            // Execute
            this.isExecuting = true;
            try {
                console.log("[STT CMD]", commandId);
                actionFn();
            } catch (e) {
                console.error("[STT Guard] Action Failed:", e);
            } finally {
                // Set cooldowns
                this.globalCooldownUntil = now + 800;  // 800ms global silence
                this.commandCooldowns[commandId] = now + 1200; // 1.2s per-command throttle

                // Release mutex after short delay (UI stabilization)
                setTimeout(() => {
                    this.isExecuting = false;
                }, 300);
            }
        }
    }

    global.MiraSTT = new STTManager();
    global.MiraSTT.isSupported = true;

})(window);
