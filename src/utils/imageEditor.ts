import type { BackgroundMode, PhotoEditPlan, SubjectBox } from '../types/chat';

export interface EditorState {
  brightness: number;
  contrast: number;
  saturation: number;
  warmth: number;
  blur: number;
  grayscale: number;
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  aspect: 'original' | '1:1' | '4:3' | '16:9';
  backgroundMode: BackgroundMode;
  backgroundBlur: number;
  backgroundColor: string;
  backgroundColor2: string;
  subjectBox?: SubjectBox;
}

export const DEFAULT_EDITOR_STATE: EditorState = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  warmth: 0,
  blur: 0,
  grayscale: 0,
  rotation: 0,
  flipH: false,
  flipV: false,
  aspect: 'original',
  backgroundMode: 'none',
  backgroundBlur: 12,
  backgroundColor: '#0f172a',
  backgroundColor2: '#0f766e',
  subjectBox: undefined,
};

export function mergeEditPlan(
  prev: EditorState,
  plan: Partial<PhotoEditPlan>
): EditorState {
  return {
    ...prev,
    brightness: plan.brightness ?? prev.brightness,
    contrast: plan.contrast ?? prev.contrast,
    saturation: plan.saturation ?? prev.saturation,
    warmth: plan.warmth ?? prev.warmth,
    grayscale: plan.grayscale ?? prev.grayscale,
    blur: plan.blur ?? prev.blur,
    backgroundMode: plan.backgroundMode ?? prev.backgroundMode,
    backgroundBlur: plan.backgroundBlur ?? prev.backgroundBlur,
    backgroundColor: plan.backgroundColor || prev.backgroundColor,
    backgroundColor2: plan.backgroundColor2 || prev.backgroundColor2,
    subjectBox: plan.subjectBox ?? prev.subjectBox,
  };
}

function drawTransformedImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  outW: number,
  outH: number,
  scale: number,
  state: EditorState,
  filterStr: string
) {
  ctx.save();
  ctx.filter = filterStr || 'none';
  ctx.translate(outW / 2, outH / 2);
  ctx.rotate((state.rotation * Math.PI) / 180);
  ctx.scale(state.flipH ? -1 : 1, state.flipV ? -1 : 1);
  const drawW = img.naturalWidth * scale;
  const drawH = img.naturalHeight * scale;
  ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();
}

