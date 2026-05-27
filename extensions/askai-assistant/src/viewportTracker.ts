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
import { eventTarget, Enums as CSEnums, getEnabledElement } from '@cornerstonejs/core';

export type ViewportState = {
  imageId: string | null;
  viewportId: string | null;
  voi: { lower: number; upper: number } | null;
  modality: string | null;
  slice: { index: number; total: number } | null;
  updatedAt: number;
};

const EMPTY_STATE: ViewportState = {
  imageId: null,
  viewportId: null,
  voi: null,
  modality: null,
  slice: null,
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
      updatedAt: Date.now(),
    };
  } catch (e) {
    console.warn('[askai] _extractState failed:', e);
    return { ...EMPTY_STATE, updatedAt: Date.now() };
  }
}

function _resolveChainlitUrl(): string {
  // Allow per-browser override via localStorage (same key as the Copilot inject)
  const fromLS =
    typeof window !== 'undefined' && window.localStorage?.getItem('askai.chainlitUrl');
  return (fromLS || 'http://localhost:8000').replace(/\/$/, '');
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

const _pushToBackend = _debounce(async (state: ViewportState) => {
  if (!state.imageId) return;
  const url = `${_resolveChainlitUrl()}/capture/state`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: 'default', // single-user dev; per-session in M+1
        imageId: state.imageId,
        viewportId: state.viewportId,
        voi: state.voi,
        slice: state.slice,
      }),
      // No credentials yet — see app.py CORSMiddleware notes.
    });
  } catch (e) {
    console.warn(`[askai] /capture/state POST failed (is chainlit at ${url}?):`, e);
  }
}, 200);

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
    _pushToBackend(state);
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
