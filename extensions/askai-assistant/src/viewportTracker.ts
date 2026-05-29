/**
 * Headless tracker that pushes the live OHIF viewport state to the
 * askaihealth Chainlit backend at /capture/state.
 *
 * Two outputs:
 *   1. Network: POSTs to ${CHAINLIT_URL}/capture/state on every relevant
 *      Cornerstone3D event, debounced ~200 ms.
 *   2. In-process: notifies subscribers (the AI Status panel) so they
 *      can render the current state without re-fetching.
 */
import { eventTarget, Enums as CSEnums, getEnabledElement, metaData } from '@cornerstonejs/core';
import { Enums as CSToolsEnums } from '@cornerstonejs/tools';

export type ViewportState = {
  imageId: string | null;
  viewportId: string | null;
  voi: { lower: number; upper: number } | null;
  modality: string | null;
  slice: { index: number; total: number } | null;
  // BurnedInAnnotation (0028,0301) of the current image — text painted into the
  // pixels that tag anonymization can't redact. The backend's PHI guard refuses
  // to analyze a frame when this is true. null when the metadata isn't available.
  burnedIn: boolean | null;
  updatedAt: number;
};

const EMPTY_STATE: ViewportState = {
  imageId: null,
  viewportId: null,
  voi: null,
  modality: null,
  slice: null,
  burnedIn: null,
  updatedAt: 0,
};

let _latest: ViewportState = EMPTY_STATE;
const _subscribers = new Set<(s: ViewportState) => void>();

export function getLatestViewportState(): ViewportState {
  return _latest;
}

export function subscribeViewportState(cb: (s: ViewportState) => void): () => void {
  _subscribers.add(cb);
  cb(_latest); // prime
  return () => _subscribers.delete(cb);
}

function _emit(state: ViewportState) {
  _latest = state;
  _subscribers.forEach(cb => {
    try {
      cb(state);
    } catch (e) {
      console.warn('[askai] subscriber threw:', e);
    }
  });
}

/**
 * Resolve the active Cornerstone3D viewport from a Cornerstone event.
 * Events carry `element` in the detail; getEnabledElement turns that into
 * a viewport + rendering engine.
 */
function _viewportFromEvent(evt: any): any | null {
  try {
    const element = evt?.detail?.element ?? evt?.target;
    if (!element) return null;
    const enabled = getEnabledElement(element);
    return enabled?.viewport ?? null;
  } catch {
    return null;
  }
}

function _extractState(vp: any): ViewportState {
  try {
    const imageId = typeof vp?.getCurrentImageId === 'function' ? vp.getCurrentImageId() : null;
    const properties = typeof vp?.getProperties === 'function' ? vp.getProperties() : {};
    const voi = properties?.voiRange
      ? { lower: properties.voiRange.lower, upper: properties.voiRange.upper }
      : null;

    let slice: ViewportState['slice'] = null;
    if (typeof vp?.getCurrentImageIdIndex === 'function' && typeof vp?.getImageIds === 'function') {
      const idx = vp.getCurrentImageIdIndex();
      const total = (vp.getImageIds() || []).length;
      if (Number.isFinite(idx) && total > 0) slice = { index: idx, total };
    }

    return {
      imageId: imageId ?? null,
      viewportId: vp?.id ?? null,
      voi,
      modality: null, // populated server-side from the DICOM if needed
      slice,
      burnedIn: _readBurnedIn(imageId),
      updatedAt: Date.now(),
    };
  } catch (e) {
    console.warn('[askai] _extractState failed:', e);
    return { ...EMPTY_STATE, updatedAt: Date.now() };
  }
}

// BurnedInAnnotation=YES of the current image, read from Cornerstone's parsed
// instance metadata. null when unknown (no imageId / tag absent) — the backend
// treats null as "not flagged", matching the old fail-open DICOMweb check.
function _readBurnedIn(imageId: string | null): boolean | null {
  if (!imageId) return null;
  try {
    const inst: any = metaData.get('instance', imageId);
    const raw = inst?.BurnedInAnnotation;
    if (raw == null) return null;
    return String(raw).toUpperCase() === 'YES';
  } catch {
    return null;
  }
}

