import { useState, useRef, useCallback } from "react";
import { Camera } from "lucide-react";
import ImageStageColumn from "@/components/ImageStageColumn";
import ImagePreviewModal from "@/components/ImagePreviewModal";
import ChatInput from "@/components/ChatInput";

interface ImageItem {
  id: string;
  url: string;
  name: string;
  timestamp: Date;
}

interface ChatMessage {
  id: string;
  text: string;
  timestamp: Date;
  type: "user" | "system";
}

type Stage = "before" | "process" | "after";

const Index = () => {
  const [images, setImages] = useState<Record<Stage, ImageItem[]>>({
    before: [],
    process: [],
    after: [],
  });
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      text: "¡Bienvenido! Sube imágenes a cada etapa o usa los botones rápidos abajo.",
      timestamp: new Date(),
      type: "system",
    },
  ]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<Stage, HTMLInputElement | null>>({
    before: null,
    process: null,
    after: null,
  });
  const [activeUploadStage, setActiveUploadStage] = useState<Stage | null>(null);

  const addImages = useCallback((stage: Stage, files: FileList) => {
    const newImages: ImageItem[] = Array.from(files)
      .filter((f) => f.type.startsWith("image/"))
      .map((f) => ({
        id: crypto.randomUUID(),
        url: URL.createObjectURL(f),
        name: f.name,
        timestamp: new Date(),
      }));

    if (newImages.length === 0) return;

    setImages((prev) => ({
      ...prev,
      [stage]: [...prev[stage], ...newImages],
    }));

    const stageLabels: Record<Stage, string> = {
      before: "Antes",
      process: "Proceso",
      after: "Después",
    };

    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        text: `📷 ${newImages.length} imagen(es) añadida(s) a "${stageLabels[stage]}"`,
        timestamp: new Date(),
        type: "system",
      },
    ]);
  }, []);

  const removeImage = useCallback((stage: Stage, id: string) => {
    setImages((prev) => ({
      ...prev,
      [stage]: prev[stage].filter((img) => img.id !== id),
    }));
  }, []);

  const handleSendMessage = (text: string) => {
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), text, timestamp: new Date(), type: "user" },
    ]);
  };

  const handleUploadToStage = (stage: Stage) => {
    setActiveUploadStage(stage);
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files) addImages(stage, files);
    };
    input.click();
  };

  const stages: {
    key: Stage;
    title: string;
    colorClass: string;
    dotColor: string;
  }[] = [
    { key: "before", title: "Antes", colorClass: "bg-stage-before", dotColor: "bg-stage-before" },
    { key: "process", title: "Proceso", colorClass: "bg-stage-process", dotColor: "bg-stage-process" },
    { key: "after", title: "Después", colorClass: "bg-stage-after", dotColor: "bg-stage-after" },
  ];

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <header className="flex items-center gap-3 px-6 py-4 border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="p-2 rounded-xl bg-primary text-primary-foreground">
          <Camera className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-lg font-bold leading-tight text-foreground">
            Organizador de Imágenes
          </h1>
          <p className="text-xs text-muted-foreground">
            Antes · Proceso · Después
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <span className="px-2.5 py-1 rounded-full bg-muted font-medium">
            {images.before.length + images.process.length + images.after.length} imágenes
          </span>
        </div>
      </header>

      {/* Columns */}
      <main className="flex-1 flex gap-4 p-4 overflow-hidden">
        {stages.map((stage) => (
          <ImageStageColumn
            key={stage.key}
            title={stage.title}
            colorClass={stage.colorClass}
            dotColor={stage.dotColor}
            images={images[stage.key]}
            onAddImages={(files) => addImages(stage.key, files)}
            onRemoveImage={(id) => removeImage(stage.key, id)}
            onPreview={setPreviewUrl}
          />
        ))}
      </main>

      {/* Chat */}
      <ChatInput
        messages={messages}
        onSendMessage={handleSendMessage}
        onUploadToStage={handleUploadToStage}
      />

      {/* Modal */}
      <ImagePreviewModal url={previewUrl} onClose={() => setPreviewUrl(null)} />
    </div>
  );
};

export default Index;