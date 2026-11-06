import * as fs from 'fs';
import * as path from 'path';
import { FileContextAttachment, MediaType } from '../shared/types';

const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'];
const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'avi', 'mkv'];
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp'];
/** La vista previa viaja en base64 por el puente de la webview. */
const MAX_PREVIEW_BYTES = 8 * 1024 * 1024;
const MAX_INLINE_TEXT_BYTES = 512 * 1024;

function mediaTypeOf(extension: string): MediaType | undefined {
  if (IMAGE_EXTENSIONS.includes(extension)) return 'image';
  if (AUDIO_EXTENSIONS.includes(extension)) return 'audio';
  if (VIDEO_EXTENSIONS.includes(extension)) return 'video';
  return undefined;
}

function mimeTypeOf(mediaType: MediaType, extension: string): string {
  if (extension === 'svg') return 'image/svg+xml';
  return `${mediaType}/${extension === 'jpg' ? 'jpeg' : extension}`;
}

/**
 * Multimedia y binarios viajan por ruta para que el agente los abra con sus
 * herramientas; el texto pequeño va dentro del prompt.
 */
export async function readAttachment(fsPath: string, displayName = path.basename(fsPath)): Promise<FileContextAttachment> {
  const extension = path.extname(fsPath).slice(1).toLowerCase();
  const { size } = await fs.promises.stat(fsPath);
  const base = { file: displayName, fsPath, sizeFormatted: `${(size / (1024 * 1024)).toFixed(1)} MB`, content: '' };

  const mediaType = mediaTypeOf(extension);
  if (mediaType) {
    const mediaUri = size < MAX_PREVIEW_BYTES
      ? `data:${mimeTypeOf(mediaType, extension)};base64,${(await fs.promises.readFile(fsPath)).toString('base64')}`
      : undefined;
    return { ...base, mediaType, mediaUri };
  }

  if (size <= MAX_INLINE_TEXT_BYTES) {
    const bytes = await fs.promises.readFile(fsPath);
    if (!bytes.includes(0)) return { ...base, language: extension, content: bytes.toString('utf8') };
  }
  return { ...base, mediaType: 'file' };
}
