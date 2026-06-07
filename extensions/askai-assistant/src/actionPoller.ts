/**
 * Reverse channel from the Chainlit backend into the OHIF viewer.
 *
 * The agent enqueues actions on the Python side (PENDING_ACTIONS in app.py);
 * we poll GET /capture/actions on a short interval and dispatch each action.
 *
 * The draw_annotation action supports several measurement tools:
 *   { type: "draw_annotation", toolName: "Length"|"Angle"|"CobbAngle"|
 *     "PlanarFreehandROI", viewportId, points_canvas_normalized: [[u,v],...],
 *     label, annotationUID, closed? }
 *
 * Normalized canvas coords (0..1, origin top-left) are converted to world
 * coords here via viewport.canvasToWorld() — keeping DICOM-geometry math out
 * of the Python side. Handle-based tools (Length/Angle/CobbAngle) are built
 * manually with cachedStats:{} and inserted via annotation.state.addAnnotation();
 * the contour tool (PlanarFreehandROI) is populated via the official
 * updateContourPolyline helper. The MeasurementService listener surfaces every
 * one in the panel automatically (see initMeasurementService.ts).
 */
import { getEnabledElementByViewportId } from '@cornerstonejs/core';
import { annotation as csAnnotation, utilities as csToolsUtilities } from '@cornerstonejs/tools';
import { getCommandsManager, getActiveViewportId, getServicesManager } from './managers';
import { handleRenderSlices, type RenderSlicesAction } from './sliceRenderer';
import { forcePushState } from './viewportTracker';
import dicomImageLoader from '@cornerstonejs/dicom-image-loader';
import dcmjs from 'dcmjs';
import { DicomMetadataStore } from '@ohif/core';

const POLL_INTERVAL_MS = 500;

type DrawToolName = 'Length' | 'Angle' | 'CobbAngle' | 'PlanarFreehandROI';

type DrawAnnotationAction = {
  type: 'draw_annotation';
  toolName: DrawToolName;
  viewportId: string;
  points_canvas_normalized: [number, number][];
  label?: string;
  annotationUID?: string;
  // PlanarFreehandROI only: the points trace a closed contour rather than
  // defining handle points. Defaults to closed when omitted.
  closed?: boolean;
  // Set when the points were derived from a specific slice's screenshot. If the
  // viewport has scrolled to a different image by the time we draw, the
  // normalized coords no longer map to the right anatomy — skip rather than
  // place a line on the wrong slice.
  expected_imageId?: string;
};

// Viewer-control actions produced by the backend's set_window_level /
// navigate_slices / transform_viewport tools. Each maps to an OHIF
// commandsManager command (see the handlers below). viewportId is optional —
// we fall back to the active viewport when the agent didn't specify one.
type SetWindowLevelAction = {
  type: 'set_window_level';
  viewportId?: string;
  windowWidth?: number;
  windowCenter?: number;
  presetName?: string;
};

type NavigateSliceAction = {
  type: 'navigate_slice';
  viewportId?: string;
  imageIndex?: number;
  delta?: number;
  position?: 'first' | 'last';
};

type TransformViewportAction = {
  type: 'transform_viewport';
  viewportId?: string;
  operation: string;
  value?: number;
};

// Re-read the CURRENT value of an annotation the backend drew earlier, after the
// user has edited it (dragged the handles). The backend enqueues this when the
// radiologist declines the confirm-before-calculate prompt; we re-post the live
// cachedStats value to /capture/measurement_result so it can recompute from the
// exact edited number (no screenshot, no retyping).
type ReadMeasurementAction = {
  type: 'read_measurement';
  annotationUID: string;
  viewportId?: string;
};

// Force a fresh annotated-screenshot push. The backend enqueues this before the
// measure localizer reads the slice (when it wants the annotated frame) because
// the cached annotated PNG is only re-pushed on a Cornerstone event and may be
// stale or missing a just-drawn measurement. We re-composite the live overlay
// and re-push; the backend waits for the newer push (see _force_fresh_capture).
type RequestCaptureAction = {
  type: 'request_capture';
};

