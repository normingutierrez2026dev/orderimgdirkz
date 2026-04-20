import { useState, useRef, useEffect } from "react";
import { Send, Sparkles, Upload, Loader2, FolderUp } from "lucide-react";

interface ChatMessage {
  id: string;
  text: string;
  timestamp: Date;
  type: "user" | "system";
}

interface ChatInputProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  onUploadAndClassify: (files: FileList) => void;
  isClassifying: boolean;
  isReplying?: boolean;
}

const ChatInput = ({ messages, onSendMessage, onUploadAndClassify, isClassifying, isReplying }: ChatInputProps) => {
  const [input, setInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || isReplying) return;
    onSendMessage(input.trim());
    setInput("");
  };

  return (
    <div className="border-t border-border bg-card/80 backdrop-blur-sm">
      {/* Message history */}
      <div ref={scrollRef} className="max-h-48 overflow-y-auto scroll-hidden px-4 py-2 space-y-1.5">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`text-xs px-3 py-2 rounded-lg max-w-[85%] whitespace-pre-line ${
              msg.type === "user"
                ? "ml-auto bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {msg.text}
          </div>
        ))}
        {isReplying && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground px-3 py-2">
            <Loader2 className="w-3 h-3 animate-spin" />
            Pensando...
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="flex items-center gap-2 px-4 py-3 flex-wrap">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isClassifying}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 active:scale-[0.97] transition-all disabled:opacity-50 shadow-sm"
        >
          {isClassifying ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Clasificando...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Subir y Clasificar
            </>
          )}
        </button>

        <button
          onClick={() => folderInputRef.current?.click()}
          disabled={isClassifying}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:opacity-90 active:scale-[0.97] transition-all disabled:opacity-50 shadow-sm border border-border"
        >
          <FolderUp className="w-4 h-4" />
          Subir Carpeta
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              onUploadAndClassify(e.target.files);
              e.target.value = "";
            }
          }}
        />

        <input
          ref={folderInputRef}
          type="file"
          multiple
          className="hidden"
          // @ts-expect-error - non-standard but widely supported attributes for folder upload
          webkitdirectory=""
          directory=""
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              // Filter only images (recursive folder upload returns all files)
              const onlyImages = Array.from(e.target.files).filter((f) => f.type.startsWith("image/"));
              if (onlyImages.length === 0) return;
              const dt = new DataTransfer();
              onlyImages.forEach((f) => dt.items.add(f));
              onUploadAndClassify(dt.files);
              e.target.value = "";
            }
          }}
        />

        <div className="flex-1 min-w-[200px] flex items-center gap-2 bg-background rounded-lg border border-input px-3 py-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Pregunta sobre tus imágenes..."
            disabled={isReplying}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isReplying}
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

interface ChatMessage {
  id: string;
  text: string;
  timestamp: Date;
  type: "user" | "system";
}

interface ChatInputProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  onUploadAndClassify: (files: FileList) => void;
  isClassifying: boolean;
  isReplying?: boolean;
}

const ChatInput = ({ messages, onSendMessage, onUploadAndClassify, isClassifying, isReplying }: ChatInputProps) => {
  const [input, setInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || isReplying) return;
    onSendMessage(input.trim());
    setInput("");
  };

  return (
    <div className="border-t border-border bg-card/80 backdrop-blur-sm">
      {/* Message history */}
      <div ref={scrollRef} className="max-h-48 overflow-y-auto scroll-hidden px-4 py-2 space-y-1.5">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`text-xs px-3 py-2 rounded-lg max-w-[85%] whitespace-pre-line ${
              msg.type === "user"
                ? "ml-auto bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {msg.text}
          </div>
        ))}
        {isReplying && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground px-3 py-2">
            <Loader2 className="w-3 h-3 animate-spin" />
            Pensando...
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="flex items-center gap-2 px-4 py-3">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isClassifying}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 active:scale-[0.97] transition-all disabled:opacity-50 shadow-sm"
        >
          {isClassifying ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Clasificando...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Subir y Clasificar
            </>
          )}
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              onUploadAndClassify(e.target.files);
              e.target.value = "";
            }
          }}
        />

        <div className="flex-1 flex items-center gap-2 bg-background rounded-lg border border-input px-3 py-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Pregunta sobre tus imágenes..."
            disabled={isReplying}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isReplying}
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
