import { useState } from "react";
import { X, ImageIcon, ZoomIn, MapPin, Calendar, Eye } from "lucide-react";
import { Droppable, Draggable } from "@hello-pangea/dnd";
import type { ImageItem } from "@/lib/types";
import { sceneLabels } from "@/lib/types";

interface ImageStageColumnProps {
  stageKey: string;
  title: string;
  colorClass: string;
  dotColor: string;
  images: ImageItem[];
  
  onRemoveImage: (id: string) => void;
  onPreview: (url: string) => void;
}

const ImageStageColumn = ({
  stageKey,
  title,
  colorClass,
  dotColor,
  images,
  onAddImages,
  onRemoveImage,
  onPreview,
}: ImageStageColumnProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length) onAddImages(e.dataTransfer.files);
  };

  return (
    <div className="flex flex-col flex-1 min-w-0">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 mb-3">
        <span className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
        <h2 className="text-sm font-semibold tracking-wide uppercase text-foreground/80">
          {title}
        </h2>
        <span className="ml-auto text-xs font-medium text-muted-foreground bg-muted rounded-full px-2 py-0.5">
          {images.length}
        </span>
      </div>

      {/* Droppable area for DnD */}
      <Droppable droppableId={stageKey}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 rounded-xl border-2 border-dashed transition-colors duration-200 overflow-y-auto scroll-hidden p-3 space-y-3 ${
              snapshot.isDraggingOver || isDragging
                ? `border-stage-${stageKey} bg-stage-${stageKey}/5`
                : "border-border bg-card/60"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            style={{ minHeight: "200px" }}
          >
            {images.length === 0 ? (
              <button
                onClick={() => inputRef.current?.click()}
                className="flex flex-col items-center justify-center w-full h-full min-h-[180px] gap-3 text-muted-foreground hover:text-foreground/60 transition-colors active:scale-[0.98]"
              >
                <div className="p-3 rounded-xl bg-muted">
                  <ImageIcon className="w-6 h-6" />
                </div>
                <span className="text-sm font-medium">
                  Arrastra imágenes aquí
                </span>
                <span className="text-xs text-muted-foreground">
                  o haz clic para seleccionar
                </span>
              </button>
            ) : (
              <>
                {images.map((img, i) => (
                  <Draggable key={img.id} draggableId={img.id} index={i}>
                    {(dragProvided, dragSnapshot) => (
                      <div
                        ref={dragProvided.innerRef}
                        {...dragProvided.draggableProps}
                        {...dragProvided.dragHandleProps}
                        className={`group relative rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow bg-background animate-scale-in ${
                          dragSnapshot.isDragging ? "shadow-xl ring-2 ring-primary/30 rotate-2" : ""
                        }`}
                        style={{
                          ...dragProvided.draggableProps.style,
                          animationDelay: `${i * 60}ms`,
                        }}
                      >
                        <img
                          src={img.url}
                          alt={img.name}
                          className="w-full h-auto object-cover rounded-lg"
                          loading="lazy"
                        />
                        {/* Overlay controls */}
                        <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/20 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                          <button
                            onClick={() => onPreview(img.url)}
                            className="p-2 rounded-full bg-card/90 text-foreground shadow-lg hover:bg-card active:scale-95 transition-all"
                          >
                            <ZoomIn className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onRemoveImage(img.id)}
                            className="p-2 rounded-full bg-destructive/90 text-destructive-foreground shadow-lg hover:bg-destructive active:scale-95 transition-all"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Info overlay */}
                        <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-foreground/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                          <p className="text-xs text-white truncate font-medium">
                            {img.name}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {img.scene && (
                              <span className="text-[10px] text-white/80 flex items-center gap-0.5">
                                <Eye className="w-3 h-3" />
                                {sceneLabels[img.scene] || img.scene}
                              </span>
                            )}
                            {img.confidence !== undefined && (
                              <span className="text-[10px] text-white/80">
                                {Math.round(img.confidence * 100)}%
                              </span>
                            )}
                            {img.exif?.date && (
                              <span className="text-[10px] text-white/80 flex items-center gap-0.5">
                                <Calendar className="w-3 h-3" />
                              </span>
                            )}
                            {img.exif?.gps && (
                              <span className="text-[10px] text-white/80 flex items-center gap-0.5">
                                <MapPin className="w-3 h-3" />
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Confidence badge */}
                        {img.confidence !== undefined && img.confidence < 0.7 && (
                          <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-accent/90 text-white text-[10px] font-medium">
                            Baja confianza
                          </div>
                        )}
                      </div>
                    )}
                  </Draggable>
                ))}
              </>
            )}
            {provided.placeholder}
          </div>
        )}
      </Droppable>

    </div>
  );
};

export default ImageStageColumn;