// Inject a server-generated DICOM-SEG (base64) and overlay it on the loaded study.
// referencedSeriesInstanceUID must be the series the SEG references (so it hydrates
// onto the right display set). viewportId optional → active viewport.
type LoadSegmentationAction = {
  type: 'load_segmentation';
  seg_b64: string;
  referencedSeriesInstanceUID: string;
  viewportId?: string;
  request_id?: string;
  label?: string;
};

// Export the ORIGINAL DICOM P10 bytes of a loaded series back to the backend (so it
// can run segmentation). Bytes come straight from the cornerstone file cache via
// loadFileRequest — never reserialized — so SOP Instance UIDs are preserved and the
// returned SEG will hydrate onto this exact study.
type ExportDicomSeriesAction = {
  type: 'export_dicom_series';
  request_id: string;
  seriesInstanceUID?: string; // default: the active viewport's image series
};

type Action =
  | DrawAnnotationAction
  | SetWindowLevelAction
  | NavigateSliceAction
  | TransformViewportAction
  | ReadMeasurementAction
  | RequestCaptureAction
  | RenderSlicesAction
  | LoadSegmentationAction
  | ExportDicomSeriesAction;

function _resolveChainlitUrl(): string {
  if (typeof window === 'undefined') return 'http://localhost:8000';
  const explicit =
    (window as any).__ASKAI_CHAINLIT_URL__ || window.localStorage?.getItem('askai.chainlitUrl');
  if (explicit) return String(explicit).replace(/\/$/, '');
  const host = window.location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  return isLocal ? 'http://localhost:8000' : 'https://chat.saigalab.com';
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
  switch (action.type) {
    case 'draw_annotation':
      drawAnnotation(action);
      return;
    case 'set_window_level':
      setWindowLevel(action);
      return;
    case 'navigate_slice':
      navigateSlice(action);
      return;
    case 'transform_viewport':
      transformViewport(action);
      return;
    case 'read_measurement':
      readMeasurement(action);
      return;
    case 'render_slices':
      // Fire-and-forget: the renderer drives the stack and POSTs the captured
      // frames back to /capture/slices itself (the backend polls for them).
      void handleRenderSlices(action);
      return;
    case 'request_capture':
      // Re-composite the live overlay and re-push a fresh annotated screenshot
      // so the waiting measure localizer reads a current frame.
      forcePushState();
      return;
    case 'load_segmentation':
      // Inject a server-generated DICOM-SEG and overlay it on the loaded study.
      void loadSegmentation(action);
      return;
    case 'export_dicom_series':
      // Ship the loaded series' original DICOM bytes back to the backend.
      void exportDicomSeries(action);
      return;
    default:
      console.warn('[askai] unknown action type:', (action as any).type);
  }
}

