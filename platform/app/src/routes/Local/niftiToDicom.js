/**
 * SaigaLab addition — transparently convert a NIfTI volume (.nii / .nii.gz) into a set
 * of DICOM slices *in the browser*, so OHIF's DICOM-only local loader can display it.
 * One NIfTI volume -> one Study, one Series, N single-frame instances (one per slice),
 * sharing Study/Series/FrameOfReference UIDs, so it stacks like a native CT/MR series.
 *
 * Mirrors imageToDicom.js (PNG/JPEG -> DICOM) and reuses dcmjs (already a dep) as the
 * writer + pako (already in node_modules) for gzip. The file never leaves the browser.
 *
 * Geometry is derived from the NIfTI affine (sform > qform > pixdim fallback) and
 * converted RAS -> DICOM LPS, so PixelSpacing / ImageOrientationPatient /
 * ImagePositionPatient are correct and SEG overlays land in the right place. When a file
 * has no spatial header at all, we fall back to 1 mm isotropic + identity orientation and
 * flag it (the caller surfaces a warning).
 *
 * Hook point: Local/filesToStudies.js calls niftiFileToDicomFiles() on any file
 * isConvertibleNifti() recognises, before handing the result to the DICOM parser.
 */
import dcmjs from 'dcmjs';
import { ungzip } from 'pako';

const { DicomDict, DicomMetaDictionary } = dcmjs.data;

const SECONDARY_CAPTURE_SOP_CLASS = '1.2.840.10008.5.1.4.1.1.7';
const EXPLICIT_VR_LITTLE_ENDIAN = '1.2.840.10008.1.2.1';
const NIFTI_EXT = /\.nii(\.gz)?$/i;
const MAX_SLICES = 2048; // guardrail against pathological volumes (1 File per slice)

/** True for NIfTI files we can wrap into DICOM. MIME is unreliable for NIfTI
 *  ('', 'application/octet-stream', 'application/gzip'), so detect by name. */
export function isConvertibleNifti(file) {
  if (!file) {
    return false;
  }
  return NIFTI_EXT.test(file.name || '');
}

/** Read the File, gunzip if it carries the gzip magic bytes (sniffed, not by extension). */
async function readAndMaybeGunzip(file) {
  const buf = await file.arrayBuffer();
  const head = new Uint8Array(buf, 0, Math.min(2, buf.byteLength));
  if (head[0] === 0x1f && head[1] === 0x8b) {
    const inflated = ungzip(new Uint8Array(buf));
    // Return a standalone ArrayBuffer (the inflated view may span a larger buffer).
    return inflated.buffer.slice(
      inflated.byteOffset,
      inflated.byteOffset + inflated.byteLength
    );
  }
  return buf;
}

/** Parse a NIfTI-1 header (348 bytes). Detects endianness from sizeof_hdr; rejects NIfTI-2. */
function parseNiftiHeader(buffer) {
  const dv = new DataView(buffer);
  let littleEndian = true;
  if (dv.getInt32(0, true) !== 348) {
    if (dv.getInt32(0, false) === 348) {
      littleEndian = false;
    } else if (dv.getInt32(0, true) === 540 || dv.getInt32(0, false) === 540) {
      throw new Error('NIfTI-2 is not supported yet — please provide a NIfTI-1 (.nii) file.');
    } else {
      throw new Error('not a valid NIfTI-1 file (unexpected header size).');
    }
  }
  const i16 = o => dv.getInt16(o, littleEndian);
  const f32 = o => dv.getFloat32(o, littleEndian);
  const dim = [];
  for (let k = 0; k < 8; k++) dim.push(i16(40 + 2 * k));
  const pixdim = [];
  for (let k = 0; k < 8; k++) pixdim.push(f32(76 + 4 * k));
  return {
    littleEndian,
    ndim: dim[0],
    nx: dim[1] || 1,
    ny: dim[2] || 1,
    nz: Math.max(1, dim[3] || 1),
    nt: Math.max(1, dim[4] || 1),
    datatype: i16(70),
    bitpix: i16(72),
    pixdim,
    qfac: pixdim[0] < 0 ? -1 : 1,
    voxOffset: Math.max(352, Math.round(f32(108))),
    sclSlope: f32(112),
    sclInter: f32(116),
    qformCode: i16(252),
    sformCode: i16(254),
    quaternB: f32(256),
    quaternC: f32(260),
    quaternD: f32(264),
    qoffsetX: f32(268),
    qoffsetY: f32(272),
    qoffsetZ: f32(276),
    srowX: [f32(280), f32(284), f32(288), f32(292)],
    srowY: [f32(296), f32(300), f32(304), f32(308)],
    srowZ: [f32(312), f32(316), f32(320), f32(324)],
  };
}

