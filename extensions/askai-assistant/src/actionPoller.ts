/**
 * Reverse channel from the Chainlit backend into the OHIF viewer.
 *
 * The agent enqueues actions on the Python side (PENDING_ACTIONS in app.py);
 * we poll GET /capture/actions on a short interval and dispatch each action.
 *
 * v1 supports one action type:
 *   { type: "draw_annotation", toolName: "Length", viewportId,
 *     points_canvas_normalized: [[u1,v1],[u2,v2]], label, annotationUID }
 *
 * Normalized canvas coords (0..1, origin top-left) are converted to world
 * coords here via viewport.canvasToWorld() — keeping DICOM-geometry math out
 * of the Python side. The annotation is constructed manually (cachedStats: {}
 * pre-initialized) and inserted via annotation.state.addAnnotation(); the
 * MeasurementService listener surfaces it in the panel automatically (see
 * initMeasurementService.ts).
 */
import { getEnabledElementByViewportId } from '@cornerstonejs/core';
import { annotation as csAnnotation } from '@cornerstonejs/tools';

const POLL_INTERVAL_MS = 500;

type DrawAnnotationAction = {
  type: 'draw_annotation';
  toolName: 'Length';
  viewportId: string;
  points_canvas_normalized: [number, number][];
  label?: string;
  annotationUID?: string;
  // Set when the points were derived from a specific slice's screenshot. If the
  // viewport has scrolled to a different image by the time we draw, the
  // normalized coords no longer map to the right anatomy — skip rather than
  // place a line on the wrong slice.
  expected_imageId?: string;
};

type Action = DrawAnnotationAction;

function _resolveChainlitUrl(): string {
  const fromLS =
    typeof window !== 'undefined' && window.localStorage?.getItem('askai.chainlitUrl');
  return (fromLS || 'http://localhost:8000').replace(/\/$/, '');
}

let _started = false;
let _actionCount = 0;

export function startActionPoller() {
  if (_started) return;
  _started = true;

  const url = `${_resolveChainlitUrl()}/capture/actions?session=default`;

  const poll = async () => {
    try {
      const r = await fetch(url, { method: 'GET' });
      if (!r.ok) return;
      const body = await r.json().catch(() => null);
      const actions: Action[] = (body && body.actions) || [];
      for (const action of actions) {
        _actionCount++;
        if (_actionCount === 1 || _actionCount % 10 === 0) {
          console.log(`[askai] action #${_actionCount} received`, action);
        }
        dispatch(action);
      }
    } catch {
      // Chainlit may be down between polls — stay quiet, retry on next tick.
    }
  };

  setInterval(poll, POLL_INTERVAL_MS);
  console.log(
    `[askai] action poller started — GET ${url} every ${POLL_INTERVAL_MS} ms`
  );

  (window as any).__askaiActionPoller = {
    pollOnce: poll,
    get actionCount() {
      return _actionCount;
    },
  };
}

function dispatch(action: Action) {
  if (action.type === 'draw_annotation') {
    drawAnnotation(action);
    return;
  }
  console.warn('[askai] unknown action type:', (action as any).type);
}