// --- load_segmentation -----------------------------------------------------
// Overlay a server-generated DICOM-SEG onto the already-loaded study, WITHOUT a
// study reload. Mirrors OHIF's own local-upload path (filesToStudies.js):
//   fileManager.add(blob) -> dcmjs parse -> DicomMetadataStore.addInstance
// then makes the SEG display set and hydrates it via the SEG command. OHIF only
// hydrates a SEG whose ReferencedSeriesSequence matches the loaded series' SOP
// UIDs — the backend (seg_builder.py) guarantees that.
async function loadSegmentation(action: LoadSegmentationAction) {
  const services = getServicesManager()?.services as any;
  const commandsManager = getCommandsManager();
  if (!services || !commandsManager) {
    console.warn('[askai] load_segmentation: managers not ready');
    return;
  }
  const { displaySetService } = services;
  try {
    // 1. base64 -> bytes -> File (a locally-dropped DICOM, in effect)
    const bin = atob(action.seg_b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const file = new File([bytes], 'seg.dcm', { type: 'application/dicom' });

    // 2. inject like a local upload
    const wadouri = (dicomImageLoader as any).wadouri;
    const imageId = wadouri.fileManager.add(file);
    const image = await wadouri.loadFileRequest(imageId);
    const dicomData = (dcmjs as any).data.DicomMessage.readFile(image);
    const dataset: any = (dcmjs as any).data.DicomMetaDictionary.naturalizeDataset(dicomData.dict);
    dataset.url = imageId;
    // dicomLoaderService.getLocalData() only resolves the in-memory bytes if the
    // instance's imageId starts with 'dicomfile' — set it, or OHIF falls through to
    // fetching the bare id as a URL and fails with "Invalid DICOM file".
    dataset.imageId = imageId;
    dataset._meta = (dcmjs as any).data.DicomMetaDictionary.namifyDataset(dicomData.meta);
    dataset.AvailableTransferSyntaxUID =
      dataset.AvailableTransferSyntaxUID || dataset._meta?.TransferSyntaxUID?.Value?.[0];
    DicomMetadataStore.addInstance(dataset);

    // 3. make sure the SEG display set exists (mid-session inject may not auto-create)
    let segDS = _findSegDisplaySet(displaySetService, dataset.SeriesInstanceUID);
    if (!segDS) {
      try {
        const series = DicomMetadataStore.getSeries(
          dataset.StudyInstanceUID,
          dataset.SeriesInstanceUID
        );
        displaySetService.makeDisplaySets(series?.instances || [dataset]);
      } catch (e) {
        console.warn('[askai] load_segmentation: makeDisplaySets failed', e);
      }
    }
    // display-set creation can be async — poll briefly
    for (let i = 0; i < 20 && !segDS; i++) {
      await new Promise(r => setTimeout(r, 100));
      segDS = _findSegDisplaySet(displaySetService, dataset.SeriesInstanceUID);
    }
    if (!segDS) {
      console.warn('[askai] load_segmentation: SEG display set not created');
      postSegmentationResult(action, { ok: false, error: 'seg-displayset-not-created' });
      return;
    }

    // 4. load + show it on the viewport IMMEDIATELY (no manual "LOAD" prompt).
    //    segDS.load() parses the SEG bytes and creates the segmentation;
    //    addSegmentationRepresentation paints it on the viewport showing the CT.
    const viewportId = action.viewportId || getActiveViewportId();
    const { segmentationService } = services;
    if (typeof segDS.load === 'function') {
      await segDS.load({});
    }
    const segmentationId = segDS.displaySetInstanceUID;
    await segmentationService.addSegmentationRepresentation(viewportId, { segmentationId });

    console.log('[askai] load_segmentation: shown', segmentationId, 'on', viewportId);
    postSegmentationResult(action, {
      ok: true,
      segmentationDisplaySetUID: segmentationId,
      label: action.label,
    });
  } catch (e) {
    console.warn('[askai] load_segmentation failed', e);
    postSegmentationResult(action, { ok: false, error: String(e) });
  }
}

function _findSegDisplaySet(displaySetService: any, seriesInstanceUID: string): any | null {
  const list = displaySetService.getDisplaySetsForSeries?.(seriesInstanceUID) || [];
  return list.find((ds: any) => ds.Modality === 'SEG') || null;
}

function postSegmentationResult(action: LoadSegmentationAction, result: any) {
  try {
    const url = `${_resolveChainlitUrl()}/capture/segmentation_result`;
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_id: action.request_id, ...result }),
    }).catch(() => {
      /* backend may be down between polls; the tool times out gracefully */
    });
  } catch (e) {
    console.warn('[askai] postSegmentationResult failed', e);
  }
}

