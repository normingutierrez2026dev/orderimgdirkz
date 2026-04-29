import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Download, Loader2, Trash2, Moon, Sun, ShieldAlert, LogOut, MessageSquare, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, X } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/hooks/useAuth";
import royalLogo from "@/assets/royal-logo.png";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { DragDropContext, type DropResult } from "@hello-pangea/dnd";
import { supabase } from "@/integrations/supabase/client";
import ImageStageColumn from "@/components/ImageStageColumn";
import ImagePreviewModal from "@/components/ImagePreviewModal";
import ChatInput from "@/components/ChatInput";
import { toast } from "sonner";
import { extractExif } from "@/lib/exif";
import type { ImageItem, ChatMessage, Stage } from "@/lib/types";
import { stageLabels, sceneLabels } from "@/lib/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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

const STORAGE_KEY = "royal_img_order_state_v1";

const WELCOME_MSG: ChatMessage = {
  id: "welcome",
  text: "¡Bienvenido! Sube imágenes y la IA las clasificará automáticamente en Antes, Proceso y Después. Puedes arrastrar imágenes entre columnas si la IA se equivoca.",
  timestamp: new Date(),
  type: "system",
};

const loadInitialState = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const reviveImg = (i: any): ImageItem => ({ ...i, timestamp: new Date(i.timestamp) });
    return {
      images: {
        before: (parsed.images?.before || []).map(reviveImg),
        process: (parsed.images?.process || []).map(reviveImg),
        after: (parsed.images?.after || []).map(reviveImg),
      } as Record<Stage, ImageItem[]>,
      manualCorrections: parsed.manualCorrections || 0,
      totalClassified: parsed.totalClassified || 0,
      messages: (parsed.messages || [WELCOME_MSG]).map((m: any) => ({
        ...m,
        timestamp: new Date(m.timestamp),
      })) as ChatMessage[],
    };
  } catch {
    return null;
  }
};

