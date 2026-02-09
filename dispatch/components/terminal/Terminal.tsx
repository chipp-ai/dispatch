"use client";

import TerminalHeader from "./TerminalHeader";
import TerminalMessages from "./TerminalMessages";
import TerminalInput from "./TerminalInput";
import { useOrchestrator } from "./useOrchestrator";

export default function Terminal() {
  const {
    messages,
    isStreaming,
    sessionId,
    error,
    activeToolName,
    turnMetrics,
    sendMessage,
    cancelStream,
    clearConversation,
  } = useOrchestrator();

  return (
    <div className="flex flex-col h-full bg-[#0a0a08] rounded-lg border border-[#2a2200] overflow-hidden">
      <TerminalHeader sessionId={sessionId} onClear={clearConversation} />

      <TerminalMessages messages={messages} isStreaming={isStreaming} />

      {/* Error bar */}
      {error && (
        <div className="px-4 py-2 bg-[#f8717110] border-t border-[#f8717130] text-[11px] font-mono text-[#f87171]">
          Error: {error}
        </div>
      )}

      <TerminalInput
        onSubmit={sendMessage}
        isStreaming={isStreaming}
        onCancel={cancelStream}
        activeToolName={activeToolName}
        turnMetrics={turnMetrics}
      />
    </div>
  );
}