// --- export_dicom_series ---------------------------------------------------
// Ship the loaded series' ORIGINAL DICOM P10 bytes to the backend (multipart).
// Bytes come straight from cornerstone's file cache (loadFileRequest) — never
// reserialized — so SOP Instance UIDs are preserved and the SEG built from them
// will hydrate back onto this exact study.
async function exportDicomSeries(action: ExportDicomSeriesAction) {
  const services = getServicesManager()?.services as any;
  if (!services) {
    console.warn('[askai] export_dicom_series: managers not ready');
    return;
  }
  const { displaySetService, viewportGridService } = services;
  try {
    const isImageDS = (d: any) => d && !d.isOverlayDisplaySet && (d.images?.length || d.instances?.length);
    let ds: any = null;
    if (action.seriesInstanceUID) {
      ds = (displaySetService.getDisplaySetsForSeries?.(action.seriesInstanceUID) || []).find(isImageDS);
    }
    if (!ds) {
      // default: the image display set shown in the active viewport
      const vpId = getActiveViewportId();
      const uids = viewportGridService?.getDisplaySetsUIDsForViewport?.(vpId) || [];
      ds = uids.map((u: string) => displaySetService.getDisplaySetByUID(u)).find(isImageDS);
    }
    if (!ds) {
      console.warn('[askai] export_dicom_series: no image series to export');
      return;
    }
    const imageIds: string[] =
      ds.images?.map((im: any) => im.imageId) ||
      ds.instances?.map((i: any) => i.imageId || i.url) ||
      [];
    const wadouri = (dicomImageLoader as any).wadouri;
    const fd = new FormData();
    fd.append('request_id', action.request_id);
    let n = 0;
    for (const imageId of imageIds) {
      try {
        const buf = await wadouri.loadFileRequest(imageId); // original P10 ArrayBuffer
        fd.append('files', new Blob([buf], { type: 'application/dicom' }), `${n}.dcm`);
        n++;
      } catch (e) {
        console.warn('[askai] export_dicom_series: failed instance', imageId, e);
      }
    }
    const url = `${_resolveChainlitUrl()}/capture/dicom_series`;
    const r = await fetch(url, { method: 'POST', body: fd });
    console.log(`[askai] export_dicom_series: sent ${n}/${imageIds.length} instances → ${r.status}`);
  } catch (e) {
    console.warn('[askai] export_dicom_series failed', e);
  }
}

// commandsManager is captured in preRegistration (index.tsx → managers.ts). It
// can be null if an action somehow arrives before the extension registered.
function _commands(): any | null {
  const cm = getCommandsManager();
  if (!cm) {
    console.warn('[askai] commandsManager unavailable — was preRegistration run?');
  }
  return cm;
}

function setWindowLevel(action: SetWindowLevelAction) {
  const cm = _commands();
  if (!cm) return;
  const viewportId = action.viewportId || getActiveViewportId();
  if (action.presetName) {
    cm.runCommand('setWindowLevelPreset', { presetName: action.presetName });
  } else if (
    typeof action.windowWidth === 'number' &&
    typeof action.windowCenter === 'number'
  ) {
    cm.runCommand('setViewportWindowLevel', {
      viewportId,
      windowWidth: action.windowWidth,
      windowCenter: action.windowCenter,
    });
  } else {
    console.warn('[askai] set_window_level: need presetName or window+level', action);
  }
}

function _currentSliceIndex(vp: any): number | null {
  if (!vp) return null;
  if (typeof vp.getCurrentImageIdIndex === 'function') return vp.getCurrentImageIdIndex(); // stack
  if (typeof vp.getSliceIndex === 'function') return vp.getSliceIndex(); // volume
  return null;
}

function _sliceCount(vp: any): number | null {
  if (!vp) return null;
  try {
    const ids = typeof vp.getImageIds === 'function' ? vp.getImageIds() : null;
    if (ids?.length) return ids.length;
  } catch {
    /* ignore */
  }
  if (typeof vp.getNumberOfSlices === 'function') {
    try {
      return vp.getNumberOfSlices();
    } catch {
      /* ignore */
    }
  }
  return null;
}