function _resolveChainlitUrl(): string {
  if (typeof window === 'undefined') return 'http://localhost:8000';
  // Prefer the global the Copilot inject sets synchronously, then the
  // per-browser localStorage override (same key as the inject).
  const explicit =
    (window as any).__ASKAI_CHAINLIT_URL__ || window.localStorage?.getItem('askai.chainlitUrl');
  if (explicit) return String(explicit).replace(/\/$/, '');
  // No explicit config: localhost in dev, deployed backend in prod.
  const host = window.location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  return isLocal ? 'http://localhost:8000' : 'https://chat.saigalab.com';
}

function _debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;
  return ((...args: Parameters<T>) => {
    lastArgs = args;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (lastArgs) fn(...lastArgs);
    }, ms);
  }) as T;
}

// State-only channel — small JSON, fires ~per scroll
const _pushStateCheap = _debounce(async (state: ViewportState) => {
  if (!state.imageId) return;
  const url = `${_resolveChainlitUrl()}/capture/state`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: 'default',
        imageId: state.imageId,
        viewportId: state.viewportId,
        voi: state.voi,
        slice: state.slice,
        burned_in: state.burnedIn,
      }),
    });
  } catch (e) {
    console.warn(`[askai] /capture/state POST failed (is chainlit at ${url}?):`, e);
  }
}, 200);

// Screenshot channel — heavier payload (~200-500 KB), fires only after a render
// settles. Both state and PNG go in the same POST so backend caches them
// atomically. Two PNGs travel together: png_b64 (clean, raw canvas) and, when
// any annotation is drawn, png_annotated_b64 (clean + .svg-layer composited).
// Last CLEAN capture per viewport element, recorded inside IMAGE_RENDERED.
// Annotation-change events reuse it to re-composite + re-push the annotated
// frame without a fresh WebGL capture: the SVG overlay persists in the DOM, so
// we only need the clean raster + the (now-updated) overlay.
const _lastClean = new Map<Element, { state: ViewportState; pngDataUrl: string }>();

let _screenshotPushCount = 0;
const _pushScreenshotHeavy = _debounce(
  async (state: ViewportState, pngDataUrl: string, element: any) => {
    if (!state.imageId || !pngDataUrl) return;
    // toDataURL returns "data:image/png;base64,<...>". Backend expects raw base64.
    const b64 = _stripDataUrl(pngDataUrl);
    if (!b64 || b64.length < 100) {
      console.warn(
        `[askai] screenshot payload suspiciously small (${b64?.length || 0} chars). ` +
          `WebGL preserveDrawingBuffer issue? Skipping push.`
      );
      return;
    }

    // Layer the annotation overlay on top for the "with annotations" variant.
    // Null when nothing is drawn — then the backend only caches the clean PNG.
    let annotatedB64: string | null = null;
    const annotatedDataUrl = await _compositeAnnotated(element, pngDataUrl);
    if (annotatedDataUrl) {
      const a = _stripDataUrl(annotatedDataUrl);
      if (a && a.length >= 100) annotatedB64 = a;
    }

    const url = `${_resolveChainlitUrl()}/capture/state`;
    try {
      const body: Record<string, unknown> = {
        session_id: 'default',
        imageId: state.imageId,
        viewportId: state.viewportId,
        voi: state.voi,
        slice: state.slice,
        burned_in: state.burnedIn,
        png_b64: b64,
      };
      if (annotatedB64) body.png_annotated_b64 = annotatedB64;
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      _screenshotPushCount++;
      if (_screenshotPushCount === 1 || _screenshotPushCount % 10 === 0) {
        console.log(
          `[askai] screenshot pushed (#${_screenshotPushCount}, ${Math.round(b64.length / 1024)} KB` +
            `${annotatedB64 ? ` + ${Math.round(annotatedB64.length / 1024)} KB annotated` : ''})`
        );
      }
    } catch (e) {
      console.warn(`[askai] heavy /capture/state POST failed:`, e);
    }
  },
  500
);

