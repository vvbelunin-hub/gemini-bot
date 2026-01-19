
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { DriveFile, DriveItem, isFolder, FileType } from './types';
import { fetchFolderContent } from './driveService';
import { DRIVE_DATA } from './mockData';

const FileIcon: React.FC<{ type: FileType | 'FOLDER' }> = ({ type }) => {
  switch (type) {
    case 'FOLDER': return <div className="text-3xl pointer-events-none">📂</div>;
    case FileType.PDF: return <div className="text-3xl pointer-events-none">📕</div>;
    case FileType.IMAGE: return <div className="text-3xl pointer-events-none">🖼️</div>;
    case FileType.VIDEO: return <div className="text-3xl pointer-events-none">🎬</div>;
    case FileType.TEXT: return <div className="text-3xl pointer-events-none">📄</div>;
    default: return <div className="text-3xl pointer-events-none">📎</div>;
  }
};

export default function App() {
  const tg = (window as any).Telegram?.WebApp;
  const isModern = (tg?.version ? parseFloat(tg.version) : 6.0) >= 6.1;

  // Центральный ID папки — зашит при билде
  const rootFolderId = useMemo(() => (process.env.FOLDER_ID || 'demo'), []);
  
  const [navigationStack, setNavigationStack] = useState<DriveItem[]>([]);
  const [currentItems, setCurrentItems] = useState<DriveItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<DriveFile | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [copyStatus, setCopyStatus] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const demoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerHaptic = useCallback((type: 'light' | 'success' = 'light') => {
    if (isModern && tg?.HapticFeedback) {
      try {
        if (type === 'light') tg.HapticFeedback.impactOccurred('light');
        else tg.HapticFeedback.notificationOccurred('success');
      } catch (e) {}
    }
  }, [isModern, tg]);

  useEffect(() => {
    if (tg) {
      tg.ready();
      tg.expand();
      if (tg.setHeaderColor) tg.setHeaderColor('secondary_bg_color');
    }
  }, [tg]);

  const activeFolderId = useMemo(() => {
    if (navigationStack.length === 0) return rootFolderId;
    return navigationStack[navigationStack.length - 1].id;
  }, [navigationStack, rootFolderId]);

  const loadFolder = useCallback(async (id: string, parentItems?: DriveItem[]) => {
    if (!id) return;
    
    // Очищаем предыдущий таймер, если он существует
    if (demoTimeoutRef.current) {
      clearTimeout(demoTimeoutRef.current);
      demoTimeoutRef.current = null;
    }
    
    setLoading(true);
    setError(null);
    
    if (id === 'demo') {
      demoTimeoutRef.current = setTimeout(() => {
        let items = parentItems || DRIVE_DATA.items;
        setCurrentItems([...items]);
        setLoading(false);
        demoTimeoutRef.current = null;
      }, 300);
      return;
    }

    try {
      const items = await fetchFolderContent(id);
      setCurrentItems(items);
    } catch (err: any) {
      setError(err.message || "Ошибка загрузки базы знаний.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Очистка таймера при размонтировании
  useEffect(() => {
    return () => {
      if (demoTimeoutRef.current) {
        clearTimeout(demoTimeoutRef.current);
      }
    };
  }, []);

  const handleBack = useCallback(() => {
    if (selectedFile) {
      setSelectedFile(null);
    } else {
      setNavigationStack(prev => {
        if (prev.length > 0) return prev.slice(0, -1);
        return prev;
      });
    }
    triggerHaptic('light');
  }, [selectedFile, triggerHaptic]);

  useEffect(() => {
    if (isModern && tg?.BackButton) {
      const isVisible = navigationStack.length > 0 || !!selectedFile;
      if (isVisible) {
        tg.BackButton.show();
        tg.BackButton.onClick(handleBack);
      } else {
        tg.BackButton.hide();
      }
      return () => { try { tg.BackButton.offClick(handleBack); } catch(e) {} };
    }
  }, [navigationStack.length, selectedFile, handleBack, isModern, tg]);

  useEffect(() => {
    if (activeFolderId === 'demo') {
      const lastFolder = navigationStack.length > 0 ? navigationStack[navigationStack.length - 1] : null;
      if (lastFolder && isFolder(lastFolder)) {
        loadFolder(activeFolderId, lastFolder.items);
      } else {
        loadFolder(activeFolderId);
      }
    } else {
      loadFolder(activeFolderId);
    }
  }, [activeFolderId, navigationStack, loadFolder]);

  const handleDownload = async (file: DriveFile) => {
    if (downloading || !file.url) return;
    setDownloading(true);
    triggerHaptic('light');
    try {
      const response = await fetch(file.url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      triggerHaptic('success');
    } catch (e) {
      // Fallback: открываем файл в новом окне
      window.open(file.url, '_blank');
    } finally {
      setDownloading(false);
    }
  };

  const cleanName = (name: string): string =>
    name
      // Убираем числовой префикс сортировки: 01_, 01_02_, 10_02_03_ и т.п.
      .replace(/^\d+(?:_\d+)*_?/, '')
      // Нижние подчеркивания превращаем в пробелы
      .replace(/_/g, ' ')
      .trim();

  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return currentItems
      // Скрытые файлы/папки: всё, что начинается с "_", не показываем
      .filter(item => !String(item.name || '').trim().startsWith('_'))
      .filter(item => item.name.toLowerCase().includes(q));
  }, [currentItems, searchQuery]);

  return (
    <div className="flex flex-col h-full bg-[var(--tg-theme-bg-color)] overflow-hidden">
      <header className="bg-[var(--tg-theme-secondary-bg-color)] px-4 py-3 flex items-center justify-between border-b border-black/5 z-50 shadow-sm min-h-[56px]">
        <div className="flex items-center flex-1 min-w-0">
          {(!isModern && (navigationStack.length > 0 || !!selectedFile)) && (
            <button type="button" onClick={handleBack} className="mr-3 p-2 -ml-2 text-[var(--tg-theme-link-color)]">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <h1 className="font-bold text-[17px] truncate text-[var(--tg-theme-text-color)] select-none">
            {selectedFile ? cleanName(selectedFile.name) : 
             navigationStack.length > 0 ? cleanName(navigationStack[navigationStack.length - 1].name) : 
             "База знаний"}
          </h1>
        </div>
        
        {!selectedFile && (
          <button type="button" onClick={() => setIsSearchActive(!isSearchActive)} className="p-2 text-[var(--tg-theme-hint-color)] active-scale">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
        )}
      </header>

      {isSearchActive && !selectedFile && (
        <div className="bg-[var(--tg-theme-secondary-bg-color)] p-3 border-b border-black/5 animate-slide-up">
          <input 
            autoFocus
            type="text"
            placeholder="Поиск регламента..."
            className="w-full bg-[var(--tg-theme-bg-color)] rounded-xl py-2.5 px-4 outline-none text-sm text-[var(--tg-theme-text-color)]"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      )}

      <main className="flex-1 overflow-y-auto no-scrollbar relative z-10">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full opacity-30">
            <div className="w-8 h-8 border-2 border-[var(--tg-theme-link-color)] border-t-transparent rounded-full animate-spin mb-3"></div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--tg-theme-text-color)]">Синхронизация...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center h-full flex flex-col items-center justify-center animate-slide-up">
            <div className="text-5xl mb-6">📡</div>
            <h3 className="font-bold text-[var(--tg-theme-text-color)] mb-2">Ошибка</h3>
            <p className="text-[12px] opacity-60 mb-8 max-w-[240px] text-[var(--tg-theme-text-color)]">{error}</p>
            <button onClick={() => window.location.reload()} className="bg-[var(--tg-theme-button-color)] text-[var(--tg-theme-button-text-color)] px-10 py-4 rounded-2xl font-bold text-xs uppercase active-scale shadow-lg">Повторить</button>
          </div>
        ) : selectedFile ? (
          <div className={`p-4 animate-slide-up min-h-full flex flex-col ${selectedFile.type === FileType.TEXT ? 'bg-[#537ba3]' : ''}`}>
            {selectedFile.type === FileType.TEXT ? (
              <div className="flex-1 flex flex-col">
                <div className="flex-1 py-4">
                  <div className="max-w-[92%] bg-white text-black rounded-2xl rounded-tl-none px-4 py-3 shadow-xl relative mb-12">
                    <div className="text-[15px] whitespace-pre-wrap leading-relaxed">{String(selectedFile.content || "Пусто.")}</div>
                    <div className="text-[9px] text-gray-400 text-right mt-2 font-medium opacity-80 uppercase">✓✓ {new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
                  </div>
                </div>
                <div className="sticky bottom-6 pb-2">
                  <button type="button" onClick={() => { navigator.clipboard.writeText(String(selectedFile.content)).then(() => { triggerHaptic('success'); setCopyStatus(true); setTimeout(() => setCopyStatus(false), 2000); }); }} className={`w-full py-4 rounded-2xl font-bold shadow-2xl active-scale uppercase text-xs tracking-widest transition-all ${copyStatus ? 'bg-green-600 text-white' : 'bg-[var(--tg-theme-button-color)] text-[var(--tg-theme-button-text-color)]'}`}>
                    {copyStatus ? 'Скопировано' : 'Копировать скрипт'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4 animate-slide-up">
                <div className="bg-[var(--tg-theme-secondary-bg-color)] rounded-3xl overflow-hidden shadow-xl border border-black/5">
                  <div className="p-4 bg-black/5 flex items-center gap-3">
                    <FileIcon type={selectedFile.type} />
                    <div className="min-w-0">
                      <h2 className="font-bold text-sm truncate text-[var(--tg-theme-text-color)]">{cleanName(selectedFile.name)}</h2>
                      <p className="text-[9px] opacity-40 font-bold uppercase text-[var(--tg-theme-text-color)]">{selectedFile.type}</p>
                    </div>
                  </div>
                  <div className="min-h-[260px] flex items-center justify-center bg-[#1a1a1a]">
                    {selectedFile.type === FileType.VIDEO ? (
                      <video className="w-full max-h-[60vh]" controls playsInline src={selectedFile.url} />
                    ) : selectedFile.type === FileType.IMAGE ? (
                      <img src={selectedFile.url} className="max-w-full max-h-[60vh] object-contain" alt="Preview" />
                    ) : selectedFile.type === FileType.PDF ? (
                      <iframe
                        title={selectedFile.name}
                        className="w-full h-[60vh] bg-white"
                        // Для публичных PDF в Drive это самый стабильный предпросмотр в WebView
                        src={`https://drive.google.com/file/d/${encodeURIComponent(String(selectedFile.id))}/preview`}
                        allow="autoplay"
                      />
                    ) : (
                      <div className="py-20 flex flex-col items-center">
                        <FileIcon type={selectedFile.type} />
                        <p className="mt-4 text-white/50 text-[10px] font-bold uppercase tracking-widest">Нет предпросмотра</p>
                      </div>
                    )}
                  </div>
                  <div className="p-6 space-y-3">
                    <button type="button" disabled={downloading} onClick={() => handleDownload(selectedFile)} className="w-full bg-[var(--tg-theme-button-color)] text-[var(--tg-theme-button-text-color)] py-4 rounded-2xl font-bold shadow-md active-scale uppercase text-xs tracking-widest flex items-center justify-center gap-2 disabled:opacity-50">
                      {downloading ? 'Загрузка...' : 'Скачать на телефон'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-[var(--tg-theme-secondary-bg-color)] min-h-full divide-y divide-black/[0.04]">
            {filteredItems.length > 0 ? filteredItems.map((item) => (
              <button key={String(item.id)} type="button" onClick={() => isFolder(item) ? setNavigationStack(prev => [...prev, item]) : setSelectedFile(item)} className="w-full flex items-center p-4 active:bg-black/[0.03] text-left">
                <div className="mr-4 opacity-80 pointer-events-none"><FileIcon type={isFolder(item) ? 'FOLDER' : (item as DriveFile).type} /></div>
                <div className="flex-1 min-w-0 pointer-events-none">
                  <div className="font-bold text-[16px] truncate text-[var(--tg-theme-text-color)]">{cleanName(item.name)}</div>
                  <div className="text-[10px] opacity-40 font-bold uppercase tracking-[0.1em] mt-0.5 text-[var(--tg-theme-text-color)]">{isFolder(item) ? 'Раздел' : (item as DriveFile).type}</div>
                </div>
                <div className="ml-2 text-black/10 pointer-events-none">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              </button>
            )) : <div className="py-20 text-center opacity-20"><p className="font-bold uppercase tracking-widest text-sm text-[var(--tg-theme-text-color)]">Пусто</p></div>}
          </div>
        )}
      </main>
    </div>
  );
}
