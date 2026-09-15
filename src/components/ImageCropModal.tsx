import React, { useState, useRef, useEffect } from 'react';
import { X, Check, ZoomIn, ZoomOut, RotateCw } from 'lucide-react';

interface ImageCropModalProps {
  isOpen?: boolean;
  imageSrc: string | null;
  title?: string;
  onCropComplete: (croppedDataUrl: string) => void;
  onClose?: () => void;
  onCancel?: () => void;
}

export const ImageCropModal: React.FC<ImageCropModalProps> = ({
  isOpen = true,
  imageSrc,
  title = 'Crop Profile Picture',
  onCropComplete,
  onClose,
  onCancel,
}) => {
  const handleClose = onClose || onCancel || (() => {});
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageNaturalSize, setImageNaturalSize] = useState({ width: 0, height: 0 });

  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Reset state when a new image is loaded
  useEffect(() => {
    if (isOpen && imageSrc) {
      setZoom(1);
      setRotation(0);
      setPan({ x: 0, y: 0 });
      setImageLoaded(false);

      const img = new Image();
      img.onload = () => {
        setImageNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
        setImageLoaded(true);
      };
      img.src = imageSrc;
    }
  }, [isOpen, imageSrc]);

  if (!isOpen || !imageSrc) return null;

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    panStartRef.current = { ...pan };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPan({
      x: panStartRef.current.x + dx,
      y: panStartRef.current.y + dy,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch support for mobile dragging
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      dragStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      panStartRef.current = { ...pan };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - dragStartRef.current.x;
    const dy = e.touches[0].clientY - dragStartRef.current.y;
    setPan({
      x: panStartRef.current.x + dx,
      y: panStartRef.current.y + dy,
    });
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const handleApplyCrop = () => {
    if (!imageLoaded || !imgRef.current) return;

    try {
      const outputSize = 512;
      const canvas = document.createElement('canvas');
      canvas.width = outputSize;
      canvas.height = outputSize;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        onCropComplete(imageSrc);
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Move origin to center of target canvas
      ctx.translate(outputSize / 2, outputSize / 2);
      ctx.rotate((rotation * Math.PI) / 180);

      // In the viewport (280x280), determine how the image is scaled and positioned
      const viewportSize = 280;
      const naturalW = imageNaturalSize.width || 512;
      const naturalH = imageNaturalSize.height || 512;

      // Base scale that fits the image covers the viewport
      const baseScale = Math.max(viewportSize / naturalW, viewportSize / naturalH);
      const currentScale = baseScale * zoom;

      // Ratio of output canvas to viewport
      const scaleRatio = outputSize / viewportSize;

      const drawW = naturalW * currentScale * scaleRatio;
      const drawH = naturalH * currentScale * scaleRatio;

      // Apply pan offsets adjusted for rotation and scale
      const panX = pan.x * scaleRatio;
      const panY = pan.y * scaleRatio;

      // Adjust pan coordinates depending on rotation angle
      let rotatedPanX = panX;
      let rotatedPanY = panY;
      if (rotation === 90) {
        rotatedPanX = panY;
        rotatedPanY = -panX;
      } else if (rotation === 180) {
        rotatedPanX = -panX;
        rotatedPanY = -panY;
      } else if (rotation === 270) {
        rotatedPanX = -panY;
        rotatedPanY = panX;
      }

      ctx.drawImage(
        imgRef.current,
        -drawW / 2 + rotatedPanX,
        -drawH / 2 + rotatedPanY,
        drawW,
        drawH
      );

      const croppedResult = canvas.toDataURL('image/jpeg', 0.88);
      onCropComplete(croppedResult);
    } catch (err) {
      console.error('Error applying crop:', err);
      onCropComplete(imageSrc);
    }
  };

  if (!isOpen || !imageSrc) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm sm:max-w-md w-full shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
              {title}
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Drag to position & zoom to fit
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors cursor-pointer"
            title="Cancel"
          >
            <X size={18} />
          </button>
        </div>

        {/* Crop Viewport */}
        <div className="p-4 sm:p-6 flex flex-col items-center justify-center bg-slate-950/95">
          <div
            ref={containerRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className="relative w-[280px] h-[280px] rounded-full overflow-hidden border-2 border-teal-500 shadow-2xl bg-black cursor-grab active:cursor-grabbing select-none"
            style={{ touchAction: 'none' }}
          >
            {/* Display Image */}
            <img
              ref={imgRef}
              src={imageSrc}
              alt="Crop preview"
              draggable={false}
              className="absolute pointer-events-none transition-transform duration-75 origin-center"
              style={{
                left: '50%',
                top: '50%',
                transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) rotate(${rotation}deg) scale(${zoom})`,
                maxWidth: 'none',
                width: imageNaturalSize.width && imageNaturalSize.height
                  ? imageNaturalSize.width >= imageNaturalSize.height
                    ? 'auto'
                    : '280px'
                  : '100%',
                height: imageNaturalSize.width && imageNaturalSize.height
                  ? imageNaturalSize.width >= imageNaturalSize.height
                    ? '280px'
                    : 'auto'
                  : '100%',
              }}
            />

            {/* Circular Guide Mask Overlay */}
            <div className="absolute inset-0 rounded-full border-[3px] border-white/60 pointer-events-none shadow-inner" />
            
            {/* Grid Lines */}
            <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 opacity-25">
              <div className="border-r border-b border-white" />
              <div className="border-r border-b border-white" />
              <div className="border-b border-white" />
              <div className="border-r border-b border-white" />
              <div className="border-r border-b border-white" />
              <div className="border-b border-white" />
              <div className="border-r border-white" />
              <div className="border-r border-white" />
              <div />
            </div>
          </div>

          <span className="text-[10px] text-slate-400 mt-2 font-medium">
            Drag to pan • Pinch or use slider to zoom
          </span>
        </div>

        {/* Controls */}
        <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 space-y-3">
          {/* Zoom Slider */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.8, Number((z - 0.1).toFixed(2))))}
              className="p-1.5 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
              title="Zoom out"
            >
              <ZoomOut size={16} />
            </button>
            <input
              type="range"
              min="0.8"
              max="3"
              step="0.05"
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="flex-1 accent-teal-600 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer"
            />
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(3, Number((z + 0.1).toFixed(2))))}
              className="p-1.5 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
              title="Zoom in"
            >
              <ZoomIn size={16} />
            </button>
            <button
              type="button"
              onClick={handleRotate}
              className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              title="Rotate 90 degrees"
            >
              <RotateCw size={15} />
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApplyCrop}
              className="px-5 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 active:bg-teal-900 text-white text-xs font-black shadow-md flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Check size={14} />
              <span>Apply</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
