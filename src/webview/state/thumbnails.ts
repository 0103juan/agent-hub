import { FileContextAttachment } from '../../shared/types';

const MAX_THUMBNAIL_PX = 240;

/** Miniatura liviana: el historial la conserva sin guardar la imagen completa. */
function createThumbnail(mediaUri: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, MAX_THUMBNAIL_PX / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/webp', 0.8));
    };
    image.onerror = () => resolve(undefined);
    image.src = mediaUri;
  });
}

/** La imagen completa ya está en disco: no se devuelve por el puente. */
export function withThumbnails(attachments: FileContextAttachment[]): Promise<FileContextAttachment[]> {
  return Promise.all(
    attachments.map(async (attachment) =>
      attachment.mediaType === 'image' && attachment.mediaUri
        ? { ...attachment, mediaUri: undefined, thumbnailUri: await createThumbnail(attachment.mediaUri) }
        : { ...attachment, mediaUri: undefined }
    )
  );
}