export function drawEditedCanvas(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  state: EditorState,
  maxPreviewDim?: number
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const isRotatedOdd = state.rotation === 90 || state.rotation === 270;
  const orientedW = isRotatedOdd ? img.naturalHeight : img.naturalWidth;
  const orientedH = isRotatedOdd ? img.naturalWidth : img.naturalHeight;

  let cropW = orientedW;
  let cropH = orientedH;

  if (state.aspect !== 'original') {
    const [rw, rh] = state.aspect.split(':').map(Number);
    const targetRatio = rw / rh;
    const currentRatio = orientedW / orientedH;
    if (currentRatio > targetRatio) {
      cropW = Math.round(orientedH * targetRatio);
    } else {
      cropH = Math.round(orientedW / targetRatio);
    }
  }

  let scale = 1;
  if (maxPreviewDim && (cropW > maxPreviewDim || cropH > maxPreviewDim)) {
    scale = maxPreviewDim / Math.max(cropW, cropH);
  }

  const outW = Math.max(1, Math.round(cropW * scale));
  const outH = Math.max(1, Math.round(cropH * scale));
  canvas.width = outW;
  canvas.height = outH;

  ctx.clearRect(0, 0, outW, outH);

  const baseFilters = [
    `brightness(${state.brightness}%)`,
    `contrast(${state.contrast}%)`,
    `saturate(${state.saturation}%)`,
    state.grayscale > 0 ? `grayscale(${state.grayscale}%)` : '',
    state.blur > 0 ? `blur(${(state.blur * scale).toFixed(2)}px)` : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (state.backgroundMode === 'none') {
    drawTransformedImage(ctx, img, outW, outH, scale, state, baseFilters);
  } else {
    // 1. Render background layer
    if (state.backgroundMode === 'blur') {
      const bgBlurPx = Math.max(4, Math.round(state.backgroundBlur * scale));
      const bgFilter = [baseFilters, `blur(${bgBlurPx}px)`]
        .filter(Boolean)
        .join(' ');
      drawTransformedImage(ctx, img, outW, outH, scale, state, bgFilter);
    } else if (state.backgroundMode === 'color') {
      ctx.fillStyle = state.backgroundColor || '#0f172a';
      ctx.fillRect(0, 0, outW, outH);
    } else if (state.backgroundMode === 'gradient') {
      const grad = ctx.createLinearGradient(0, 0, outW, outH);
      grad.addColorStop(0, state.backgroundColor || '#0f172a');
      grad.addColorStop(1, state.backgroundColor2 || '#0f766e');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, outW, outH);
    }

    // 2. Render foreground subject with feathered elliptical mask on offscreen canvas
    const fgCanvas = document.createElement('canvas');
    fgCanvas.width = outW;
    fgCanvas.height = outH;
    const fgCtx = fgCanvas.getContext('2d');
    if (fgCtx) {
      drawTransformedImage(fgCtx, img, outW, outH, scale, state, baseFilters);

      const box = state.subjectBox ?? {
        ymin: 120,
        xmin: 180,
        ymax: 920,
        xmax: 820,
      };

      const cx = (((box.xmin + box.xmax) / 2) / 1000) * outW;
      const cy = (((box.ymin + box.ymax) / 2) / 1000) * outH;
      const rx = Math.max(outW * 0.14, (((box.xmax - box.xmin) / 2) / 1000) * outW);
      const ry = Math.max(outH * 0.14, (((box.ymax - box.ymin) / 2) / 1000) * outH);
      const maxR = Math.max(rx, ry);

      fgCtx.save();
      fgCtx.globalCompositeOperation = 'destination-in';
      fgCtx.translate(cx, cy);
      fgCtx.scale(rx / maxR, ry / maxR);
      const maskGrad = fgCtx.createRadialGradient(0, 0, maxR * 0.58, 0, 0, maxR * 1.15);
      maskGrad.addColorStop(0, 'rgba(0,0,0,1)');
      maskGrad.addColorStop(0.75, 'rgba(0,0,0,0.85)');
      maskGrad.addColorStop(1, 'rgba(0,0,0,0)');
      fgCtx.fillStyle = maskGrad;
      fgCtx.beginPath();
      fgCtx.arc(0, 0, maxR * 1.2, 0, Math.PI * 2);
      fgCtx.fill();
      fgCtx.restore();

      ctx.drawImage(fgCanvas, 0, 0);
    }
  }

  // 3. Apply warmth / cool tint overlay
  if (state.warmth !== 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    const alpha = Math.min(0.45, Math.abs(state.warmth) / 100);
    ctx.fillStyle =
      state.warmth > 0
        ? `rgba(255, 168, 76, ${alpha})`
        : `rgba(86, 168, 255, ${alpha})`;
    ctx.fillRect(0, 0, outW, outH);
    ctx.restore();
  }
}

export async function renderEditPlanToDataUrl(
  sourcePreviewUrl: string,
  plan: Partial<PhotoEditPlan>
): Promise<{ dataUrl: string; base64: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const nextState = mergeEditPlan(DEFAULT_EDITOR_STATE, plan);
      drawEditedCanvas(canvas, img, nextState);
      const dataUrl = canvas.toDataURL('image/png');
      const base64 = dataUrl.split(',')[1] || '';
      resolve({ dataUrl, base64 });
    };
    img.onerror = () => reject(new Error('Failed to load source image for editing.'));
    img.src = sourcePreviewUrl;
  });
}