function navigateSlice(action: NavigateSliceAction) {
  const cm = _commands();
  if (!cm) return;

  // Resolve everything to an ABSOLUTE index and drive jumpToImage with an
  // explicit viewport. The relative `scroll` command silently fails to move the
  // stack here (csUtils.scroll with our options no-ops), and the runCommand
  // fallbacks target only the ACTIVE viewport — unreliable while the user is
  // focused on the chat. Resolving the viewport by id + jumpToImage is proven
  // to move the slice.
  const viewportId = action.viewportId || getActiveViewportId();
  const getVp = (): any =>
    (viewportId ? getEnabledElementByViewportId(viewportId) : null)?.viewport;

  // Resolve to an ABSOLUTE target index against the CURRENT viewport state. Re-run
  // per attempt so it stays correct as a freshly-loaded stack finishes loading.
  const resolveTarget = (): number | null => {
    const vp = getVp();
    const total = _sliceCount(vp);
    if (typeof action.imageIndex === 'number') {
      return total != null ? Math.max(0, Math.min(total - 1, action.imageIndex)) : action.imageIndex;
    }
    if (action.position === 'first') return 0;
    if (action.position === 'last') return total != null ? total - 1 : -1;
    if (typeof action.delta === 'number') {
      const cur = _currentSliceIndex(vp);
      if (cur == null) return null;
      const t = cur + action.delta;
      return total != null ? Math.max(0, Math.min(total - 1, t)) : Math.max(0, t);
    }
    return null;
  };

  // Right after a fresh study load (or an all-slices render) the stack isn't
  // settled, so a single jumpToImage can silently no-op. Re-issue until the
  // current index actually lands on the target, up to a few attempts.
  let attempts = 0;
  const tryJump = () => {
    const target = resolveTarget();
    if (target == null) {
      console.warn('[askai] navigate_slice: nothing to do', action);
      return;
    }
    const args: any = { imageIndex: target };
    if (viewportId) args.viewport = { id: viewportId };
    try {
      cm.runCommand('jumpToImage', args);
    } catch (e) {
      console.warn('[askai] navigate_slice: jumpToImage failed', args, e);
    }
    attempts += 1;
    setTimeout(() => {
      const cur = _currentSliceIndex(getVp());
      if (cur !== target && attempts < 4) {
        tryJump();
      }
    }, 300);
  };
  tryJump();
}

function transformViewport(action: TransformViewportAction) {
  const cm = _commands();
  if (!cm) return;
  const viewportId = action.viewportId || getActiveViewportId();
  switch (action.operation) {
    case 'rotate':
      cm.runCommand('rotateViewportBy', { rotation: action.value ?? 90, viewportId });
      return;
    case 'flip_horizontal':
      cm.runCommand('flipViewportHorizontal', { viewportId, newValue: 'toggle' });
      return;
    case 'flip_vertical':
      cm.runCommand('flipViewportVertical', { viewportId, newValue: 'toggle' });
      return;
    case 'invert':
      cm.runCommand('invertViewport', {});
      return;
    case 'zoom_in':
      cm.runCommand('scaleUpViewport', {});
      return;
    case 'zoom_out':
      cm.runCommand('scaleDownViewport', {});
      return;
    case 'fit':
      cm.runCommand('fitViewportToWindow', {});
      return;
    case 'reset':
      cm.runCommand('resetViewport', {});
      return;
    default:
      console.warn('[askai] transform_viewport: unknown operation', action.operation);
  }
}

// Length (2 pts), Angle (3 pts, middle = vertex) and CobbAngle (4 pts = two
// lines) all store geometry as world handle points; only the toolName and point
// count differ. PlanarFreehandROI is the exception — it uses a closed contour.
const HANDLES_TOOLS = new Set<DrawToolName>(['Length', 'Angle', 'CobbAngle']);

