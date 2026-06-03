import FileLoaderService from './fileLoaderService';
import { DicomMetadataStore } from '@ohif/core';
import { isConvertibleImage, imageFileToDicomFile } from './imageToDicom';

const processFile = async file => {
  try {
    // SaigaLab: OHIF only reads DICOM. Transparently wrap a dropped raster image
    // (PNG/JPEG/…) into a DICOM Secondary Capture in-browser so it loads like any
    // study. The image never leaves the browser. See ./imageToDicom.js.
    if (isConvertibleImage(file)) {
      file = await imageFileToDicomFile(file);
    }

    const fileLoaderService = new FileLoaderService(file);
    const imageId = fileLoaderService.addFile(file);
    const image = await fileLoaderService.loadFile(file, imageId);
    const dicomJSONDataset = await fileLoaderService.getDataset(image, imageId);

    DicomMetadataStore.addInstance(dicomJSONDataset);
  } catch (error) {
    console.log(error.name, ':Error when trying to load and process local files:', error.message);
  }
};

export default async function filesToStudies(files) {
  const processFilesPromises = files.map(processFile);
  await Promise.all(processFilesPromises);

  return DicomMetadataStore.getStudyInstanceUIDs();
}
