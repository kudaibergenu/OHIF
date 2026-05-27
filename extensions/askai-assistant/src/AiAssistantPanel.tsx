import React, { useEffect, useState } from 'react';

import { subscribeViewportState, ViewportState } from './viewportTracker';

function _parseImageId(imageId: string | null): {
  study?: string;
  series?: string;
  instance?: string;
  frame?: string;
} {
  if (!imageId) return {};
  // Cornerstone3D uses URLs like "wadors:/dicom-web/studies/{S}/series/{Se}/instances/{I}/frames/{F}"
  const m = imageId.match(
    /studies\/([^/]+)\/series\/([^/]+)\/instances\/([^/]+)(?:\/frames\/([^/?]+))?/i
  );
  if (!m) return {};
  return { study: m[1], series: m[2], instance: m[3], frame: m[4] };
}

const labelStyle: React.CSSProperties = {
  fontSize: '11px',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  opacity: 0.6,
  marginTop: '10px',
  marginBottom: '2px',
};
const valueStyle: React.CSSProperties = {
  fontSize: '12px',
  fontFamily:
    'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
  wordBreak: 'break-all',
  color: '#e2e8f0',
};

export default function AiAssistantPanel() {
  const [state, setState] = useState<ViewportState>({
    imageId: null,
    viewportId: null,
    voi: null,
    modality: null,
    slice: null,
    updatedAt: 0,
  });

  useEffect(() => {
    const unsub = subscribeViewportState(setState);
    return () => {
      unsub();
    };
  }, []);

  const ids = _parseImageId(state.imageId);
  const hasState = !!state.imageId;
  const ageMs = state.updatedAt ? Date.now() - state.updatedAt : 0;

  return (
    <div
      style={{
        padding: '14px',
        color: '#cbd5e1',
        fontFamily: 'system-ui, sans-serif',
        fontSize: '13px',
        lineHeight: 1.45,
      }}
    >
      <h2 style={{ fontSize: '15px', marginBottom: '10px', color: '#f1f5f9' }}>AI Status</h2>

      <p style={{ marginBottom: '8px' }}>
        Chat lives in the floating bubble (bottom-right). This panel mirrors what
        the agent currently knows about your view.
      </p>

      {!hasState && (
        <div
          style={{
            marginTop: '12px',
            padding: '10px',
            border: '1px dashed #475569',
            borderRadius: '6px',
            opacity: 0.7,
          }}
        >
          Waiting for the first slice render… Open a study to start tracking.
        </div>
      )}

      {hasState && (
        <>
          <div style={labelStyle}>Slice</div>
          <div style={valueStyle}>
            {state.slice ? `${state.slice.index + 1} / ${state.slice.total}` : '—'}
          </div>

          <div style={labelStyle}>Window / Level (lower, upper)</div>
          <div style={valueStyle}>
            {state.voi
              ? `${Math.round(state.voi.lower)}, ${Math.round(state.voi.upper)}`
              : '—'}
          </div>

          <div style={labelStyle}>Viewport ID</div>
          <div style={valueStyle}>{state.viewportId || '—'}</div>

          <div style={labelStyle}>Series UID</div>
          <div style={valueStyle}>{ids.series || '—'}</div>

          <div style={labelStyle}>Instance UID</div>
          <div style={valueStyle}>{ids.instance || '—'}</div>

          <div style={{ ...labelStyle, marginTop: '14px' }}>Updated</div>
          <div style={valueStyle}>
            {ageMs < 1000 ? 'just now' : `${(ageMs / 1000).toFixed(1)}s ago`}
          </div>
        </>
      )}
    </div>
  );
}