function _textBoxScaffold() {
  return {
    hasMoved: false,
    worldPosition: [0, 0, 0],
    worldBoundingBox: {
      topLeft: [0, 0, 0],
      topRight: [0, 0, 0],
      bottomLeft: [0, 0, 0],
      bottomRight: [0, 0, 0],
    },
  };
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
  const canvasPoints = action.points_canvas_normalized.map(
    ([u, v]) => [u * cssW, v * cssH] as [number, number]
  );
  const worldPoints = canvasPoints.map(p => vp.canvasToWorld(p));

  const camera = typeof vp.getCamera === 'function' ? vp.getCamera() : null;
  const metadata = {
    toolName: action.toolName,
    viewPlaneNormal: camera?.viewPlaneNormal,
    viewUp: camera?.viewUp,
    FrameOfReferenceUID:
      typeof vp.getFrameOfReferenceUID === 'function' ? vp.getFrameOfReferenceUID() : undefined,
    referencedImageId:
      typeof vp.getCurrentImageId === 'function' ? vp.getCurrentImageId() : undefined,
  };

  try {
    if (HANDLES_TOOLS.has(action.toolName)) {
      // Construct the annotation manually rather than calling Tool.hydrate():
      // hydrate omits `data.cachedStats`, but the render path indexes into
      // `data.cachedStats[targetId]` without a guard, so a hydrate-created
      // annotation throws on first render. The DICOM-SR hydration path uses this
      // same manual pattern (see addSRAnnotation.ts). The tool's
      // _calculateCachedStats fills the value (mm / degrees) on first render.
      const ann = {
        annotationUID: action.annotationUID,
        highlighted: false,
        isLocked: false,
        isVisible: true,
        invalidated: true,
        autoGenerated: true,
        metadata,
        data: {
          handles: {
            points: worldPoints,
            activeHandleIndex: null,
            textBox: _textBoxScaffold(),
          },
          label: action.label,
          cachedStats: {},
        },
      };
      csAnnotation.state.addAnnotation(ann as any, vp.element);
      if (typeof vp.render === 'function') vp.render();
      reportMeasurement(vp, ann.annotationUID, action.toolName, worldPoints);
      return;
    }

    if (action.toolName === 'PlanarFreehandROI') {
      // Contour tools store geometry in data.contour.polyline (world) + closed,
      // not handle points. Build the skeleton, add it, then let the official
      // updateContourPolyline helper populate the polyline from canvas points
      // (it converts to world and sets the winding direction). Area / perimeter
      // are filled into cachedStats on first render.
      const ann: any = {
        annotationUID: action.annotationUID,
        highlighted: false,
        isLocked: false,
        isVisible: true,
        invalidated: true,
        autoGenerated: true,
        metadata,
        data: {
          handles: { points: [], activeHandleIndex: null, textBox: _textBoxScaffold() },
          contour: { polyline: [], closed: false },
          label: action.label,
          cachedStats: {},
        },
      };
      csAnnotation.state.addAnnotation(ann, vp.element);
      csToolsUtilities.contours.updateContourPolyline(
        ann,
        { points: canvasPoints, closed: action.closed !== false },
        {
          canvasToWorld: (p: any) => vp.canvasToWorld(p),
          worldToCanvas: (p: any) => vp.worldToCanvas(p),
        },
        { updateWindingDirection: true }
      );
      if (typeof vp.render === 'function') vp.render();
      reportMeasurement(vp, ann.annotationUID, action.toolName, ann.data.contour.polyline);
      return;
    }

    console.warn(`[askai] draw_annotation: tool "${action.toolName}" not handled yet`);
  } catch (e) {
    console.warn(`[askai] draw_annotation (${action.toolName}) failed:`, e);
  }
}

// Re-post the live value of an existing annotation the user has since edited.
// Looks the annotation up by UID, reads its toolName + current world geometry,
// and reuses reportMeasurement — which re-reads the (now recomputed) cachedStats
// and POSTs it back exactly like the initial draw. If the annotation is gone
// (user deleted it) or no viewport is available we stay silent; the backend's
// readback times out and falls back to asking the user to type the value.
function readMeasurement(action: ReadMeasurementAction) {
  const ann: any = csAnnotation.state.getAnnotation(action.annotationUID);
  if (!ann) {
    console.warn('[askai] read_measurement: annotation not found', action.annotationUID);
    return;
  }
  const toolName = ann?.metadata?.toolName as DrawToolName | undefined;
  if (!toolName) {
    console.warn('[askai] read_measurement: annotation has no toolName', action.annotationUID);
    return;
  }
  const viewportId = action.viewportId || getActiveViewportId();
  const enabled = viewportId ? getEnabledElementByViewportId(viewportId) : null;
  const vp: any = enabled?.viewport;
  if (!vp) {
    console.warn('[askai] read_measurement: no viewport for', viewportId);
    return;
  }
  const handlePts = ann?.data?.handles?.points;
  const worldPoints =
    Array.isArray(handlePts) && handlePts.length ? handlePts : ann?.data?.contour?.polyline || [];
  reportMeasurement(vp, action.annotationUID, toolName, worldPoints);
}

