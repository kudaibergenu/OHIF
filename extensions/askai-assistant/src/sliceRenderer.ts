/**
 * Client-side slice renderer — the local-data answer to the backend's old
 * server-side `/rendered` fetch.
 *
 * When the askaihealth backend wants to analyze specific slices it can no longer
 * pull them from a DICOMweb server (local-only data never leaves the browser).
 * Instead it enqueues a `render_slices` action; we drive the live stack viewport
 * through the requested slice indices, capture each rendered frame to a PNG, and
 * POST the batch to /capture/slices keyed by the action's request_id.
 *
 * Why drive the LIVE viewport rather than render off-screen: the on-screen
 * viewport already carries the radiologist's current window/level (and zoom),
 * which is exactly the contrast the model should see. Cornerstone's off-screen
 * loadImageToCanvas renders at the image's default VOI, losing that. The cost is
 * a brief visible scrub through the slices; we restore the starting slice when
 * done.
 *
 * toDataURL only returns live pixels while the WebGL drawing buffer is alive,
 * i.e. synchronously inside an IMAGE_RENDERED handler (the rendering engine is
 * created without preserveDrawingBuffer). So each capture rides a one-shot
 * IMAGE_RENDERED listener that we arm right before moving the stack.
 */
import { Enums as CSEnums, getEnabledElementByViewportId, metaData } from '@cornerstonejs/core';
import { getActiveViewportId } from './managers';
import { captureAuthHeaders } from './captureAuth';

type RenderSlicesAction = {
  type: 'render_slices';
  request_id: string;
  viewportId?: string;
  // 1-based slice positions into the viewport's image stack. null => all slices,
  // evenly subsampled to max_slices (the backend's all_slices=True path).
  slice_numbers?: number[] | null;
  max_slices?: number;
};

const CAPTURE_TIMEOUT_MS = 3000;

function _resolveChainlitUrl(): string {
  if (typeof window === 'undefined') return 'http://localhost:8000';
  const explicit =
    (window as any).__ASKAI_CHAINLIT_URL__ || window.localStorage?.getItem('askai.chainlitUrl');
  if (explicit) return String(explicit).replace(/\/$/, '');
  const host = window.location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  return isLocal ? 'http://localhost:8000' : 'https://chat.saigalab.com';
}

function _stripDataUrl(dataUrl: string): string {
  return dataUrl.includes(',') ? dataUrl.split(',', 2)[1] : dataUrl;
}

// Mirror of the backend's old _evenly_subsample: pick n items uniformly spaced
// across the list, returning all of them when there are fewer than n.
function _evenlySubsample<T>(items: T[], n: number): T[] {
  if (n <= 1) return items.slice(0, 1);
  if (items.length <= n) return items.slice();
  const step = (items.length - 1) / (n - 1);
  return Array.from({ length: n }, (_, i) => items[Math.round(i * step)]);
}

// Any instance in the stack flagged BurnedInAnnotation=YES (0028,0301) means a
// rendered frame could contain text painted into the pixels — the PHI guard the
// backend enforces. Best-effort: local DICOM parsed by Cornerstone exposes the
// tag via the 'instance' metadata module; absent => treat as not burned in
// (fail-open, same as the old DICOMweb check).
function _anyBurnedIn(imageIds: string[]): boolean {
  return imageIds.some(id => {
    try {
      const inst: any = metaData.get('instance', id);
      return String(inst?.BurnedInAnnotation ?? '').toUpperCase() === 'YES';
    } catch {
      return false;
    }
  });
}

/**
 * Move the stack to `targetIdx` and capture the rendered frame as raw base64.
 * Resolves null on timeout or capture failure (the backend treats a missing
 * slice as un-fetchable rather than fatal).
 */
