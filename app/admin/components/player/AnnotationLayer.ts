/**
 * AnnotationLayer
 *
 * Lightweight, modular drawing engine for video player canvas overlay.
 * Supports: Line, Angle (°), Text, Brush (Freehand), and Clear All.
 * Normalized 0.0-1.0 coordinate system ensures drawings stay pixel-pinned 
 * across resolution changes, pan, and zoom.
 */

export type AnnotationTool = 'select' | 'line' | 'angle' | 'text' | 'brush' | 'eraser';

export interface Point {
  x: number; // Normalized 0.0 - 1.0 (x / width)
  y: number; // Normalized 0.0 - 1.0 (y / height)
}

export interface Shape {
  id: string;
  type: AnnotationTool;
  points: Point[];
  color: string;
  width: number;
  text?: string;
  label?: string;
}

export class AnnotationLayer {
  public shapes: Shape[] = [];
  public currentTool: AnnotationTool = 'select';
  public currentColor: string = '#ffcc33'; // Default yellow
  public strokeWidth: number = 2;

  // Where each text note was last drawn (normalized 0-1), so the eraser can hit the whole badge
  // and not just the small dot at its anchor point.
  private textBounds = new Map<string, { x0: number; y0: number; x1: number; y1: number }>();

  // Active drawing state
  private activeDrawing: Shape | null = null;
  private pendingAnglePoints: Point[] = [];

  // Callbacks
  public onChange?: () => void;

  setTool(tool: AnnotationTool) {
    this.currentTool = tool;
    this.activeDrawing = null;
    this.pendingAnglePoints = [];
    if (this.onChange) this.onChange();
  }

  setColor(color: string) {
    this.currentColor = color;
  }

  getShapes(): Shape[] {
    return [...this.shapes];
  }

  setShapes(shapes: Shape[]) {
    this.shapes = [...shapes];
    this.activeDrawing = null;
    this.pendingAnglePoints = [];
    if (this.onChange) this.onChange();
  }

  clearAll() {
    this.shapes = [];
    this.activeDrawing = null;
    this.pendingAnglePoints = [];
    if (this.onChange) this.onChange();
  }

  // ---- Pointer Interactions (Screen normalized 0.0-1.0) ----

  onPointerDown(point: Point): { requestTextInput?: boolean; textPosition?: Point } {
    if (this.currentTool === 'select') return {};

    if (this.currentTool === 'eraser') {
      this.eraseShapesNear(point);
      return {};
    }

    if (this.currentTool === 'text') {
      return { requestTextInput: true, textPosition: point };
    }

    if (this.currentTool === 'angle') {
      this.pendingAnglePoints.push(point);
      if (this.pendingAnglePoints.length === 3) {
        const shape: Shape = {
          id: `shape_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          type: 'angle',
          points: [...this.pendingAnglePoints],
          color: this.currentColor,
          width: this.strokeWidth,
        };
        this.shapes.push(shape);
        this.pendingAnglePoints = [];
        this.activeDrawing = null;
        if (this.onChange) this.onChange();
      } else {
        this.activeDrawing = {
          id: 'ghost',
          type: 'angle',
          points: [...this.pendingAnglePoints, point],
          color: this.currentColor,
          width: this.strokeWidth,
        };
      }
      return {};
    }

    // Line and Brush
    this.activeDrawing = {
      id: `shape_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      type: this.currentTool,
      points: [point, point],
      color: this.currentColor,
      width: this.strokeWidth,
    };
    return {};
  }

  onPointerMove(point: Point) {
    if (this.currentTool === 'eraser') {
      this.eraseShapesNear(point);
      return;
    }

    if (!this.activeDrawing) return;

    if (this.currentTool === 'line') {
      this.activeDrawing.points[1] = point;
      if (this.onChange) this.onChange();
    } else if (this.currentTool === 'brush') {
      const lastPt = this.activeDrawing.points[this.activeDrawing.points.length - 1];
      const dx = point.x - lastPt.x;
      const dy = point.y - lastPt.y;
      if (dx * dx + dy * dy > 0.000004) {
        this.activeDrawing.points.push(point);
        if (this.onChange) this.onChange();
      }
    } else if (this.currentTool === 'angle') {
      this.activeDrawing.points = [...this.pendingAnglePoints, point];
      if (this.onChange) this.onChange();
    }
  }

  private eraseShapesNear(point: Point) {
    const threshold = 0.03; // Eraser radius
    const initialLen = this.shapes.length;

    this.shapes = this.shapes.filter(shape => {
      // A text note is erased by touching anywhere on its badge
      if (shape.type === 'text') {
        const b = this.textBounds.get(shape.id);
        if (b && point.x >= b.x0 - 0.01 && point.x <= b.x1 + 0.01 && point.y >= b.y0 - 0.01 && point.y <= b.y1 + 0.01) {
          return false;
        }
      }
      return !shape.points.some(p => {
        const dx = p.x - point.x;
        const dy = p.y - point.y;
        return Math.sqrt(dx * dx + dy * dy) < threshold;
      });
    });

    if (this.shapes.length !== initialLen && this.onChange) {
      this.onChange();
    }
  }

  onPointerUp() {
    if (!this.activeDrawing) return;

    if (this.currentTool === 'line' || this.currentTool === 'brush') {
      if (this.activeDrawing.points.length >= 2) {
        this.shapes.push({ ...this.activeDrawing });
      }
      this.activeDrawing = null;
      if (this.onChange) this.onChange();
    }
  }

  addText(point: Point, text: string) {
    if (!text.trim()) return;
    const shape: Shape = {
      id: `shape_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      type: 'text',
      points: [point],
      color: this.currentColor,
      width: this.strokeWidth,
      text: text.trim(),
    };
    this.shapes.push(shape);
    if (this.onChange) this.onChange();
  }

  // ---- Canvas Render Engine ----

  render(ctx: CanvasRenderingContext2D, imgW: number, imgH: number, pxScale: (n: number) => number) {
    const allShapes = [...this.shapes];
    if (this.activeDrawing) allShapes.push(this.activeDrawing);

    if (allShapes.length === 0) return;

    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    allShapes.forEach((shape) => {
      this.renderShape(ctx, shape, imgW, imgH, pxScale);
    });

    ctx.restore();
  }

  private renderShape(
    ctx: CanvasRenderingContext2D,
    shape: Shape,
    imgW: number,
    imgH: number,
    pxScale: (n: number) => number
  ) {
    const pts = shape.points.map(p => ({ x: p.x * imgW, y: p.y * imgH }));
    if (!pts.length) return;

    ctx.save();
    ctx.strokeStyle = shape.color;
    ctx.fillStyle = shape.color;
    ctx.lineWidth = pxScale(shape.width || 2);

    const a = pts[0];
    const b = pts[pts.length - 1];

    switch (shape.type) {
      case 'line': {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        break;
      }

      case 'brush': {
        if (pts.length < 2) break;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
        ctx.stroke();
        break;
      }

      case 'angle': {
        if (pts.length < 2) break;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
        ctx.stroke();

        if (pts.length === 3) {
          const [p1, v, p2] = pts;
          const deg = calculateAngleDeg(p1, v, p2);

          // Draw small angle arc
          const r = pxScale(24);
          const a1 = Math.atan2(p1.y - v.y, p1.x - v.x);
          const a2 = Math.atan2(p2.y - v.y, p2.x - v.x);
          // canvas arcs run clockwise by default, which draws the reflex (outer) side whenever
          // that sweep is over 180°; pick the direction of the shorter sweep so the arc marks
          // the same angle as the number shown.
          let sweep = a2 - a1;
          while (sweep > Math.PI) sweep -= Math.PI * 2;
          while (sweep <= -Math.PI) sweep += Math.PI * 2;
          ctx.beginPath();
          ctx.arc(v.x, v.y, r, a1, a2, sweep < 0);
          ctx.stroke();

          // Angle degrees label badge
          const fontSize = pxScale(13);
          ctx.font = `bold ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
          const text = `${deg.toFixed(1)}°`;
          
          ctx.fillStyle = 'rgba(0,0,0,0.75)';
          ctx.fillRect(v.x + pxScale(8), v.y - pxScale(22), pxScale(50), pxScale(20));

          ctx.fillStyle = shape.color;
          ctx.fillText(text, v.x + pxScale(12), v.y - pxScale(7));
        }
        break;
      }

      case 'text': {
        if (!shape.text) break;
        // A compact note: dark rounded badge, a colour accent bar on its left and white text
        // (so any annotation colour stays readable), pinned to the clicked point by a small dot.
        const fontSize = pxScale(14);
        ctx.font = `600 ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textBaseline = 'middle';
        const text = shape.text;
        const textW = ctx.measureText(text).width;
        const padX = pxScale(9);
        const barW = pxScale(4);
        const h = fontSize * 1.75;
        const w = barW + padX + textW + padX;
        const x = a.x;
        const y = a.y - h / 2;
        const r = pxScale(6);
        this.textBounds.set(shape.id, { x0: x / imgW, y0: y / imgH, x1: (x + w) / imgW, y1: (y + h) / imgH });

        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
        ctx.fillStyle = 'rgba(12, 15, 22, 0.88)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.lineWidth = pxScale(1);
        ctx.stroke();

        // Accent bar (clipped to the badge's rounded left edge)
        ctx.save();
        ctx.clip();
        ctx.fillStyle = shape.color;
        ctx.fillRect(x, y, barW, h);
        ctx.restore();

        ctx.fillStyle = '#ffffff';
        ctx.fillText(text, x + barW + padX, a.y + pxScale(0.5));

        // Anchor dot at the clicked point
        ctx.beginPath();
        ctx.arc(x, a.y, pxScale(3), 0, Math.PI * 2);
        ctx.fillStyle = shape.color;
        ctx.fill();
        break;
      }

      default:
        break;
    }

    ctx.restore();
  }
}

// ---- Math Helper for Angle Calculation ----
function calculateAngleDeg(p1: { x: number; y: number }, v: { x: number; y: number }, p2: { x: number; y: number }): number {
  const d1 = { x: p1.x - v.x, y: p1.y - v.y };
  const d2 = { x: p2.x - v.x, y: p2.y - v.y };
  const dot = d1.x * d2.x + d1.y * d2.y;
  const mag1 = Math.sqrt(d1.x * d1.x + d1.y * d1.y);
  const mag2 = Math.sqrt(d2.x * d2.x + d2.y * d2.y);
  if (mag1 * mag2 === 0) return 0;
  const cos = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
  return (Math.acos(cos) * 180) / Math.PI;
}
