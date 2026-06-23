/**
 * Hydrate a hosted sample study into DicomMetadataStore at app startup so it
 * appears as a row in the Study List worklist and opens in the viewer.
 *
 * How it works (pure client-side — no DICOMweb server, safe on static hosting
 * like Firebase): the app's default data source is `dicomlocal`, whose worklist
 * query reads straight from the in-memory DicomMetadataStore singleton. We fetch
 * a dicomjson-style manifest
 *   {"studies":[{...,"series":[{...,"instances":[{ metadata, url }]}]}]}
 * and push it into that store from the extension's preRegistration hook, which
 * OHIF awaits BEFORE the worklist's first query — so the row is there on first
 * render. Clicking it opens via dicomlocal, which wires each instance's `url`
 * (e.g. `wadouri:`/`dicomweb:`) into a cornerstone imageId itself.
 *
 * Fails graceful: any fetch/parse/inject error just leaves the worklist empty
 * and logs a warning. A timeout bounds how long a slow manifest can delay boot.
 */
import { DicomMetadataStore } from '@ohif/core';

const FETCH_TIMEOUT_MS = 6000;

export async function hydrateSampleStudy(manifestUrl?: string): Promise<void> {
  if (!manifestUrl || typeof manifestUrl !== 'string') {
    return;
  }

  let manifest: any;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(manifestUrl, { signal: controller.signal, credentials: 'omit' });
    clearTimeout(timer);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    manifest = await res.json();
  } catch (e) {
    console.warn('[askai] sample study: manifest fetch failed; Study List left empty.', e);
    return;
  }

  const studies = manifest && manifest.studies;
  if (!Array.isArray(studies) || studies.length === 0) {
    return;
  }

  try {
    let instanceCount = 0;
    studies.forEach((study: any) => {
      const { series = [], ...studyFields } = study;
      if (!Array.isArray(series) || series.length === 0) {
        return;
      }

      // 1) Series summaries first → fires SERIES_ADDED, seeds ModalitiesInStudy.
      const seriesSummary = series.map((s: any) => {
        const { instances, ...seriesFields } = s;
        return { StudyInstanceUID: study.StudyInstanceUID, ...seriesFields };
      });
      DicomMetadataStore.addSeriesMetadata(seriesSummary, false);

      // 2) Flat naturalized instances per series → fires INSTANCES_ADDED.
      //    Study/series fields are spread as defaults; the per-instance
      //    naturalized metadata wins; `url` is the cornerstone-loadable imageId
      //    the dicomlocal source reads when the row is opened.
      series.forEach((s: any) => {
        const { instances = [], ...seriesFields } = s;
        const naturalized = (Array.isArray(instances) ? instances : [])
          .filter((inst: any) => inst && inst.url && inst.metadata)
          .map((inst: any) => ({
            ...studyFields,
            ...seriesFields,
            ...inst.metadata,
            url: inst.url,
          }));
        if (naturalized.length) {
          DicomMetadataStore.addInstances(naturalized, false);
          instanceCount += naturalized.length;
        }
      });
    });
    console.info(
      `[askai] sample study hydrated into the Study List: ${studies.length} study(ies), ${instanceCount} instance(s).`
    );
  } catch (e) {
    console.warn('[askai] sample study: injection into DicomMetadataStore failed.', e);
  }
}
