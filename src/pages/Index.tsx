import { useState, useCallback } from "react";
import { Camera, Loader2 } from "lucide-react";
import { DragDropContext, type DropResult } from "@hello-pangea/dnd";
import { supabase } from "@/integrations/supabase/client";
import ImageStageColumn from "@/components/ImageStageColumn";
import ImagePreviewModal from "@/components/ImagePreviewModal";
import ChatInput from "@/components/ChatInput";
import { toast } from "sonner";
import { extractExif } from "@/lib/exif";
import type { ImageItem, ChatMessage, Stage } from "@/lib/types";
import { stageLabels, sceneLabels } from "@/lib/types";

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
  const [manualCorrections, setManualCorrections] = useState(0);
  const [totalClassified, setTotalClassified] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      text: "¡Bienvenido! Sube imágenes y la IA las clasificará automáticamente en Antes, Proceso y Después. Puedes arrastrar imágenes entre columnas si la IA se equivoca.",
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

  // Drag & drop between columns
  const handleDragEnd = useCallback((result: DropResult) => {
    const { source, destination, draggableId } = result;
    if (!destination || (source.droppableId === destination.droppableId && source.index === destination.index)) return;

    const srcStage = source.droppableId as Stage;
    const dstStage = destination.droppableId as Stage;

    setImages((prev) => {
      const updated = { ...prev };
      const srcList = [...updated[srcStage]];
      const [moved] = srcList.splice(source.index, 1);
      updated[srcStage] = srcList;

      const dstList = [...updated[dstStage]];
      dstList.splice(destination.index, 0, moved);
      updated[dstStage] = dstList;

      return updated;
    });

    if (srcStage !== dstStage) {
      setManualCorrections((c) => c + 1);
      addSystemMessage(`🔄 Imagen movida de "${stageLabels[srcStage]}" a "${stageLabels[dstStage]}" (corrección manual)`);
    }
  }, []);

  const classifyImages = useCallback(
    async (newItems: { id: string; url: string; name: string; dataUrl: string; exif?: any }[]) => {
      setIsClassifying(true);
      addSystemMessage(`🤖 Analizando ${newItems.length} imagen(es) con IA...`);

      try {
        const resizedImages = await Promise.all(
          newItems.map(async (img) => ({
            id: img.id,
            dataUrl: await resizeImage(img.dataUrl),
            exif: img.exif || undefined,
          }))
        );

        const { data, error } = await supabase.functions.invoke("classify-images", {
          body: { images: resizedImages },
        });

        if (error) throw new Error(error.message || "Error al clasificar");

        const classifications: { id: string; stage: Stage; scene: string; confidence: number; reason: string }[] =
          data?.classifications || [];

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
                  scene: cls.scene,
                  confidence: cls.confidence,
                  exif: item.exif,
                },
              ];
            }
          }
          return updated;
        });

        setPendingImages((prev) =>
          prev.filter((p) => !classifications.some((c) => c.id === p.id))
        );

        setTotalClassified((t) => t + classifications.length);

        const summary = classifications
          .map((c) => {
            const name = newItems.find((i) => i.id === c.id)?.name;
            const conf = Math.round(c.confidence * 100);
            const scene = sceneLabels[c.scene] || c.scene;
            return `• ${name} → ${stageLabels[c.stage]} | ${scene} (${conf}%) — ${c.reason}`;
          })
          .join("\n");
        addSystemMessage(`✅ Clasificación completada:\n${summary}`);
      } catch (err: any) {
        console.error("Classification error:", err);
        toast.error("Error al clasificar imágenes");
        addSystemMessage(`❌ Error: ${err.message}`);
      } finally {
        setIsClassifying(false);
      }
    },
    []
  );

  const handleUploadAndClassify = useCallback(
    async (files: FileList) => {
      const validFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
      if (validFiles.length === 0) return;

      const items = await Promise.all(
        validFiles.map(async (f) => {
          const [dataUrl, exif] = await Promise.all([fileToDataUrl(f), extractExif(f)]);
          return {
            id: crypto.randomUUID(),
            url: URL.createObjectURL(f),
            name: f.name,
            dataUrl,
            exif,
            timestamp: new Date(),
          };
        })
      );

      setPendingImages((prev) => [...prev, ...items]);

      const exifCount = items.filter((i) => i.exif).length;
      let msg = `📷 ${items.length} imagen(es) subida(s).`;
      if (exifCount > 0) msg += ` 📋 Metadatos EXIF extraídos de ${exifCount} foto(s).`;
      msg += " Clasificando...";
      addSystemMessage(msg);

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

  const [isReplying, setIsReplying] = useState(false);

  const buildImageContext = useCallback(() => {
    const lines: string[] = [];
    for (const stage of ["before", "process", "after"] as Stage[]) {
      const imgs = images[stage];
      if (imgs.length > 0) {
        lines.push(`**${stageLabels[stage]}** (${imgs.length} imágenes):`);
        imgs.forEach((img) => {
          let info = `- ${img.name}`;
          if (img.scene) info += ` | Escena: ${sceneLabels[img.scene] || img.scene}`;
          if (img.confidence) info += ` | Confianza: ${Math.round(img.confidence * 100)}%`;
          if (img.reason) info += ` | Razón: ${img.reason}`;
          if (img.exif?.date) info += ` | Fecha: ${img.exif.date}`;
          if (img.exif?.gps) info += ` | GPS: ${img.exif.gps}`;
          lines.push(info);
        });
      }
    }
    if (totalClassified > 0) {
      lines.push(`\nEstadísticas: ${totalImages} clasificadas, ${correctionRate}% correcciones manuales.`);
    }
    return lines.length > 0 ? lines.join("\n") : "No hay imágenes clasificadas aún.";
  }, [images, totalClassified, totalImages, correctionRate]);

  const handleSendMessage = useCallback(async (text: string) => {
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), text, timestamp: new Date(), type: "user" },
    ]);
    setIsReplying(true);

    try {
      const { data, error } = await supabase.functions.invoke("chat", {
        body: { message: text, imageContext: buildImageContext() },
      });

      if (error) throw new Error(error.message || "Error al consultar IA");

      const reply = data?.reply || "No pude generar una respuesta.";
      addSystemMessage(`🤖 ${reply}`);
    } catch (err: any) {
      console.error("Chat error:", err);
      addSystemMessage(`❌ Error: ${err.message}`);
    } finally {
      setIsReplying(false);
    }
  }, [buildImageContext]);

  const totalImages = images.before.length + images.process.length + images.after.length;
  const correctionRate = totalClassified > 0 ? Math.round((manualCorrections / totalClassified) * 100) : 0;

  const stages: { key: Stage; title: string; colorClass: string; dotColor: string }[] = [
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
            Clasificación automática · Arrastra para corregir
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
          {totalClassified > 0 && (
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
              correctionRate <= 10 ? "bg-stage-after/10 text-stage-after" : "bg-accent/10 text-accent"
            }`}>
              {correctionRate}% correcciones
            </span>
          )}
          {pendingImages.length > 0 && (
            <span className="px-2.5 py-1 rounded-full bg-accent/10 text-accent text-xs font-medium">
              {pendingImages.length} pendientes
            </span>
          )}
        </div>
      </header>

      {/* Columns with DnD */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <main className="flex-1 flex gap-4 p-4 overflow-hidden">
          {stages.map((stage) => (
            <ImageStageColumn
              key={stage.key}
              stageKey={stage.key}
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
      </DragDropContext>

      {/* Chat / Upload */}
      <ChatInput
        messages={messages}
        onSendMessage={handleSendMessage}
        onUploadAndClassify={handleUploadAndClassify}
        isClassifying={isClassifying}
        isReplying={isReplying}
      />

      {/* Modal */}
      <ImagePreviewModal url={previewUrl} onClose={() => setPreviewUrl(null)} />
    </div>
  );
};

export default Index;