/** Build the 4x4 voxel -> world (RAS) affine: sform > qform > pixdim fallback. */
function buildAffineRAS(h) {
  if (h.sformCode > 0) {
    return { affine: [h.srowX, h.srowY, h.srowZ, [0, 0, 0, 1]], noGeometry: false };
  }
  if (h.qformCode > 0) {
    const b = h.quaternB,
      c = h.quaternC,
      d = h.quaternD;
    const a = Math.sqrt(Math.max(0, 1 - (b * b + c * c + d * d)));
    const R = [
      [a * a + b * b - c * c - d * d, 2 * (b * c - a * d), 2 * (b * d + a * c)],
      [2 * (b * c + a * d), a * a + c * c - b * b - d * d, 2 * (c * d - a * b)],
      [2 * (b * d - a * c), 2 * (c * d + a * b), a * a + d * d - b * b - c * c],
    ];
    const dx = h.pixdim[1],
      dy = h.pixdim[2],
      dz = h.pixdim[3] * h.qfac;
    return {
      affine: [
        [R[0][0] * dx, R[0][1] * dy, R[0][2] * dz, h.qoffsetX],
        [R[1][0] * dx, R[1][1] * dy, R[1][2] * dz, h.qoffsetY],
        [R[2][0] * dx, R[2][1] * dy, R[2][2] * dz, h.qoffsetZ],
        [0, 0, 0, 1],
      ],
      noGeometry: false,
    };
  }
  const dx = h.pixdim[1] || 1,
    dy = h.pixdim[2] || 1,
    dz = h.pixdim[3] || 1;
  return {
    affine: [[dx, 0, 0, 0], [0, dy, 0, 0], [0, 0, dz, 0], [0, 0, 0, 1]],
    noGeometry: true,
  };
}

const round = (n, dp) => (Number.isFinite(n) ? Number(n.toFixed(dp)) : 0);

/**
 * RAS affine -> DICOM (LPS) geometry. NIfTI is RAS+, DICOM is LPS, so negate the X and Y
 * world components. Returns shared IOP/PixelSpacing/SliceThickness + per-slice IPP.
 * Voxel axes: i = column index (fastest), j = row index, k = slice.
 */
function geometryFromRasAffine(M) {
  const L = M.map((row, r) => (r < 2 ? row.map(v => -v) : row.slice())); // RAS -> LPS
  const ci = [L[0][0], L[1][0], L[2][0]]; // +column index (i)
  const cj = [L[0][1], L[1][1], L[2][1]]; // +row index (j)
  const ck = [L[0][2], L[1][2], L[2][2]]; // +slice (k)
  const t = [L[0][3], L[1][3], L[2][3]]; // world position of voxel (0,0,0)
  const norm = v => Math.hypot(v[0], v[1], v[2]) || 1;
  const ni = norm(ci),
    nj = norm(cj),
    nk = norm(ck);
  const iop = [
    round(ci[0] / ni, 6), round(ci[1] / ni, 6), round(ci[2] / ni, 6),
    round(cj[0] / nj, 6), round(cj[1] / nj, 6), round(cj[2] / nj, 6),
  ];
  const sliceUnit = [ck[0] / nk, ck[1] / nk, ck[2] / nk];
  return {
    iop,
    pixelSpacing: [round(nj, 6), round(ni, 6)], // DICOM PixelSpacing = [rowSpacing, colSpacing]
    sliceThickness: round(nk, 6),
    ippForSlice: k => [round(t[0] + k * ck[0], 4), round(t[1] + k * ck[1], 4), round(t[2] + k * ck[2], 4)],
    sliceLocationForSlice: k =>
      round((t[0] + k * ck[0]) * sliceUnit[0] + (t[1] + k * ck[1]) * sliceUnit[1] + (t[2] + k * ck[2]) * sliceUnit[2], 4),
  };
}

/** Read a typed array of `count` elements at `offset`, honoring endianness (fast path on LE). */
function readTyped(buffer, offset, count, Ctor, littleEndian) {
  const bytes = count * Ctor.BYTES_PER_ELEMENT;
  if (littleEndian) {
    return new Ctor(buffer.slice(offset, offset + bytes)); // copy -> aligned, native (LE) order
  }
  const dv = new DataView(buffer, offset, bytes);
  const out = new Ctor(count);
  const get = {
    Int16Array: 'getInt16',
    Uint16Array: 'getUint16',
    Int32Array: 'getInt32',
    Float32Array: 'getFloat32',
    Float64Array: 'getFloat64',
  }[Ctor.name];
  for (let i = 0; i < count; i++) out[i] = dv[get](i * Ctor.BYTES_PER_ELEMENT, false);
  return out;
}