function drawAnnotation(action: DrawAnnotationAction) {
  const enabled = getEnabledElementByViewportId(action.viewportId);
  if (!enabled) {
    console.warn(
      `[askai] draw_annotation: no viewport with id "${action.viewportId}" — ` +
        `dropping action. (Enabled viewports: ${listViewportIds()})`
    );
    return;
  }
  const vp: any = enabled.viewport;

  // Staleness guard: the points were computed against a screenshot of a
  // specific slice. If the user has since scrolled away, drop the action.
  if (action.expected_imageId && typeof vp.getCurrentImageId === 'function') {
    const currentImageId = vp.getCurrentImageId();
    if (currentImageId && currentImageId !== action.expected_imageId) {
      console.warn(
        `[askai] draw_annotation: viewport moved since localization ` +
          `(expected ${action.expected_imageId}, now ${currentImageId}) — skipping.`
      );
      return;
    }
  }

  const canvas: HTMLCanvasElement | null =
    typeof vp.getCanvas === 'function' ? vp.getCanvas() : null;
  if (!canvas) {
    console.warn('[askai] draw_annotation: viewport has no canvas');
    return;
  }

  // canvasToWorld expects CSS pixels: internally it multiplies the input by
  // devicePixelRatio and divides by canvas.width (the DPR-scaled backing
  // store). The screenshot the localizer saw was captured via toDataURL at
  // backing-store resolution, so the normalized fraction must be multiplied
  // by the CSS size (canvas.width / DPR) to invert cleanly. Multiplying by
  // canvas.width directly double-counts DPR and pushes points off-screen.
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.width / dpr;
  const cssH = canvas.height / dpr;
  const worldPoints = action.points_canvas_normalized.map(([u, v]) => {
    return vp.canvasToWorld([u * cssW, v * cssH]);
  });

  if (action.toolName === 'Length') {
    try {
      // Construct the annotation manually rather than calling
      // LengthTool.hydrate(): hydrate omits `data.cachedStats`, but the render
      // path indexes into `data.cachedStats[targetId]` without a guard, so a
      // hydrate-created annotation throws on first render. The DICOM-SR
      // hydration path uses this same manual pattern (see addSRAnnotation.ts).
      const FrameOfReferenceUID =
        typeof vp.getFrameOfReferenceUID === 'function'
          ? vp.getFrameOfReferenceUID()
          : undefined;
      const camera = typeof vp.getCamera === 'function' ? vp.getCamera() : null;
      const referencedImageId =
        typeof vp.getCurrentImageId === 'function' ? vp.getCurrentImageId() : undefined;

      const ann = {
        annotationUID: action.annotationUID,
        highlighted: false,
        isLocked: false,
        isVisible: true,
        invalidated: true,
        autoGenerated: true,
        metadata: {
          toolName: 'Length',
          viewPlaneNormal: camera?.viewPlaneNormal,
          viewUp: camera?.viewUp,
          FrameOfReferenceUID,
          referencedImageId,
        },
        data: {
          handles: {
            points: worldPoints,
            activeHandleIndex: null,
            textBox: {
              hasMoved: false,
              worldPosition: [0, 0, 0],
              worldBoundingBox: {
                topLeft: [0, 0, 0],
                topRight: [0, 0, 0],
                bottomLeft: [0, 0, 0],
                bottomRight: [0, 0, 0],
              },
            },
          },
          label: action.label,
          cachedStats: {},
        },
      };
      csAnnotation.state.addAnnotation(ann as any, vp.element);
      // Force a render so LengthTool._calculateCachedStats runs and fills mm.
      if (typeof vp.render === 'function') vp.render();

      // Report the geometry back so the backend can convert to mm. We send the
      // endpoints in image-grid INDEX space (via worldToIndex) — only the
      // viewport knows the zoom/pan transform, and the backend pairs these with
      // PixelSpacing from the DICOM (which the viewer didn't surface here).
      reportMeasurement(vp, ann.annotationUID, worldPoints);
    } catch (e) {
      console.warn('[askai] draw_annotation (Length) failed:', e);
    }
    return;
  }

  console.warn(`[askai] draw_annotation: tool "${action.toolName}" not handled yet`);
}

function reportMeasurement(vp: any, annotationUID: string, worldPoints: any[]) {
  try {
    const imgData = typeof vp.getImageData === 'function' ? vp.getImageData() : null;
    const vtkImage = imgData?.imageData;
    if (!vtkImage || typeof vtkImage.worldToIndex !== 'function') return;

    const indexPoints = worldPoints.map(w => Array.from(vtkImage.worldToIndex(w)));
    // index-grid length (px) — what the viewer's panel shows when uncalibrated
    const [i1, j1] = indexPoints[0];
    const [i2, j2] = indexPoints[1];
    const lengthPx = Math.hypot(i2 - i1, j2 - j1);

    const url = `${_resolveChainlitUrl()}/capture/measurement_result`;
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        annotationUID,
        indexPoints,
        lengthPx,
        dimensions: imgData?.dimensions,
        spacing: imgData?.spacing,
      }),
    }).catch(() => {
      /* backend may be down between polls; the tool will time out gracefully */
    });
  } catch (e) {
    console.warn('[askai] reportMeasurement failed:', e);
  }
}

function listViewportIds(): string {
  try {
    // Best-effort diagnostic; not all builds expose getEnabledElements at this
    // path. Wrapped in try/catch so a missing helper can't break the poller.
    const { getEnabledElements } = require('@cornerstonejs/core');
    return (getEnabledElements() || [])
      .map((e: any) => e?.viewport?.id)
      .filter(Boolean)
      .join(', ');
  } catch {
    return '?';
  }
}
