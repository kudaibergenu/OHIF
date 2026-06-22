import FileLoaderService from './fileLoaderService';
import { DicomMetadataStore } from '@ohif/core';
import { isConvertibleImage, imageFileToDicomFile } from './imageToDicom';
import { isConvertibleNifti, niftiFileToDicomFiles } from './niftiToDicom';

/** Load one already-DICOM File into the metadata store (the original local-upload flow). */
const addDicomFile = async file => {
  const fileLoaderService = new FileLoaderService(file);
  const imageId = fileLoaderService.addFile(file);
  const image = await fileLoaderService.loadFile(file, imageId);
  const dicomJSONDataset = await fileLoaderService.getDataset(image, imageId);
  DicomMetadataStore.addInstance(dicomJSONDataset);
};

const processFile = async (file, warnings) => {
  try {
    // SaigaLab: OHIF only reads DICOM. Transparently convert dropped non-DICOM files
    // in-browser (the data never leaves the browser):
    //   NIfTI (.nii/.nii.gz) -> N DICOM slices in one Study/Series. See ./niftiToDicom.js.
    //   PNG/JPEG/BMP/WebP    -> a DICOM Secondary Capture.         See ./imageToDicom.js.
    if (isConvertibleNifti(file)) {
      const dicomFiles = await niftiFileToDicomFiles(file); // File[]
      if (dicomFiles.__noGeometryWarning) {
        warnings.push(dicomFiles.__noGeometryWarning);
      }
      // Sequential, not Promise.all, so each slice's dicomfile:N imageId index stays ordered.
      for (const dicomFile of dicomFiles) {
        await addDicomFile(dicomFile);
      }
      return;
    }

    if (isConvertibleImage(file)) {
      file = await imageFileToDicomFile(file);
    }
    await addDicomFile(file);
  } catch (error) {
    console.log(error.name, ':Error when trying to load and process local files:', error.message);
    warnings.push(`Could not load ${file.name}: ${error.message}`);
  }
};

export default async function filesToStudies(files) {
  const warnings = [];
  await Promise.all(files.map(file => processFile(file, warnings)));

  return { studyUIDs: DicomMetadataStore.getStudyInstanceUIDs(), warnings };
}