/**
 * Decode pixel data per NIfTI datatype into a DICOM-writable typed array.
 * Native int/uint pass through (NIfTI scl -> Rescale). Float/int32 are rescaled to UINT16
 * with RescaleSlope/Intercept so true intensity (e.g. HU) is preserved.
 */
function decodePixels(buffer, h) {
  const nvox = h.nx * h.ny * h.nz; // first 3D volume only (4D clamped)
  const sclSlope = h.sclSlope && h.sclSlope !== 0 ? h.sclSlope : 1;
  const sclInter = h.sclSlope && h.sclSlope !== 0 ? h.sclInter : 0;

  switch (h.datatype) {
    case 2: // UINT8
      return {
        stored: new Uint8Array(buffer.slice(h.voxOffset, h.voxOffset + nvox)),
        bitsAllocated: 8, pixelRepresentation: 0, vr: 'OB',
        rescaleSlope: sclSlope, rescaleIntercept: sclInter,
      };
    case 4: // INT16
      return {
        stored: readTyped(buffer, h.voxOffset, nvox, Int16Array, h.littleEndian),
        bitsAllocated: 16, pixelRepresentation: 1, vr: 'OW',
        rescaleSlope: sclSlope, rescaleIntercept: sclInter,
      };
    case 512: // UINT16
      return {
        stored: readTyped(buffer, h.voxOffset, nvox, Uint16Array, h.littleEndian),
        bitsAllocated: 16, pixelRepresentation: 0, vr: 'OW',
        rescaleSlope: sclSlope, rescaleIntercept: sclInter,
      };
    case 8: // INT32
    case 16: // FLOAT32
    case 64: { // FLOAT64
      const Ctor = h.datatype === 8 ? Int32Array : h.datatype === 16 ? Float32Array : Float64Array;
      const raw = readTyped(buffer, h.voxOffset, nvox, Ctor, h.littleEndian);
      let min = Infinity, max = -Infinity;
      for (let i = 0; i < nvox; i++) {
        const v = raw[i] * sclSlope + sclInter;
        if (v < min) min = v;
        if (v > max) max = v;
      }
      if (!Number.isFinite(min) || !Number.isFinite(max)) {
        min = 0; max = 1;
      }
      const slope = max > min ? (max - min) / 65535 : 1;
      const stored = new Uint16Array(nvox);
      for (let i = 0; i < nvox; i++) {
        const v = raw[i] * sclSlope + sclInter;
        let q = Math.round((v - min) / slope);
        q = q < 0 ? 0 : q > 65535 ? 65535 : q;
        stored[i] = q;
      }
      return {
        stored, bitsAllocated: 16, pixelRepresentation: 0, vr: 'OW',
        rescaleSlope: round(slope, 8), rescaleIntercept: round(min, 6),
      };
    }
    default:
      throw new Error(`unsupported NIfTI datatype ${h.datatype} (supported: uint8, int16, uint16, int32, float32, float64).`);
  }
}

