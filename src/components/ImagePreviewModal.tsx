import { X } from "lucide-react";

interface ImagePreviewModalProps {
  url: string | null;
  onClose: () => void;
}

const ImagePreviewModal = ({ url, onClose }: ImagePreviewModalProps) => {
  if (!url) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 backdrop-blur-sm animate-fade-up"
      onClick={onClose}
    >
      <div
        className="relative max-w-[90vw] max-h-[90vh] animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={url}
          alt="Vista previa"
          className="max-w-full max-h-[85vh] rounded-xl shadow-2xl object-contain"
        />
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 p-2 rounded-full bg-card text-foreground shadow-lg hover:bg-muted active:scale-95 transition-all"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

export default ImagePreviewModal;