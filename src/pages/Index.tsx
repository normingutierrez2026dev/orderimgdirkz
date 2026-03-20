import { useState, useCallback } from "react";
import { Camera, Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import ImageStageColumn from "@/components/ImageStageColumn";
import ImagePreviewModal from "@/components/ImagePreviewModal";
import ChatInput from "@/components/ChatInput";
import { toast } from "sonner";

interface ImageItem {
  id: string;
  url: string;
  name: string;
  timestamp: Date;
  reason?: string;
}

interface ChatMessage {
  id: string;
  text: string;
  timestamp: Date;
  type: "user" | "system";
}

type Stage = "before" | "process" | "after";

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const resizeImage = (dataUrl: string, maxSize = 800): Promise<string> =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.7));
    };
    img.src = dataUrl;
  });

const Index = () => {
  const [images, setImages] = useState<Record<Stage, ImageItem[]>>({
    before: [],
    process: [],
    after: [],
  });
  const [pendingImages, setPendingImages] = useState<ImageItem[]>([]);
  const [isClassifying, setIsClassifying] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      text: "¡Bienvenido! Sube imágenes y la IA las clasificará automáticamente en Antes, Proceso y Después.",
      timestamp: new Date(),
      type: "system",
    },
  ]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const addSystemMessage = (text: string) => {
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), text, timestamp: new Date(), type: "system" },
    ]);
  };

  const classifyImages = useCallback(
    async (newItems: { id: string; url: string; name: string; dataUrl: string }[]) => {
      setIsClassifying(true);
      addSystemMessage(`🤖 Analizando ${newItems.length} imagen(es) con IA...`);

      try {
        // Resize for API
        const resizedImages = await Promise.all(
          newItems.map(async (img) => ({
            id: img.id,
            dataUrl: await resizeImage(img.dataUrl),
          }))
        );

        const { data, error } = await supabase.functions.invoke("classify-images", {
          body: { images: resizedImages },
        });

        if (error) throw new Error(error.message || "Error al clasificar");

        const classifications: { id: string; stage: Stage; reason: string }[] =
          data?.classifications || [];

        const stageLabels: Record<Stage, string> = {
          before: "Antes",
          process: "Proceso",
          after: "Después",
        };

        // Move images to their classified stages
        setImages((prev) => {
          const updated = { ...prev };
          for (const cls of classifications) {
            const item = newItems.find((i) => i.id === cls.id);
            if (item) {
              updated[cls.stage] = [
                ...updated[cls.stage],
                {
                  id: item.id,
                  url: item.url,
                  name: item.name,
                  timestamp: new Date(),
                  reason: cls.reason,
                },
              ];
            }
          }
          return updated;
        });

        // Remove from pending
        setPendingImages((prev) =>
          prev.filter((p) => !classifications.some((c) => c.id === p.id))
        );

        // Summary message
        const summary = classifications
          .map((c) => `• ${newItems.find((i) => i.id === c.id)?.name} → ${stageLabels[c.stage]} (${c.reason})`)
          .join("\n");
        addSystemMessage(`✅ Clasificación completada:\n${summary}`);
      } catch (err: any) {
        console.error("Classification error:", err);
        toast.error("Error al clasificar imágenes");
        addSystemMessage(`❌ Error: ${err.message}`);

        // On error, keep in pending so user can retry or manually sort
      } finally {
        setIsClassifying(false);
      }
    },
    []
  );

  const handleUploadAndClassify = useCallback(
    async (files: FileList) => {
      const validFiles = Array.from(files).filter((f) =>
        f.type.startsWith("image/")
      );
      if (validFiles.length === 0) return;

      // Create items with blob URLs for display and dataURLs for AI
      const items = await Promise.all(
        validFiles.map(async (f) => ({
          id: crypto.randomUUID(),
          url: URL.createObjectURL(f),
          name: f.name,
          dataUrl: await fileToDataUrl(f),
          timestamp: new Date(),
        }))
      );

      setPendingImages((prev) => [...prev, ...items]);
      addSystemMessage(`📷 ${items.length} imagen(es) subida(s). Clasificando...`);

      // Classify
      await classifyImages(items);
    },
    [classifyImages]
  );

  const handleManualAdd = useCallback((stage: Stage, files: FileList) => {
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
    addSystemMessage(
      `📷 ${newImages.length} imagen(es) añadida(s) manualmente a "${stageLabels[stage]}"`
    );
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

  const totalImages =
    images.before.length + images.process.length + images.after.length;

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
            Organizador de Imágenes con IA
          </h1>
          <p className="text-xs text-muted-foreground">
            Sube imágenes y la IA las clasifica automáticamente
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {isClassifying && (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-stage-process/10 text-stage-process text-xs font-medium">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Clasificando...
            </span>
          )}
          <span className="px-2.5 py-1 rounded-full bg-muted text-xs font-medium text-muted-foreground">
            {totalImages} clasificadas
          </span>
          {pendingImages.length > 0 && (
            <span className="px-2.5 py-1 rounded-full bg-accent/10 text-accent text-xs font-medium">
              {pendingImages.length} pendientes
            </span>
          )}
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
            onAddImages={(files) => handleManualAdd(stage.key, files)}
            onRemoveImage={(id) => removeImage(stage.key, id)}
            onPreview={setPreviewUrl}
          />
        ))}
      </main>

      {/* Chat / Upload */}
      <ChatInput
        messages={messages}
        onSendMessage={handleSendMessage}
        onUploadAndClassify={handleUploadAndClassify}
        isClassifying={isClassifying}
      />

      {/* Modal */}
      <ImagePreviewModal url={previewUrl} onClose={() => setPreviewUrl(null)} />
    </div>
  );
};

export default Index;
