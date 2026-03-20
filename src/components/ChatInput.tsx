import { useState } from "react";
import { Send, ImagePlus } from "lucide-react";

interface ChatMessage {
  id: string;
  text: string;
  timestamp: Date;
  type: "user" | "system";
}

interface ChatInputProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  onUploadToStage: (stage: "before" | "process" | "after") => void;
}

const ChatInput = ({ messages, onSendMessage, onUploadToStage }: ChatInputProps) => {
  const [input, setInput] = useState("");

  const handleSend = () => {
    if (!input.trim()) return;
    onSendMessage(input.trim());
    setInput("");
  };

  return (
    <div className="border-t border-border bg-card/80 backdrop-blur-sm">
      {/* Message history */}
      <div className="max-h-32 overflow-y-auto scroll-hidden px-4 py-2 space-y-1.5">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`text-xs px-3 py-1.5 rounded-lg max-w-[80%] ${
              msg.type === "user"
                ? "ml-auto bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {msg.text}
          </div>
        ))}
      </div>

      {/* Input area */}
      <div className="flex items-center gap-2 px-4 py-3">
        <div className="flex gap-1">
          {(["before", "process", "after"] as const).map((stage) => {
            const labels = { before: "Antes", process: "Proceso", after: "Después" };
            const colors = {
              before: "bg-stage-before",
              process: "bg-stage-process",
              after: "bg-stage-after",
            };
            return (
              <button
                key={stage}
                onClick={() => onUploadToStage(stage)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-primary-foreground ${colors[stage]} hover:opacity-90 active:scale-95 transition-all`}
                title={`Subir a ${labels[stage]}`}
              >
                <ImagePlus className="w-3.5 h-3.5" />
                {labels[stage]}
              </button>
            );
          })}
        </div>

        <div className="flex-1 flex items-center gap-2 bg-background rounded-lg border border-input px-3 py-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Escribe una nota..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="p-1.5 rounded-md text-primary hover:bg-primary/10 disabled:opacity-30 active:scale-95 transition-all"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatInput;