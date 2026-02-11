import {
  Component,
  inject,
  ViewChild,
  ElementRef,
  AfterViewChecked,
  OnDestroy,
  ChangeDetectorRef,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import {
  MatBottomSheetRef,
  MatBottomSheetModule,
} from "@angular/material/bottom-sheet";
import { MatButtonModule } from "@angular/material/button";

@Component({
  standalone: true,
  selector: "app-signature-bottom-sheet",
  template: `
    <div class="signature-sheet">
      <div class="sheet-scroll">
        <p class="signature-hint">Sign below to confirm your response.</p>
      </div>
      <div class="signature-container">
        <canvas
          #signatureCanvas
          class="signature-canvas"
        ></canvas>
      </div>
      <div class="sheet-actions">
        <button mat-stroked-button (click)="cancel()">Cancel</button>
        <button
          mat-flat-button
          color="primary"
          [disabled]="!finished"
          (click)="submit()"
        >
          Submit
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      .signature-sheet {
        display: flex;
        flex-direction: column;
        max-height: 85vh;
        padding-bottom: env(safe-area-inset-bottom);
      }

      .sheet-scroll {
        flex-shrink: 0;
        padding: 16px 16px 8px;
      }

      .signature-hint {
        margin: 0;
        font-size: 15px;
        color: rgba(0, 0, 0, 0.7);
      }

      .signature-container {
        flex-shrink: 0;
        margin: 12px 16px;
        border: 2px solid #e0e0e0;
        border-radius: 12px;
        overflow: hidden;
        background: #fafafa;
        touch-action: none;
        -webkit-user-select: none;
        user-select: none;
      }

      .signature-canvas {
        width: 100%;
        height: 220px;
        display: block;
        touch-action: none;
      }

      .sheet-actions {
        flex-shrink: 0;
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        padding: 16px;
        border-top: 1px solid #eee;
      }
    `,
  ],
  imports: [CommonModule, MatBottomSheetModule, MatButtonModule],
})
export class SignatureBottomSheetComponent implements AfterViewChecked, OnDestroy {
  @ViewChild("signatureCanvas") signatureCanvas?: ElementRef<HTMLCanvasElement>;

  private readonly sheetRef = inject(MatBottomSheetRef<SignatureBottomSheetComponent>);
  private readonly cdr = inject(ChangeDetectorRef);

  private signatureCtx: CanvasRenderingContext2D | null = null;
  private cleanup: (() => void) | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private isDrawing = false;
  private lastPoint: { x: number; y: number } | null = null;
  finished = false;

  ngAfterViewChecked() {
    if (!this.signatureCanvas || this.signatureCtx) return;

    this.canvas = this.signatureCanvas.nativeElement;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;

    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#000";
    ctx.fillStyle = "#000";
    this.signatureCtx = ctx;

    const getPoint = (e: { clientX: number; clientY: number }) => {
      const r = this.canvas!.getBoundingClientRect();
      return {
        x: e.clientX - r.left,
        y: e.clientY - r.top,
      };
    };

    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault();
      this.canvas!.setPointerCapture(e.pointerId);
      this.isDrawing = true;
      this.lastPoint = getPoint(e);
      ctx.beginPath();
      ctx.arc(
        this.lastPoint.x,
        this.lastPoint.y,
        ctx.lineWidth / 2,
        0,
        Math.PI * 2
      );
      ctx.fill();
      this.cdr.markForCheck();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!this.isDrawing || !this.lastPoint) return;
      e.preventDefault();
      const point = getPoint(e);
      ctx.beginPath();
      ctx.moveTo(this.lastPoint.x, this.lastPoint.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
      this.lastPoint = point;
    };

    const onPointerUp = () => {
      if (this.isDrawing) {
        this.isDrawing = false;
        this.lastPoint = null;
        this.finished = true;
        this.cdr.markForCheck();
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.target !== this.canvas) return;
      e.preventDefault();
      const touch = e.changedTouches[0];
      if (!touch) return;
      this.isDrawing = true;
      this.lastPoint = getPoint(touch);
      ctx.beginPath();
      ctx.arc(
        this.lastPoint.x,
        this.lastPoint.y,
        ctx.lineWidth / 2,
        0,
        Math.PI * 2
      );
      ctx.fill();
      this.cdr.markForCheck();
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!this.isDrawing || !this.lastPoint) return;
      e.preventDefault();
      const touch = e.touches[0];
      if (!touch) return;
      const point = getPoint(touch);
      ctx.beginPath();
      ctx.moveTo(this.lastPoint.x, this.lastPoint.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
      this.lastPoint = point;
    };

    const onTouchEnd = () => {
      if (this.isDrawing) {
        this.isDrawing = false;
        this.lastPoint = null;
        this.finished = true;
        this.cdr.markForCheck();
      }
    };

    this.canvas.addEventListener("pointerdown", onPointerDown);
    this.canvas.addEventListener("pointermove", onPointerMove, { passive: false });
    this.canvas.addEventListener("pointerup", onPointerUp);
    this.canvas.addEventListener("pointercancel", onPointerUp);
    this.canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    this.canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    this.canvas.addEventListener("touchend", onTouchEnd, { passive: false });
    this.canvas.addEventListener("touchcancel", onTouchEnd, { passive: false });

    this.cleanup = () => {
      if (!this.canvas) return;
      this.canvas.removeEventListener("pointerdown", onPointerDown);
      this.canvas.removeEventListener("pointermove", onPointerMove);
      this.canvas.removeEventListener("pointerup", onPointerUp);
      this.canvas.removeEventListener("pointercancel", onPointerUp);
      this.canvas.removeEventListener("touchstart", onTouchStart);
      this.canvas.removeEventListener("touchmove", onTouchMove);
      this.canvas.removeEventListener("touchend", onTouchEnd);
      this.canvas.removeEventListener("touchcancel", onTouchEnd);
    };
  }

  ngOnDestroy(): void {
    this.cleanup?.();
  }

  cancel(): void {
    this.sheetRef.dismiss();
  }

  submit(): void {
    const dataUrl = this.canvas?.toDataURL() ?? null;
    this.sheetRef.dismiss(dataUrl);
  }
}