// Read the first target's cachedStats off a (possibly just-rendered) annotation.
function _firstCachedStats(ann: any): any | null {
  const cs = ann?.data?.cachedStats;
  if (!cs) return null;
  const keys = Object.keys(cs);
  return keys.length ? cs[keys[0]] : null;
}

// Report the drawn annotation's geometry + value back to the backend. Index
// points (via worldToIndex) let the backend pair with PixelSpacing; the value
// itself (mm / degrees / area) is whatever the viewer computed, so we read it
// from cachedStats — which is filled during the annotation render and can lag a
// frame behind addAnnotation, hence the short poll.
function reportMeasurement(
  vp: any,
  annotationUID: string,
  toolName: DrawToolName,
  worldPoints: any[]
) {
  let indexPoints: number[][] = [];
  let lengthPx: number | undefined;
  let imgData: any = null;
  try {
    imgData = typeof vp.getImageData === 'function' ? vp.getImageData() : null;
    const vtkImage = imgData?.imageData;
    if (vtkImage && typeof vtkImage.worldToIndex === 'function' && worldPoints?.length) {
      indexPoints = worldPoints.map(w => Array.from(vtkImage.worldToIndex(w)) as number[]);
      if (toolName === 'Length' && indexPoints.length >= 2) {
        const [i1, j1] = indexPoints[0];
        const [i2, j2] = indexPoints[1];
        lengthPx = Math.hypot(i2 - i1, j2 - j1);
      }
    }
  } catch (e) {
    console.warn('[askai] reportMeasurement geometry failed:', e);
  }

  // Every tool now carries its value in cachedStats — Length stores
  // {length, unit} (mm when the image is calibrated), filled on first render,
  // so wait for it like we do for angle/area rather than posting immediately.
  let tries = 0;
  const attempt = () => {
    tries++;
    const ann = csAnnotation.state.getAnnotation(annotationUID);
    const stats = _firstCachedStats(ann);
    const haveValue =
      stats &&
      (typeof stats.angle === 'number' ||
        typeof stats.area === 'number' ||
        typeof stats.length === 'number');
    if (!haveValue && tries < 8) {
      setTimeout(attempt, 150);
      return;
    }
    postMeasurement(annotationUID, toolName, indexPoints, lengthPx, stats, imgData);
  };
  attempt();
}

function postMeasurement(
  annotationUID: string,
  toolName: DrawToolName,
  indexPoints: number[][],
  lengthPx: number | undefined,
  stats: any | null,
  imgData: any
) {
  try {
    const body: any = {
      annotationUID,
      toolName,
      indexPoints,
      dimensions: imgData?.dimensions,
      spacing: imgData?.spacing,
    };
    if (typeof lengthPx === 'number') body.lengthPx = lengthPx;
    if (stats) {
      // OHIF's own Length value (the number drawn on the image / shown in the
      // panel). unit is "mm" when the image has pixel spacing, else "px". This
      // is the source of truth — the backend prefers it over the raw lengthPx.
      if (typeof stats.length === 'number') {
        body.lengthValue = stats.length;
        body.lengthUnit = stats.unit;
      }
      if (typeof stats.angle === 'number') body.angleDeg = stats.angle;
      if (typeof stats.area === 'number') {
        body.area = stats.area;
        body.areaUnit = stats.areaUnit || stats.unit;
      }
      if (typeof stats.perimeter === 'number') body.perimeter = stats.perimeter;
      // Intensity stats off the same cachedStats object (PlanarFreehandROI etc.).
      // These are what the OHIF panel shows as Mean/Max/Min/Std Dev.
      if (typeof stats.mean === 'number') body.mean = stats.mean;
      if (typeof stats.max === 'number') body.max = stats.max;
      if (typeof stats.min === 'number') body.min = stats.min;
      if (typeof stats.stdDev === 'number') body.stdDev = stats.stdDev;
      if (stats.modalityUnit) body.modalityUnit = stats.modalityUnit;
    }
    const url = `${_resolveChainlitUrl()}/capture/measurement_result`;
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => {
      /* backend may be down between polls; the tool will time out gracefully */
    });
  } catch (e) {
    console.warn('[askai] postMeasurement failed:', e);
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
