import "ai"

export function silenceSdkWarnings() {
  globalThis.AI_SDK_LOG_WARNINGS = false
}
