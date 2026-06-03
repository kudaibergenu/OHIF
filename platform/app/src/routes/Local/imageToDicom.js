/**
 * SaigaLab addition — transparently wrap raster images (PNG/JPEG/BMP/WebP) into a
 * DICOM Secondary Capture *in the browser*, so OHIF's DICOM-only local loader can
 * display them. The image never leaves the browser (no server round-trip), which
 * keeps the data-minimization guarantee.
 *
 * Mirrors scripts/img2dcm.py, but client-side and reusing dcmjs (already an OHIF
 * dependency) as the DICOM writer — no new bundle weight.
 *
 * Hook point: Local/filesToStudies.js calls imageFileToDicomFile() on any file
 * isConvertibleImage() recognises, before handing it to the DICOM parser.
 */
import dcmjs from 'dcmjs';

const { DicomDict, DicomMetaDictionary } = dcmjs.data;

const SECONDARY_CAPTURE_SOP_CLASS = '1.2.840.10008.5.1.4.1.1.7';
const EXPLICIT_VR_LITTLE_ENDIAN = '1.2.840.10008.1.2.1';

const IMAGE_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/bmp',
  'image/webp',
]);
const IMAGE_EXT = /\.(png|jpe?g|bmp|webp)$/i;

/** True for raster images we can wrap into DICOM. DICOM files (type '' / .dcm)
 *  and PDFs are deliberately excluded so the existing loaders still handle them. */
export function isConvertibleImage(file) {
  if (!file) {
    return false;
  }
  const type = file.type || '';
  if (IMAGE_MIME.has(type.toLowerCase())) {
    return true;
  }
  // Some browsers report '' for images dragged from disk — fall back to the name.
  return !type && IMAGE_EXT.test(file.name || '');
}

/**
 * Build an uncompressed (Explicit VR Little Endian) DICOM Secondary Capture from
 * raw 8-bit pixels. Pure + framework-free so it can be unit-tested in Node.
 * @returns {ArrayBuffer}
 */
export function writeSecondaryCaptureDicom({
  pixels, // Uint8Array, length = rows*columns*samplesPerPixel
  rows,
  columns,
  samplesPerPixel = 3,
  photometricInterpretation = 'RGB',
  description = '',
}) {
  const sopInstanceUID = DicomMetaDictionary.uid();

  // DICOM values must be even length; pad the pixel data with a trailing 0 byte.
  let pixelBytes = pixels;
  if (pixelBytes.length % 2 !== 0) {
    const padded = new Uint8Array(pixelBytes.length + 1);
    padded.set(pixelBytes);
    pixelBytes = padded;
  }
  // Copy into a standalone ArrayBuffer (avoid passing a view over a larger buffer).
  const pixelBuffer = pixelBytes.buffer.slice(
    pixelBytes.byteOffset,
    pixelBytes.byteOffset + pixelBytes.byteLength
  );

  const dataset = {
    SOPClassUID: SECONDARY_CAPTURE_SOP_CLASS,
    SOPInstanceUID: sopInstanceUID,
    StudyInstanceUID: DicomMetaDictionary.uid(),
    SeriesInstanceUID: DicomMetaDictionary.uid(),
    StudyID: '1',
    SeriesNumber: '1',
    InstanceNumber: '1',
    PatientName: 'ANONYMOUS',
    PatientID: 'SC000001',
    Modality: 'OT', // Other — a captured raster, not an acquisition.
    ConversionType: 'WSD', // Workstation (SC required attribute).
    SeriesDescription: description || 'Converted image',
    Rows: rows,
    Columns: columns,
    SamplesPerPixel: samplesPerPixel,
    PhotometricInterpretation: photometricInterpretation,
    BitsAllocated: 8,
    BitsStored: 8,
    HighBit: 7,
    PixelRepresentation: 0, // unsigned
  };
  if (samplesPerPixel === 3) {
    dataset.PlanarConfiguration = 0; // interleaved RGB
  }

  const meta = DicomMetaDictionary.denaturalizeDataset({
    TransferSyntaxUID: EXPLICIT_VR_LITTLE_ENDIAN,
    MediaStorageSOPClassUID: SECONDARY_CAPTURE_SOP_CLASS,
    MediaStorageSOPInstanceUID: sopInstanceUID,
  });

  const dicomDict = new DicomDict(meta);
  dicomDict.dict = DicomMetaDictionary.denaturalizeDataset(dataset);
  // Set PixelData explicitly as OB (correct VR for 8-bit native pixel data).
  dicomDict.upsertTag('7FE00010', 'OB', [pixelBuffer]);

  return dicomDict.write(); // ArrayBuffer with 128-byte preamble + 'DICM' + meta.
}

/** Decode a raster image File on a canvas → RGB bytes (browser only). */
async function decodeImageToRgb(file) {
  const bitmap = await createImageBitmap(file);
  const width = bitmap.width;
  const height = bitmap.height;

  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement('canvas'), { width, height });
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  if (typeof bitmap.close === 'function') {
    bitmap.close();
  }

  const rgba = ctx.getImageData(0, 0, width, height).data; // Uint8ClampedArray RGBA
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4) {
    rgb[j++] = rgba[i];
    rgb[j++] = rgba[i + 1];
    rgb[j++] = rgba[i + 2];
    // alpha (rgba[i + 3]) dropped — flattened onto the canvas already.
  }
  return { rgb, width, height };
}

/**
 * Convert a raster-image File into a DICOM Secondary Capture File (browser only).
 * @returns {Promise<File>} a `.dcm` File with type 'application/dicom'.
 */
export async function imageFileToDicomFile(file) {
  const { rgb, width, height } = await decodeImageToRgb(file);
  const arrayBuffer = writeSecondaryCaptureDicom({
    pixels: rgb,
    rows: height,
    columns: width,
    samplesPerPixel: 3,
    photometricInterpretation: 'RGB',
    description: file.name || 'Converted image',
  });
  const baseName = (file.name || 'image').replace(/\.[^.]+$/, '');
  return new File([arrayBuffer], `${baseName}.dcm`, { type: 'application/dicom' });
}