/**
 * Synchronously capture the viewport canvas as a PNG data URL. MUST be called
 * inside the IMAGE_RENDERED event handler — that's the only moment when the
 * WebGL drawing buffer is guaranteed to be alive. Outside that handler the
 * buffer is swapped and toDataURL would return a blank PNG (unless the
 * rendering engine was created with preserveDrawingBuffer: true).
 *
 * This captures ONLY the WebGL canvas, i.e. the raw image. Cornerstone3D draws
 * measurements/annotations onto a separate `.svg-layer` overlay, NOT onto this
 * canvas — so the result is the CLEAN slice. _compositeAnnotated() layers the
 * overlay back on for the "with annotations" variant.
 */
function _capturePng(vp: any): string | null {
  try {
    const canvas: HTMLCanvasElement | undefined =
      typeof vp?.getCanvas === 'function' ? vp.getCanvas() : null;
    if (!canvas) return null;
    return canvas.toDataURL('image/png');
  } catch (e) {
    console.warn('[askai] _capturePng failed:', e);
    return null;
  }
}

function _stripDataUrl(dataUrl: string): string {
  return dataUrl.includes(',') ? dataUrl.split(',', 2)[1] : dataUrl;
}

function _loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Build a "with annotations" PNG by compositing the viewport's `.svg-layer`
 * overlay on top of the already-captured clean canvas PNG. Returns null when
 * nothing is drawn (annotated == clean) or on any failure — callers fall back
 * to the clean image.
 *
 * Unlike _capturePng this does NOT need the live WebGL buffer: it rasterizes
 * the clean data URL (passed in) plus the SVG DOM (which persists after the
 * render), so it can safely run later inside the debounced push.
 *
 * The clean PNG is at backing-store resolution (canvas.width = cssWidth * DPR),
 * while the SVG overlay is laid out in CSS pixels. We give the serialized SVG a
 * viewBox of its CSS size and a width/height of the backing-store size so the
 * annotations scale 1:1 onto the clean raster.
 */
async function _compositeAnnotated(element: any, cleanDataUrl: string): Promise<string | null> {
  try {
    const internal: Element | null =
      typeof element?.querySelector === 'function'
        ? element.querySelector('.viewport-element')
        : null;
    const svg = internal?.querySelector(':scope > .svg-layer') as SVGSVGElement | null;
    // The layer always holds a <defs> (drop-shadow filter); a drawn annotation
    // is any child that ISN'T that <defs>. No such child → annotated == clean.
    const hasAnnotation =
      !!svg && Array.from(svg.children).some(c => c.tagName.toLowerCase() !== 'defs');
    if (!svg || !hasAnnotation) return null;

    const baseImg = await _loadImage(cleanDataUrl);
    const w = baseImg.naturalWidth;
    const h = baseImg.naturalHeight;
    if (!w || !h) return null;

    const cssW = svg.clientWidth || parseFloat(svg.getAttribute('width') || '') || w;
    const cssH = svg.clientHeight || parseFloat(svg.getAttribute('height') || '') || h;

    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('viewBox', `0 0 ${cssW} ${cssH}`);
    clone.setAttribute('width', String(w));
    clone.setAttribute('height', String(h));
    const svgStr = new XMLSerializer().serializeToString(clone);
    const svgUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
    const svgImg = await _loadImage(svgUrl);

    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const ctx = off.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(baseImg, 0, 0, w, h);
    ctx.drawImage(svgImg, 0, 0, w, h);
    return off.toDataURL('image/png');
  } catch (e) {
    console.warn('[askai] _compositeAnnotated failed:', e);
    return null;
  }
}

let _started = false;

