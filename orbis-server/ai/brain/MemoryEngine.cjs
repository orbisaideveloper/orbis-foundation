/**
 * Server-side conversational memory is intentionally disabled.
 * Personal memory belongs to the device-local ChatStorage contract.
 */
class DisabledServerMemoryEngine {
  async retrieveMemory() {
    return { brainKnowledge: null, memoryContext: "" };
  }

  async learnFromUser() {
    return { stored: false, reason: "SERVER_CHAT_MEMORY_DISABLED" };
  }
}

module.exports = new DisabledServerMemoryEngine();