/** Build one DICOM Secondary Capture slice (grayscale MONOCHROME2) sharing the volume UIDs. */
function writeSliceDicom({
  pixelBytes, rows, columns, bitsAllocated, pixelRepresentation, pixelVR,
  studyInstanceUID, seriesInstanceUID, frameOfReferenceUID,
  instanceNumber, imagePositionPatient, imageOrientationPatient,
  pixelSpacing, sliceThickness, sliceLocation, rescaleSlope, rescaleIntercept, description,
}) {
  const sopInstanceUID = DicomMetaDictionary.uid();

  let bytes = pixelBytes;
  if (bytes.length % 2 !== 0) {
    const padded = new Uint8Array(bytes.length + 1);
    padded.set(bytes);
    bytes = padded;
  }
  const pixelBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

  const dataset = {
    SOPClassUID: SECONDARY_CAPTURE_SOP_CLASS,
    SOPInstanceUID: sopInstanceUID,
    StudyInstanceUID: studyInstanceUID,
    SeriesInstanceUID: seriesInstanceUID,
    FrameOfReferenceUID: frameOfReferenceUID,
    StudyID: '1',
    SeriesNumber: '1',
    InstanceNumber: String(instanceNumber),
    PatientName: 'ANONYMOUS',
    PatientID: 'NIFTI0001',
    // Empty type-2 attrs — present-but-empty per the standard; downstream tools that read
    // patient/study attributes directly (e.g. the highdicom SEG writer) raise if absent.
    PatientBirthDate: '',
    PatientSex: '',
    StudyDate: '',
    StudyTime: '',
    AccessionNumber: '',
    ReferringPhysicianName: '',
    Modality: 'OT', // Other — a converted volume, not an acquisition.
    ConversionType: 'WSD',
    SeriesDescription: description || 'Converted NIfTI',
    ImagePositionPatient: imagePositionPatient,
    ImageOrientationPatient: imageOrientationPatient,
    PixelSpacing: pixelSpacing,
    SliceThickness: sliceThickness,
    SliceLocation: sliceLocation,
    Rows: rows,
    Columns: columns,
    SamplesPerPixel: 1,
    PhotometricInterpretation: 'MONOCHROME2',
    BitsAllocated: bitsAllocated,
    BitsStored: bitsAllocated,
    HighBit: bitsAllocated - 1,
    PixelRepresentation: pixelRepresentation,
    RescaleSlope: rescaleSlope,
    RescaleIntercept: rescaleIntercept,
    RescaleType: 'US',
  };

  const meta = DicomMetaDictionary.denaturalizeDataset({
    TransferSyntaxUID: EXPLICIT_VR_LITTLE_ENDIAN,
    MediaStorageSOPClassUID: SECONDARY_CAPTURE_SOP_CLASS,
    MediaStorageSOPInstanceUID: sopInstanceUID,
  });
  const dicomDict = new DicomDict(meta);
  dicomDict.dict = DicomMetaDictionary.denaturalizeDataset(dataset);
  dicomDict.upsertTag('7FE00010', pixelVR, [pixelBuffer]);
  return dicomDict.write();
}

/**
 * Convert a NIfTI File into an array of DICOM-slice Files (browser only). If the volume has
 * no spatial header, `result.__noGeometryWarning` is set (a string) for the caller to surface.
 * @returns {Promise<File[]>}
 */
export async function niftiFileToDicomFiles(file) {
  const buffer = await readAndMaybeGunzip(file);
  const header = parseNiftiHeader(buffer);

  if (header.nz > MAX_SLICES) {
    throw new Error(`volume too large (${header.nz} slices > ${MAX_SLICES}).`);
  }
  const { affine, noGeometry } = buildAffineRAS(header);
  const geom = geometryFromRasAffine(affine);
  const { stored, bitsAllocated, pixelRepresentation, vr, rescaleSlope, rescaleIntercept } =
    decodePixels(buffer, header);

  const rows = header.ny; // j count
  const columns = header.nx; // i count
  const sliceVox = header.nx * header.ny;
  const bytesPerVox = stored.BYTES_PER_ELEMENT;
  const base = (file.name || 'volume').replace(/\.nii(\.gz)?$/i, '');
  const description = `${base} (NIfTI)`;

  const studyInstanceUID = DicomMetaDictionary.uid();
  const seriesInstanceUID = DicomMetaDictionary.uid();
  const frameOfReferenceUID = DicomMetaDictionary.uid();

  const files = [];
  for (let k = 0; k < header.nz; k++) {
    const pixelBytes = new Uint8Array(
      stored.buffer,
      stored.byteOffset + k * sliceVox * bytesPerVox,
      sliceVox * bytesPerVox
    );
    const arrayBuffer = writeSliceDicom({
      pixelBytes,
      rows,
      columns,
      bitsAllocated,
      pixelRepresentation,
      pixelVR: vr,
      studyInstanceUID,
      seriesInstanceUID,
      frameOfReferenceUID,
      instanceNumber: k + 1,
      imagePositionPatient: geom.ippForSlice(k),
      imageOrientationPatient: geom.iop,
      pixelSpacing: geom.pixelSpacing,
      sliceThickness: geom.sliceThickness,
      sliceLocation: geom.sliceLocationForSlice(k),
      rescaleSlope,
      rescaleIntercept,
      description,
    });
    files.push(
      new File([arrayBuffer], `${base}_${String(k + 1).padStart(4, '0')}.dcm`, {
        type: 'application/dicom',
      })
    );
  }

  if (noGeometry) {
    files.__noGeometryWarning = `${file.name}: no spatial header (sform/qform/pixdim) — assumed 1 mm isotropic, identity orientation; measurements may be approximate.`;
  }
  return files;
}