export function startViewportTracker() {
  if (_started) return;
  _started = true;

  let _eventCount = 0;
  let _enabledElementCount = 0;
  const _seenEvents = new Set<string>();
  const _trackedElements = new WeakSet<Element>();

  // Per-element handler — STACK_NEW_IMAGE/IMAGE_RENDERED/VOI_MODIFIED/CAMERA_MODIFIED
  // fire on the viewport's DOM element, not on the global eventTarget. We attach
  // these once per viewport element when ELEMENT_ENABLED tells us it's ready.
  const onElementEvent = (eventName: string) => (evt: any) => {
    _eventCount++;
    if (!_seenEvents.has(eventName)) {
      _seenEvents.add(eventName);
      console.log(`[askai] first ${eventName} event received`, {
        hasDetail: !!evt?.detail,
        detailKeys: evt?.detail ? Object.keys(evt.detail) : null,
      });
    }
    const vp = _viewportFromEvent(evt);
    if (!vp) {
      if (_eventCount % 20 === 1) {
        console.warn(`[askai] ${eventName} fired but viewport could not be resolved`);
      }
      return;
    }
    const state = _extractState(vp);
    _emit(state);

    // Cheap channel — always send state on every event.
    _pushStateCheap(state);

    // Heavy channel — only safe to capture PNG inside IMAGE_RENDERED (WebGL
    // buffer is preserved at this microtask). Other events fire before the
    // render swaps buffers, so toDataURL there would return blank pixels.
    if (eventName === 'IMAGE_RENDERED') {
      const pngDataUrl = _capturePng(vp);
      if (pngDataUrl) {
        _lastClean.set(vp.element, { state, pngDataUrl });
        _pushScreenshotHeavy(state, pngDataUrl, vp.element);
      }
    }
  };

  const attachToElement = (element: Element) => {
    if (_trackedElements.has(element)) return;
    _trackedElements.add(element);
    _enabledElementCount++;
    element.addEventListener(CSEnums.Events.STACK_NEW_IMAGE, onElementEvent('STACK_NEW_IMAGE'));
    element.addEventListener(CSEnums.Events.IMAGE_RENDERED, onElementEvent('IMAGE_RENDERED'));
    element.addEventListener(CSEnums.Events.VOI_MODIFIED, onElementEvent('VOI_MODIFIED'));
    element.addEventListener(CSEnums.Events.CAMERA_MODIFIED, onElementEvent('CAMERA_MODIFIED'));
    console.log(
      `[askai] attached element listeners (enabled element #${_enabledElementCount})`
    );
  };

  // Global subscription: pick up viewport elements as they're enabled.
  eventTarget.addEventListener(CSEnums.Events.ELEMENT_ENABLED, (evt: any) => {
    const element = evt?.detail?.element;
    if (element) attachToElement(element);
  });

  // Measurements/annotations fire ANNOTATION_* events (on the global target),
  // NOT IMAGE_RENDERED — so without this a freshly drawn/edited measurement
  // would never reach /capture/state until the next image render. Re-composite
  // the now-updated overlay onto the last clean capture and re-push it. The
  // 500ms debounce in _pushScreenshotHeavy coalesces rapid drag events.
  const onAnnotationChange = () => {
    for (const [element, stored] of _lastClean) {
      _pushScreenshotHeavy(stored.state, stored.pngDataUrl, element);
    }
  };
  for (const ev of [
    CSToolsEnums.Events.ANNOTATION_COMPLETED,
    CSToolsEnums.Events.ANNOTATION_MODIFIED,
    CSToolsEnums.Events.ANNOTATION_REMOVED,
  ]) {
    eventTarget.addEventListener(ev, onAnnotationChange);
  }

  // Catch any elements that were already enabled before our subscription ran:
  // walk OHIF's typical viewport container and attach to any cornerstone canvases.
  setTimeout(() => {
    document.querySelectorAll('[data-cs-options]').forEach(attachToElement);
  }, 1000);

  console.log(
    '[askai] viewport tracker started — waiting for ELEMENT_ENABLED, then attaching per-element listeners'
  );

  // Expose for ad-hoc debugging from the console:
  //   window.__askaiTracker.getLatest()
  //   window.__askaiTracker.eventCount
  //   window.__askaiTracker.elementCount
  (window as any).__askaiTracker = {
    getLatest: getLatestViewportState,
    get eventCount() {
      return _eventCount;
    },
    get elementCount() {
      return _enabledElementCount;
    },
    seenEvents: _seenEvents,
  };
}