const Index = () => {
  const { theme, toggleTheme } = useTheme();
  const { signOut, user } = useAuth();
  const initial = useRef(loadInitialState()).current;
  const [images, setImages] = useState<Record<Stage, ImageItem[]>>(
    initial?.images || { before: [], process: [], after: [] }
  );
  const [pendingImages, setPendingImages] = useState<ImageItem[]>([]);
  const [isClassifying, setIsClassifying] = useState(false);
  const [manualCorrections, setManualCorrections] = useState(initial?.manualCorrections || 0);
  const [totalClassified, setTotalClassified] = useState(initial?.totalClassified || 0);
  const [messages, setMessages] = useState<ChatMessage[]>(initial?.messages || [WELCOME_MSG]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Persist to LocalStorage whenever ordered state changes
  useEffect(() => {
    try {
      const payload = {
        images,
        manualCorrections,
        totalClassified,
        messages,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.warn("LocalStorage save failed (likely quota exceeded):", e);
    }
  }, [images, manualCorrections, totalClassified, messages]);

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
            name: img.name,
            dataUrl: await resizeImage(img.dataUrl),
            exif: img.exif || undefined,
          }))
        );

        const { data, error } = await supabase.functions.invoke("classify-images", {
          body: { images: resizedImages },
        });

        if (error) throw new Error(error.message || "Error al clasificar");

        const classifications: { id: string; stage: Stage; scene: string; confidence: number; progress: number; reason: string; nudity?: boolean; minors?: boolean; safety_reason?: string }[] =
          data?.classifications || [];

        // Derive stage from progress threshold (1-60 before, 61-90 process, 91-100 after)
        const stageFromProgress = (p: number): Stage => (p <= 60 ? "before" : p <= 90 ? "process" : "after");

        const exifTime = (item: any): number => {
          const d = item?.exif?.date;
          if (!d) return Number.POSITIVE_INFINITY;
          // EXIF date format: "YYYY:MM:DD HH:MM:SS"
          const iso = d.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3");
          const t = Date.parse(iso);
          return isNaN(t) ? Number.POSITIVE_INFINITY : t;
        };

        const flagged: { name: string; reason: string }[] = [];

        setImages((prev) => {
          const updated = { ...prev };
          for (const cls of classifications) {
            const item = newItems.find((i) => i.id === cls.id);
            if (item) {
              const finalStage = stageFromProgress(cls.progress ?? 50);
              if (cls.nudity || cls.minors) {
                flagged.push({
                  name: item.name,
                  reason: cls.safety_reason || (cls.nudity ? "Posible desnudez" : "Posible menor de edad"),
                });
              }
              updated[finalStage] = [
                ...updated[finalStage],
                {
                  id: item.id,
                  url: item.url,
                  name: item.name,
                  timestamp: new Date(),
                  reason: cls.reason,
                  scene: cls.scene,
                  confidence: cls.confidence,
                  progress: cls.progress,
                  exif: item.exif,
                  nudity: !!cls.nudity,
                  minors: !!cls.minors,
                  safetyReason: cls.safety_reason || "",
                },
              ];
            }
          }
          // Sort each column chronologically by EXIF date (no date → end)
          (["before", "process", "after"] as Stage[]).forEach((s) => {
            updated[s] = [...updated[s]].sort((a, b) => exifTime(a) - exifTime(b));
          });
          return updated;
        });

        if (flagged.length > 0) {
          const list = flagged.map((f) => `• ${f.name} — ${f.reason}`).join("\n");
          addSystemMessage(`⚠️ Se detectó contenido sensible en ${flagged.length} imagen(es):\n${list}\nRevisa el aviso para decidir si descargas o eliminas estas fotos.`);
          toast.warning(`Contenido sensible detectado en ${flagged.length} imagen(es)`);
        }

        setPendingImages((prev) =>
          prev.filter((p) => !classifications.some((c) => c.id === p.id))
        );

        setTotalClassified((t) => t + classifications.length);

        const summary = classifications
          .map((c) => {
            const name = newItems.find((i) => i.id === c.id)?.name;
            const conf = Math.round(c.confidence * 100);
            const scene = sceneLabels[c.scene] || c.scene;
            const stage = stageFromProgress(c.progress ?? 50);
            return `• ${name} → ${stageLabels[stage]} | ${scene} | ${c.progress}% avance (conf ${conf}%) — ${c.reason}`;
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
            url: dataUrl, // persistable in LocalStorage (blob: URLs do not survive reloads)
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

  const removeImage = useCallback((stage: Stage, id: string) => {
    setImages((prev) => ({
      ...prev,
      [stage]: prev[stage].filter((img) => img.id !== id),
    }));
  }, []);

  const [isReplying, setIsReplying] = useState(false);

  const totalImages = images.before.length + images.process.length + images.after.length;
  const correctionRate = totalClassified > 0 ? Math.round((manualCorrections / totalClassified) * 100) : 0;

  const flaggedImages = useMemo(() => {
    const arr: { stage: Stage; img: ImageItem }[] = [];
    (["before", "process", "after"] as Stage[]).forEach((s) => {
      images[s].forEach((img) => {
        if (img.nudity || img.minors) arr.push({ stage: s, img });
      });
    });
    return arr;
  }, [images]);

  const [safetyDialogOpen, setSafetyDialogOpen] = useState(false);

  const generateZip = useCallback(async (includeFlagged: boolean) => {
    const zip = new JSZip();
    const root = zip.folder("proyecto_order")!;
    const stageOrder: Stage[] = ["before", "process", "after"];
    const folderNames: Record<Stage, string> = { before: "01_Antes", process: "02_Proceso", after: "03_Despues" };
    let globalIndex = 1;
    let included = 0;
    let skipped = 0;

    for (const stage of stageOrder) {
      const folder = root.folder(folderNames[stage])!;
      let localIndex = 1;
      for (const img of images[stage]) {
        const isFlagged = img.nudity || img.minors;
        if (isFlagged && !includeFlagged) {
          skipped++;
          continue;
        }
        const ext = (img.name.split(".").pop() || "jpg").toLowerCase();
        const prefix = isFlagged ? "SENSIBLE_" : "";
        const fileName = `${prefix}${String(globalIndex).padStart(3, "0")}_${String(localIndex).padStart(3, "0")}_${stageLabels[stage]}.${ext}`;
        const response = await fetch(img.url);
        const blob = await response.blob();
        folder.file(fileName, blob);
        globalIndex++;
        localIndex++;
        included++;
      }
    }

    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, `proyecto_order.zip`);
    addSystemMessage(
      `📦 Descarga generada con ${included} imágenes` +
        (skipped > 0 ? ` (${skipped} sensibles excluidas).` : ".")
    );
  }, [images]);

  const handleDownload = useCallback(async () => {
    if (totalImages === 0) {
      toast.error("No hay imágenes para descargar");
      return;
    }
    if (flaggedImages.length > 0) {
      setSafetyDialogOpen(true);
      return;
    }
    await generateZip(true);
  }, [totalImages, flaggedImages.length, generateZip]);

  const removeAllFlagged = useCallback(() => {
    setImages((prev) => {
      const updated = { ...prev };
      (["before", "process", "after"] as Stage[]).forEach((s) => {
        updated[s] = updated[s].filter((img) => !img.nudity && !img.minors);
      });
      return updated;
    });
    toast.success(`${flaggedImages.length} imagen(es) sensible(s) eliminada(s)`);
    addSystemMessage(`🗑️ Se eliminaron ${flaggedImages.length} imagen(es) marcadas como sensibles.`);
    setSafetyDialogOpen(false);
  }, [flaggedImages.length]);

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
    const newUserMsg = { id: crypto.randomUUID(), text, timestamp: new Date(), type: "user" as const };
    setMessages((prev) => [...prev, newUserMsg]);
    setIsReplying(true);

    // Build conversation history (last 10 turns) excluding system status messages
    const history = [...messages, newUserMsg]
      .filter((m) => !m.text.startsWith("✅") && !m.text.startsWith("❌") && !m.text.startsWith("⚠️"))
      .slice(-10)
      .map((m) => ({
        role: m.type === "user" ? "user" : "assistant",
        content: m.text.replace(/^🤖\s*/, ""),
      }));

    try {
      const { data, error } = await supabase.functions.invoke("chat", {
        body: { message: text, imageContext: buildImageContext(), history },
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
  }, [buildImageContext, messages, addSystemMessage]);

  const stages: { key: Stage; title: string; colorClass: string; dotColor: string }[] = [
    { key: "before", title: "Antes", colorClass: "bg-stage-before", dotColor: "bg-stage-before" },
    { key: "process", title: "Proceso", colorClass: "bg-stage-process", dotColor: "bg-stage-process" },
    { key: "after", title: "Después", colorClass: "bg-stage-after", dotColor: "bg-stage-after" },
  ];

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <header className="flex items-center gap-3 px-6 py-4 border-b border-border bg-card/80 backdrop-blur-sm">
        <img
          src={royalLogo}
          alt="Royal Img Order logo"
          width={40}
          height={40}
          className="w-10 h-10 object-contain"
        />
        <div>
          <h1 className="text-lg font-bold leading-tight text-foreground">
            Royal Img Order
          </h1>
          <p className="text-xs text-muted-foreground">
            Clasificación automática · Arrastra para corregir
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={toggleTheme}
            aria-label="Cambiar tema"
            className="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          {user && (
            <button
              onClick={signOut}
              aria-label="Cerrar sesión"
              title={user.email || "Cerrar sesión"}
              className="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
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
          {flaggedImages.length > 0 && (
            <button
              onClick={() => setSafetyDialogOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-destructive/10 text-destructive text-xs font-medium hover:bg-destructive/20 transition-colors"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              {flaggedImages.length} sensible{flaggedImages.length > 1 ? "s" : ""}
            </button>
          )}
          {totalImages > 0 && (
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Descargar
            </button>
          )}
          {(totalImages > 0 || messages.length > 1) && (
            <button
              onClick={() => {
                setImages({ before: [], process: [], after: [] });
                setPendingImages([]);
                setManualCorrections(0);
                setTotalClassified(0);
                setMessages([WELCOME_MSG]);
                try {
                  localStorage.removeItem(STORAGE_KEY);
                } catch (e) {
                  console.warn("LocalStorage clear failed:", e);
                }
                toast.success("Almacenamiento local limpiado");
              }}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-destructive/10 text-destructive text-xs font-medium hover:bg-destructive/20 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Limpiar todo
            </button>
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
              dotColor={stage.dotColor}
              images={images[stage.key]}
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

      {/* Safety review dialog */}
      <AlertDialog open={safetyDialogOpen} onOpenChange={setSafetyDialogOpen}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-destructive" />
              Contenido sensible detectado
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se detectaron {flaggedImages.length} imagen(es) que podrían contener desnudez o rostros de menores de edad.
              Revisa la lista y decide cómo proceder.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="max-h-72 overflow-y-auto border border-border rounded-md divide-y divide-border">
            {flaggedImages.map(({ stage, img }) => (
              <div key={img.id} className="flex items-center gap-3 p-2">
                <img
                  src={img.url}
                  alt={img.name}
                  className="w-14 h-14 object-cover rounded border border-border flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">{img.name}</div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {img.nudity && (
                      <span className="px-2 py-0.5 rounded-full bg-destructive/10 text-destructive text-[10px] font-medium">
                        Desnudez
                      </span>
                    )}
                    {img.minors && (
                      <span className="px-2 py-0.5 rounded-full bg-destructive/10 text-destructive text-[10px] font-medium">
                        Menor de edad
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px]">
                      {stageLabels[stage]}
                    </span>
                  </div>
                  {img.safetyReason && (
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">{img.safetyReason}</div>
                  )}
                </div>
                <button
                  onClick={() => {
                    removeImage(stage, img.id);
                    toast.success("Imagen eliminada");
                  }}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-destructive/10 text-destructive text-xs hover:bg-destructive/20 transition-colors flex-shrink-0"
                >
                  <Trash2 className="w-3 h-3" />
                  Eliminar
                </button>
              </div>
            ))}
            {flaggedImages.length === 0 && (
              <div className="p-4 text-sm text-muted-foreground text-center">
                Ya no hay imágenes sensibles.
              </div>
            )}
          </div>

          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Cerrar</AlertDialogCancel>
            {flaggedImages.length > 0 && (
              <button
                onClick={removeAllFlagged}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-md bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Eliminar todas las sensibles
              </button>
            )}
            <button
              onClick={async () => {
                setSafetyDialogOpen(false);
                await generateZip(false);
              }}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-md bg-muted text-foreground text-sm font-medium hover:bg-muted/80 transition-colors"
            >
              <Download className="w-4 h-4" />
              Descargar sin sensibles
            </button>
            <AlertDialogAction
              onClick={async () => {
                await generateZip(true);
              }}
            >
              <Download className="w-4 h-4 mr-1.5" />
              Descargar todas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Index;
