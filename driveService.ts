
import { DriveFolder, DriveFile, FileType, DriveItem } from './types';

export function extractFolderId(input: string): string {
  if (!input || input === 'demo') return input;
  const clean = input.trim();
  const folderMatch = clean.match(/\/folders\/([a-zA-Z0-9_-]{15,})/);
  if (folderMatch) return folderMatch[1];
  const idMatch = clean.match(/[?&]id=([a-zA-Z0-9_-]{15,})/);
  if (idMatch) return idMatch[1];
  return clean;
}

const baseUrl = "https://www.googleapis.com/drive/v3/files";

export async function fetchFolderContent(folderId: string): Promise<DriveItem[]> {
  const cleanId = extractFolderId(folderId);
  if (!cleanId || cleanId === 'demo') return [];

  // API_KEY внедряется Vite на этапе сборки из GitHub Secrets
  const apiKey = (process.env.API_KEY || "").toString().trim();
  
  if (!apiKey) {
    throw new Error('Системная ошибка: API_KEY не найден в конфигурации сборки.');
  }

  const q = encodeURIComponent(`'${cleanId}' in parents and trashed=false`);
  const fields = encodeURIComponent("files(id,name,mimeType,size)");
  const url = `${baseUrl}?q=${q}&fields=${fields}&key=${apiKey}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    if (response.status === 403) throw new Error('Доступ запрещен. Убедитесь, что папка открыта по ссылке.');
    if (response.status === 404) throw new Error('Папка не найдена. Проверьте FOLDER_ID.');
    throw new Error(`Ошибка Drive API: ${response.status}`);
  }

  const data = await response.json();
  return processFiles(data.files || [], apiKey);
}

async function processFiles(files: any[], apiKey: string): Promise<DriveItem[]> {
  const items: DriveItem[] = await Promise.all(
    files.map(async (file: any) => {
      const isFolderType = file.mimeType === 'application/vnd.google-apps.folder';
      const isGoogleDoc = file.mimeType === 'application/vnd.google-apps.document';
      
      if (isFolderType) {
        return { id: file.id, name: file.name, items: [] } as DriveFolder;
      } else {
        let type = FileType.DOC;
        let downloadUrl = `${baseUrl}/${file.id}?alt=media&key=${apiKey}`;
        
        // Google Docs: вытаскиваем текст, чтобы показывать прямо в приложении
        if (isGoogleDoc) {
          downloadUrl = `${baseUrl}/${file.id}/export?mimeType=text/plain&key=${apiKey}`;
          type = FileType.TEXT;
        } else if (file.mimeType.includes('pdf')) {
          type = FileType.PDF;
        } else if (file.mimeType.includes('image')) {
          type = FileType.IMAGE;
        } else if (file.mimeType.includes('video')) {
          type = FileType.VIDEO;
        } else if (file.mimeType.includes('text')) {
          type = FileType.TEXT;
        }

        const driveItem: DriveFile = { id: file.id, name: file.name, type, url: downloadUrl };

        // Если это текстовый файл, скачиваем его содержимое сразу для отображения в "чате"
        if (type === FileType.TEXT) {
          try {
            const res = await fetch(downloadUrl);
            if (res.ok) driveItem.content = await res.text();
          } catch (e) {}
        }
        return driveItem;
      }
    })
  );

  return items
    // Скрытые файлы/папки: всё, что начинается с "_", не возвращаем вообще
    .filter(item => !String(item.name || '').trim().startsWith('_'))
    .sort((a, b) => {
    const aFol = 'items' in a;
    const bFol = 'items' in b;
    if (aFol && !bFol) return -1;
    if (!aFol && bFol) return 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  });
}