function _captureSliceAt(vp: any, targetIdx: number): Promise<string | null> {
  return new Promise(resolve => {
    const el: Element = vp.element;
    let done = false;

    const finish = (val: string | null) => {
      if (done) return;
      done = true;
      el.removeEventListener(CSEnums.Events.IMAGE_RENDERED, onRendered as EventListener);
      clearTimeout(timer);
      resolve(val);
    };

    const onRendered = () => {
      // Synchronous capture while the WebGL buffer is still alive.
      try {
        const canvas: HTMLCanvasElement | null =
          typeof vp.getCanvas === 'function' ? vp.getCanvas() : null;
        finish(canvas ? _stripDataUrl(canvas.toDataURL('image/png')) : null);
      } catch {
        finish(null);
      }
    };

    el.addEventListener(CSEnums.Events.IMAGE_RENDERED, onRendered as EventListener);
    const timer = setTimeout(() => finish(null), CAPTURE_TIMEOUT_MS);

    // setImageIdIndex triggers a render (→ IMAGE_RENDERED → capture). When the
    // target equals the current index it may not re-render, so force one if the
    // promise settled before our listener fired.
    Promise.resolve(vp.setImageIdIndex(targetIdx))
      .then(() => {
        if (!done && typeof vp.render === 'function') vp.render();
      })
      .catch(() => finish(null));
  });
}

async function handleRenderSlices(action: RenderSlicesAction): Promise<void> {
  const viewportId = action.viewportId || getActiveViewportId();
  const enabled = viewportId ? getEnabledElementByViewportId(viewportId) : null;
  const vp: any = enabled?.viewport;

  const post = async (body: Record<string, unknown>) => {
    const url = `${_resolveChainlitUrl()}/capture/slices`;
    const auth = await captureAuthHeaders();
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ request_id: action.request_id, ...body }),
    }).catch(e => {
      console.warn('[askai] /capture/slices POST failed:', e);
    });
  };

  if (!vp || typeof vp.setImageIdIndex !== 'function' || typeof vp.getImageIds !== 'function') {
    await post({
      total: 0,
      burned_in: false,
      out_of_range: [],
      slices: {},
      error:
        'No stack viewport to render from. Open a study in the viewer (a stack ' +
        'viewport), then retry.',
    });
    return;
  }

  const imageIds: string[] = vp.getImageIds() || [];
  const total = imageIds.length;
  const maxSlices = action.max_slices && action.max_slices > 0 ? action.max_slices : 24;

  if (total === 0) {
    await post({ total: 0, burned_in: false, out_of_range: [], slices: {} });
    return;
  }

  const burnedIn = _anyBurnedIn(imageIds);
  if (burnedIn) {
    // Mirror the backend: refuse before rendering any pixels.
    await post({ total, burned_in: true, out_of_range: [], slices: {} });
    return;
  }

  // Resolve which 1-based slice numbers to render.
  let inRange: number[];
  let outOfRange: number[] = [];
  if (action.slice_numbers == null) {
    inRange = _evenlySubsample(
      Array.from({ length: total }, (_, i) => i + 1),
      maxSlices
    );
  } else {
    const wanted = Array.from(new Set(action.slice_numbers.map(n => Math.trunc(n)))).sort(
      (a, b) => a - b
    );
    inRange = wanted.filter(n => n >= 1 && n <= total);
    outOfRange = wanted.filter(n => n < 1 || n > total);
  }

  const startIdx =
    typeof vp.getCurrentImageIdIndex === 'function' ? vp.getCurrentImageIdIndex() : 0;

  const slices: Record<number, string> = {};
  try {
    for (const n of inRange) {
      const b64 = await _captureSliceAt(vp, n - 1);
      if (b64 && b64.length >= 100) slices[n] = b64;
    }
  } finally {
    // Restore the radiologist's original slice regardless of outcome.
    try {
      await Promise.resolve(vp.setImageIdIndex(startIdx));
    } catch {
      /* best-effort restore */
    }
  }

  await post({ total, burned_in: false, out_of_range: outOfRange, slices });
  console.log(
    `[askai] render_slices ${action.request_id}: ${Object.keys(slices).length}/${inRange.length} captured (total ${total})`
  );
}

export { handleRenderSlices };
export type { RenderSlicesAction };
