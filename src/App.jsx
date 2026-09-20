import { useState, useCallback, useRef, useEffect } from 'react';
import { FileText, Trash2, LayoutGrid, Columns, ChevronLeft, ChevronRight, AlertTriangle, Loader, ZoomIn, ZoomOut, RotateCcw, RotateCw } from 'lucide-react';
import DropZone from './components/DropZone';
import PageGrid from './components/PageGrid';
import OverlaySettings from './components/OverlaySettings';
import OverlayPreviewLayer from './components/OverlayPreviewLayer';
import ActionPanel from './components/ActionPanel';
import ThemeToggle from './components/ThemeToggle';
import { splitPdfPages, imageToPdfPage, mergePagesWithOverlay, createBlobUrl, sharePdf, isShareSupported } from './utils/pdfHelpers';
import { readFileAsArrayBuffer, validateFile } from './utils/fileHelpers';
import { renderThumbnail, renderThumbnails } from './utils/thumbnailRenderer';
import ThumbnailProgressOverlay from './components/ThumbnailProgressOverlay';
import './App.css';

const DEFAULT_OVERLAY = {
  text: '',
  enabledModes: [],
  position: 'middle-center',
  fontSize: 60,
  opacity: 0.4,
  rotation: 45,
  color: { r: 0.5, g: 0.5, b: 0.5 },
  border: false,
  fontFamily: 'malgun', // Default font
  headerText: '',
  footerText: '',
  stampText: '',
  stampPosition: 'bottom-right',
  stampFontSize: 30,
  stampOpacity: 0.4,
  stampRotation: 0,
  stampColor: { r: 0.5, g: 0.5, b: 0.5 },
  stampBorder: false,
  headfootFontSize: 10,
  headfootColor: { r: 0.5, g: 0.5, b: 0.5 },
  headfootAlign: 'center',
  // 텍스트 스타일
  textStyle: { bold: false, italic: false, underline: false },
  // 이미지 오버레이
  imageDataUrl: null,
  imageOpacity: 1.0,
  imageScale: 0.2,
  imageRotation: 0,
  imagePosition: 'middle-center',
};

const RotateLeftIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 19v-7a4 4 0 0 0-4-4H5" />
    <path d="M9 12L5 8l4-4" />
  </svg>
);

const RotateRightIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 19v-7a4 4 0 0 1 4-4h9" />
    <path d="M15 12l4-4-4-4" />
  </svg>
);

export default function App() {
  // 상태 관리 (Global)
  const [pages, setPages] = useState([]);
  const [thumbnails, setThumbnails] = useState(new Map());
  const [overlay, setOverlay] = useState(DEFAULT_OVERLAY); // Global Settings (Watermark, Stamp)
  
  // Page-Specific Overlays (Text, Image)
  // Map<pageId, OverlayObject>
  const [pageOverlays, setPageOverlays] = useState({});

  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isActionPanelVisible, setIsActionPanelVisible] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState(null);
  const [generatedBytes, setGeneratedBytes] = useState(null);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [loadingProgress, setLoadingProgress] = useState(0); // 0 ~ 100
  const [error, setError] = useState(null);

  // 변경 감지: 마지막으로 생성했을 때의 오버레이 상태 저장 (Global + Local checksum?)
  const [lastGeneratedConfig, setLastGeneratedConfig] = useState(null);
  // Compare current state (global + local) with last generated
  const currentConfigSignature = JSON.stringify({ global: overlay, local: pageOverlays });
  const hasChanges = lastGeneratedConfig && currentConfigSignature !== lastGeneratedConfig;

  // 뷰 모드: 'preview' (A모드) | 'grid' (B모드)
  const [viewMode, setViewMode] = useState('preview');
  const [selectedPageId, setSelectedPageId] = useState(null);
  const [multiSelectedIds, setMultiSelectedIds] = useState(new Set());
  // Shift+방향키로 범위를 확장할 때 사용하는 선택 시작점
  const selectionAnchorIdRef = useRef(null);
  const [deleteTargetIds, setDeleteTargetIds] = useState([]); 
  const [dividers, setDividers] = useState(new Set()); 
  const [previewImage, setPreviewImage] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewZoom, setPreviewZoom] = useState(1.0);
  const [baseScale, setBaseScale] = useState(1.0);
  const [renderedProps, setRenderedProps] = useState(null);

  const blobUrlRef = useRef(null);
  const previewContainerRef = useRef(null);

  // Helper to get local overlay for a page (or default)
  const getLocalOverlay = useCallback((pageId) => {
    return pageOverlays[pageId] || {
       text: '',
       textStyle: { bold: false, italic: false, underline: false },
       fontFamily: 'malgun',
       fontSize: 60,
       opacity: 1,
       color: { r: 0, g: 0, b: 0 },
       position: 'middle-center',
       customX: null, customY: null,
       rotation: 0,
       
       imageDataUrl: null,
       imageOpacity: 1.0,
       imageScale: 0.2,
       imageRotation: 0,
       imageCustomX: null, imageCustomY: null,
       imagePosition: 'middle-center',
    };
  }, [pageOverlays]);

  // Global Overlay Change Handler (Merges updates)
  const handleGlobalOverlayChange = useCallback((updates) => {
    setOverlay((prev) => ({ ...prev, ...updates }));
  }, []);

  const handleLocalOverlayChange = useCallback((updates) => {
    if (!selectedPageId) return;
    setPageOverlays(prev => ({
      ...prev,
      [selectedPageId]: { 
        ...getLocalOverlay(selectedPageId), 
        ...updates 
      }
    }));
  }, [selectedPageId, getLocalOverlay]);

  // Blob URL 정리
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
    };
  }, []);

  // ... (useEffect hooks for initial page selection, preview rendering - no changes)
  // 첫 페이지 선택
  useEffect(() => {
    if (pages.length > 0 && !selectedPageId) {
      setSelectedPageId(pages[0].id);
      setMultiSelectedIds(new Set([pages[0].id]));
      selectionAnchorIdRef.current = pages[0].id;
    }
    if (pages.length === 0) {
      setSelectedPageId(null);
      setMultiSelectedIds(new Set());
      selectionAnchorIdRef.current = null;
    }
  }, [pages, selectedPageId]);

  // 선택 페이지 변경 시 고해상도 프리뷰 렌더링
  useEffect(() => {
    if (!selectedPageId || viewMode !== 'preview') {
      setPreviewImage(null);
      setPreviewZoom(1.0);
      return;
    }
    const page = pages.find((p) => p.id === selectedPageId);
    if (!page) return;

    // Scale calculation using ResizeObserver
    const calculateScale = () => {
      if (!previewContainerRef.current) return;
      const containerRect = previewContainerRef.current.getBoundingClientRect();
      const containerW = containerRect.width;
      const containerH = containerRect.height;
      
      const isRotated = page.rotation === 90 || page.rotation === 270;
      const pw = isRotated ? page.height : page.width;
      const ph = isRotated ? page.width : page.height;

      const targetW = containerW * 0.9;
      const targetH = containerH * 0.9;
      const scaleX = targetW / pw;
      const scaleY = targetH / ph;
      
      const scale = Math.min(scaleX, scaleY);
      setBaseScale(scale);
    };

    calculateScale();
    const resizeObserver = new ResizeObserver(() => calculateScale());
    if (previewContainerRef.current) {
        resizeObserver.observe(previewContainerRef.current);
    }

    let cancelled = false;
    setPreviewLoading(true);
    renderThumbnail(page.pageBytes, 2.0, page.rotation || 0).then((dataUrl) => {
      if (!cancelled && dataUrl) {
        setPreviewImage(dataUrl);
        setRenderedProps({ id: page.id, width: page.width, height: page.height, rotation: page.rotation || 0 });
      }
      setPreviewLoading(false);
    });

    return () => { 
        cancelled = true; 
        resizeObserver.disconnect();
    };
  }, [selectedPageId, viewMode, pages]);

  // ... (handleFiles, generateThumbnails, handleReorder, delete handlers - KEEP AS IS)
  /**
   * 파일 업로드 처리
   */
  const handleFiles = useCallback(async (files) => {
    setIsLoading(true);
    setLoadingProgress(0);
    setError(null);
    setLoadingMessage('파일을 분석하고 있습니다...');

    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    setGeneratedUrl(null);
    setGeneratedBytes(null);

    try {
      console.log('Starting file processing...', files);
      const newPages = [];
      const unsupportedFiles = [];
      
      // Calculate total files for weight distribution
      const totalPdfFiles = Array.from(files).filter(f => validateFile(f).type === 'pdf').length;
      let pdfFileIndex = 0;
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const { valid, type, mimeType } = validateFile(file);
        if (!valid) {
          unsupportedFiles.push(file.name);
          continue;
        }

        setLoadingMessage(`처리 중: ${file.name}`);
        const buffer = await readFileAsArrayBuffer(file);

        if (type === 'pdf') {
          // Splitting takes 0-50% of the total progress. 
          // If multiple PDFs, distribute the 50% among them.
          const baseProgress = pdfFileIndex * (50 / totalPdfFiles || 50);
          const pdfPages = await splitPdfPages(buffer, file.name, (current, total) => {
             const fileProgressPercent = (current / total) * (50 / totalPdfFiles || 50);
             setLoadingProgress(baseProgress + fileProgressPercent);
          });
          newPages.push(...pdfPages);
          pdfFileIndex++;
        } else if (type === 'image') {
          const imgPage = await imageToPdfPage(buffer, file.name, mimeType);
          newPages.push(imgPage);
        }
      }

      if (unsupportedFiles.length > 0) {
        setError(`지원하지 않는 파일 형식: ${unsupportedFiles.join(', ')}\n(PDF, JPG, PNG만 지원합니다)`);
      }

      if (newPages.length > 0) {
        setLoadingMessage('썸네일을 추출하고 있습니다...');
        // Non-blocking thumbnail generation (50-100% of progress)
        setIsLoading(false); // Let user see the UI and donut chart
        generateThumbnails(newPages, (current, total) => {
           const nextProg = 50 + (current / total) * 50;
           setLoadingProgress(nextProg);
           if (current === total) {
              setTimeout(() => setLoadingProgress(0), 300);
           }
        });
      }

      setPages((prev) => {
        const combined = [...prev, ...newPages];
        return combined;
      });
    } catch (err) {
      console.error('파일 처리 오류:', err);
      setError(`파일 처리 중 오류가 발생했습니다: ${err.message}`);
    } finally {
      if (loadingProgress < 50) { 
          // If we failed before thumbnails started
          setIsLoading(false);
          setLoadingMessage('');
          setLoadingProgress(0);
      }
    }
  }, []);

  const generateThumbnails = useCallback(async (newPages, progressCallback) => {
    try {
      const thumbMap = await renderThumbnails(newPages, 0.5, progressCallback);
      setThumbnails((prev) => {
        const next = new Map(prev);
        thumbMap.forEach((dataUrl, id) => next.set(id, dataUrl));
        return next;
      });
    } catch (err) {
      console.error('썸네일 생성 오류:', err);
    }
  }, []);

  const handleReorder = useCallback((newOrder) => {
    setPages(newOrder);
    setGeneratedUrl(null);
    setGeneratedBytes(null);
  }, []);

  const handleDeleteRequest = useCallback((pageId) => {
    setDeleteTargetIds([pageId]);
  }, []);

  const confirmDeleteAction = useCallback(() => {
    if (deleteTargetIds.length === 0) return;

    setPages((prev) => prev.filter((p) => !deleteTargetIds.includes(p.id)));
    setThumbnails((prev) => {
      const next = new Map(prev);
      deleteTargetIds.forEach(id => next.delete(id));
      return next;
    });
    // Also remove from local overlays
    setPageOverlays(prev => {
        const next = { ...prev };
        deleteTargetIds.forEach(id => delete next[id]);
        return next;
    });

    setGeneratedUrl(null);
    setGeneratedBytes(null);
    if (deleteTargetIds.includes(selectedPageId)) {
      setSelectedPageId(null);
      setPreviewImage(null);
    }
    setMultiSelectedIds(prev => {
      const next = new Set(prev);
      deleteTargetIds.forEach(id => next.delete(id));
      return next;
    });
    setDeleteTargetIds([]);
  }, [deleteTargetIds, selectedPageId]);

  const cancelDeleteAction = useCallback(() => {
    setDeleteTargetIds([]);
  }, []);

  const handlePreviewDelete = () => {
    if (multiSelectedIds.size > 0) {
      setDeleteTargetIds(Array.from(multiSelectedIds));
    } else if (selectedPageId) {
      setDeleteTargetIds([selectedPageId]);
    }
  };

  // 엔터/ESC 키 삭제 확인/취소
  useEffect(() => {
    if (deleteTargetIds.length === 0) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        confirmDeleteAction();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelDeleteAction();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteTargetIds, confirmDeleteAction, cancelDeleteAction]);


  const handleToggleDivider = (index) => {
    setDividers(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleClearAll = useCallback(() => {
    setPages([]);
    setThumbnails(new Map());
    setOverlay(DEFAULT_OVERLAY);
    setPageOverlays({});
    setGeneratedUrl(null);
    setGeneratedBytes(null);
    setError(null);
    setSelectedPageId(null);
    setMultiSelectedIds(new Set());
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    setPreviewZoom(1.0);
  }, []);

  const handleGenerate = useCallback(async () => {
    if (pages.length === 0) return;
    setIsGenerating(true);
    setError(null);

    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }

    try {
      // Pass both global overlay and pageOverlays
      const pdfBytes = await mergePagesWithOverlay(pages, overlay, pageOverlays);
      const url = createBlobUrl(pdfBytes);
      blobUrlRef.current = url;
      setGeneratedUrl(url);
      setGeneratedBytes(pdfBytes);
      setLastGeneratedConfig(JSON.stringify({ global: overlay, local: pageOverlays }));
      setIsActionPanelVisible(true); 
    } catch (err) {
      console.error(err);
      alert(`PDF 생성 중 오류가 발생했습니다.\n${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  }, [pages, overlay, pageOverlays]);

  // ... (handleReset, handleDownload, handleShare, handleSelectPage, Nav) - KEEP
  const handleReset = useCallback(() => {
    setIsActionPanelVisible(false);
    setTimeout(() => {
      setGeneratedUrl(null);
    }, 300);
  }, []);

  const handleDownload = useCallback(() => {
    if (!generatedUrl) return;
    const a = document.createElement('a');
    a.href = generatedUrl;
    a.download = `SLEEK-PDF-output-${Date.now()}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [generatedUrl]);

  const handleShare = useCallback(async () => {
    if (!generatedBytes) return;
    await sharePdf(generatedBytes, `SLEEK-PDF-${Date.now()}.pdf`);
  }, [generatedBytes]);

  const handleSelectPage = useCallback((pageId, event) => {
    if (!event?.shiftKey) {
      selectionAnchorIdRef.current = pageId;
    } else if (!selectionAnchorIdRef.current) {
      selectionAnchorIdRef.current = selectedPageId;
    }

    if (event && (event.ctrlKey || event.metaKey)) {
      setMultiSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(pageId)) {
          next.delete(pageId);
        } else {
          next.add(pageId);
        }
        return next;
      });
      setSelectedPageId(pageId);
      setPreviewZoom(1.0);
    } else if (event && event.shiftKey && selectedPageId) {
      const startIdx = pages.findIndex(p => p.id === selectedPageId);
      const endIdx = pages.findIndex(p => p.id === pageId);
      if (startIdx !== -1 && endIdx !== -1) {
        setMultiSelectedIds(prev => {
          const next = new Set(prev);
          const min = Math.min(startIdx, endIdx);
          const max = Math.max(startIdx, endIdx);
          for (let i = min; i <= max; i++) {
            next.add(pages[i].id);
          }
          return next;
        });
      }
      setSelectedPageId(pageId);
      setPreviewZoom(1.0);
    } else {
      setMultiSelectedIds(new Set([pageId]));
      setSelectedPageId(pageId);
      setPreviewZoom(1.0);
    }
  }, [pages, selectedPageId]);

  const handlePrevPage = useCallback(() => {
    if (!selectedPageId) return;
    const idx = pages.findIndex((p) => p.id === selectedPageId);
    if (idx > 0) {
      const prevId = pages[idx - 1].id;
      setSelectedPageId(prevId);
      setMultiSelectedIds(new Set([prevId]));
    }
  }, [selectedPageId, pages]);

  const handleNextPage = useCallback(() => {
    if (!selectedPageId) return;
    const idx = pages.findIndex((p) => p.id === selectedPageId);
    if (idx < pages.length - 1) {
      const nextId = pages[idx + 1].id;
      setSelectedPageId(nextId);
      setMultiSelectedIds(new Set([nextId]));
    }
  }, [selectedPageId, pages]);

  const handleKeyboardPageNavigation = useCallback((direction, extendSelection) => {
    if (!selectedPageId) return;

    const currentIdx = pages.findIndex((p) => p.id === selectedPageId);
    const nextIdx = currentIdx + direction;
    if (currentIdx === -1 || nextIdx < 0 || nextIdx >= pages.length) return;

    const nextId = pages[nextIdx].id;
    if (!extendSelection) {
      selectionAnchorIdRef.current = nextId;
      setSelectedPageId(nextId);
      setMultiSelectedIds(new Set([nextId]));
      return;
    }

    const anchorId = selectionAnchorIdRef.current || selectedPageId;
    const anchorIdx = pages.findIndex((p) => p.id === anchorId);
    if (anchorIdx === -1) return;

    const min = Math.min(anchorIdx, nextIdx);
    const max = Math.max(anchorIdx, nextIdx);
    setSelectedPageId(nextId);
    setMultiSelectedIds(new Set(pages.slice(min, max + 1).map((p) => p.id)));
  }, [selectedPageId, pages]);

  // 방향키 네비게이션 및 Delete 키
  useEffect(() => {
    const handleNavigationKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      if (deleteTargetIds.length > 0) return;

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        handleKeyboardPageNavigation(-1, e.shiftKey);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        handleKeyboardPageNavigation(1, e.shiftKey);
      } else if (e.key === 'Delete') {
        e.preventDefault();
        handlePreviewDelete();
      }
    };
    window.addEventListener('keydown', handleNavigationKeyDown);
    return () => window.removeEventListener('keydown', handleNavigationKeyDown);
  }, [handleKeyboardPageNavigation, deleteTargetIds.length, multiSelectedIds, selectedPageId]);

  const handleZoomIn = () => setPreviewZoom(prev => Math.min(prev + 0.1, 3.0));
  const handleZoomOut = () => setPreviewZoom(prev => Math.max(prev - 0.1, 0.5));

  const handleRotate = useCallback((direction) => {
    if (!selectedPageId) return;
    
    setPages(prev => prev.map(p => {
      if (p.id === selectedPageId) {
        const currentRotation = p.rotation || 0;
        const nextRotation = (currentRotation + (direction === 'left' ? -90 : 90)) % 360;
        // Normalize to positive 0, 90, 180, 270
        const normalizedRotation = (nextRotation + 360) % 360;
        return { ...p, rotation: normalizedRotation };
      }
      return p;
    }));

    // Re-render thumbnail for the rotated page
    const page = pages.find(p => p.id === selectedPageId);
    if (page) {
      renderThumbnail(page.pageBytes, 0.5, (page.rotation || 0) + (direction === 'left' ? -90 : 90)).then(dataUrl => {
        if (dataUrl) {
          setThumbnails(prev => {
            const next = new Map(prev);
            next.set(selectedPageId, dataUrl);
            return next;
          });
        }
      });
    }

    setGeneratedUrl(null);
    setGeneratedBytes(null);
  }, [selectedPageId, pages]);

  const hasPages = pages.length > 0;
  const selectedThumbnail = selectedPageId ? thumbnails.get(selectedPageId) : null;
  const selectedIndex = selectedPageId ? pages.findIndex((p) => p.id === selectedPageId) : -1;
  const selectedPage = selectedIndex >= 0 ? pages[selectedIndex] : null;
  const uniqueFileNames = [...new Set(pages.map((p) => p.sourceFile))];

  // Current Local Overlay for the selected page
  const currentLocalOverlay = selectedPageId ? getLocalOverlay(selectedPageId) : null;

  return (
    <div className="app">
      {/* 헤더 */}
      <header className="app-header">
        <div className="app-header__brand">
          <div className="app-header__logo">
            <svg width="40" height="40" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* Option 5: Solid Gradient Background with enlarged white icon */}
              <rect width="64" height="64" rx="16" fill="url(#header-logo-grad)" />
              <path d="M16 12C16 10.8954 16.8954 10 18 10H38L48 20V52C48 53.1046 47.1046 54 46 54H18C16.8954 54 16 53.1046 16 52V12Z" fill="white" />
              <path d="M38 10V18C38 19.1046 38.8954 20 40 20H48L38 10Z" fill="#e2e8f0" />
              <text x="32" y="36" text-anchor="middle" fill="#6c63ff" font-family="system-ui, sans-serif" font-weight="900" font-size="12">PDF</text>
              <rect x="22" y="40" width="20" height="2" rx="1" fill="#cbd5e1" />
              <rect x="22" y="45" width="14" height="2" rx="1" fill="#cbd5e1" />
              <defs>
                <linearGradient id="header-logo-grad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#6c63ff"/>
                  <stop offset="1" stopColor="#00d2ff"/>
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div>
            <h1 className="app-header__title">SLEEK PDF</h1>
            <span className="app-header__subtitle">웹 브라우저에서 간편하게 PDF를 편집하세요</span>
          </div>
        </div>
        <div className="app-header__actions">
          {hasPages && (
            <div className="view-mode-toggle">
              <button
                className={`view-mode-btn ${viewMode === 'preview' ? 'view-mode-btn--active' : ''}`}
                onClick={() => setViewMode('preview')}
                data-tooltip-bottom="프리뷰 모드"
              >
                <Columns size={16} />
              </button>
              <button
                className={`view-mode-btn ${viewMode === 'grid' ? 'view-mode-btn--active' : ''}`}
                onClick={() => setViewMode('grid')}
                data-tooltip-bottom="그리드 모드"
              >
                <LayoutGrid size={16} />
              </button>
            </div>
          )}
          <ThemeToggle />
          {hasPages && (
            <button className="btn btn-danger" onClick={handleClearAll}>
              <Trash2 size={16} />
              새로 시작
            </button>
          )}
        </div>
      </header>

      {/* 1단계 파일 로딩 오버레이 (분할 작업 중) */}
      {isLoading && loadingProgress < 50 && (
        <div className="app-loading-modal-backdrop animate-fade-in">
          <div className="app-loading-modal glass">
            <div className="spinner app-loading-modal__spinner" />
            <div className="app-loading-modal__text">{loadingMessage}</div>
            <div className="app-loading-modal__progress-container">
               <div 
                 className="app-loading-modal__progress-bar"
                 style={{ width: `${Math.round(loadingProgress * 2)}%` }} /* Scale 0-50 to 0-100 visually */
               />
            </div>
            <div className="app-loading-modal__progress-text">
               {Math.round(loadingProgress * 2)}%
            </div>
          </div>
        </div>
      )}

      {/* 에러 메시지 - 화면 중앙 모달 */}
      {error && (
        <div className="app-error-modal-backdrop animate-fade-in" onClick={() => setError(null)}>
          <div className="app-error-modal glass" onClick={(e) => e.stopPropagation()}>
            <div className="app-error-modal__icon">⚠️</div>
            <p className="app-error-modal__text">{error}</p>
            <button className="btn btn-secondary" onClick={() => setError(null)}>확인</button>
          </div>
        </div>
      )}

      {/* 삭제 확인 모달 */}
      {deleteTargetIds.length > 0 && (
        <div className="app-error-modal-backdrop animate-fade-in" style={{ animationDuration: '0.1s' }} onClick={cancelDeleteAction}>
          <div className="app-confirm-modal glass" onClick={(e) => e.stopPropagation()}>
            <div className="app-confirm-modal__title">페이지 삭제</div>
            <p className="app-confirm-modal__text">{deleteTargetIds.length > 1 ? `선택한 ${deleteTargetIds.length}개의 페이지를` : '이 페이지를'} 삭제하시겠습니까?</p>
            <div className="app-confirm-modal__actions">
              <button className="btn btn-secondary" onClick={cancelDeleteAction}>취소</button>
              <button className="btn btn-danger" onClick={confirmDeleteAction}>삭제</button>
            </div>
          </div>
        </div>
      )}

      {/* 메인 컨텐츠 */}
      {!hasPages ? (
        <main className="app-main app-main--center">
          <DropZone onFilesSelected={handleFiles} disabled={isLoading} />
        </main>
      ) : (
        <main className="app-main app-main--editor">
          {viewMode === 'preview' ? (
            /* ========= A모드: 좌측 리스트 + 우측 프리뷰 ========= */
            <div className="editor-layout editor-layout--preview">
              <aside className="editor-sidebar-left">
              <div className="editor-sidebar-left__header">
                <span className="editor-sidebar-left__count">
                  총 <strong>{pages.length}</strong>페이지
                </span>
              </div>
              <div className="editor-sidebar-left__list">
                <PageGrid
                  pages={pages}
                  thumbnails={thumbnails}
                  dividers={dividers}
                  onToggleDivider={handleToggleDivider}
                  onReorder={handleReorder}
                  onDelete={handleDeleteRequest}
                  viewMode="list"
                  selectedPageId={selectedPageId}
                  selectedPageIds={multiSelectedIds}
                  onSelectPage={handleSelectPage}
                  onAddFiles={handleFiles}
                  isLoading={isLoading}
                  loadingProgress={loadingProgress}
                />
                
                <div className="editor-sidebar-left__list-footer">
                  <DropZone onFilesSelected={handleFiles} isCompact disabled={isLoading} />
                </div>
              </div>
              
              {/* 썸네일 생성 중 도넛 로딩바 표시 (사이드바 전체 덮기) */}
              {loadingProgress >= 50 && loadingProgress < 100 && (
                <ThumbnailProgressOverlay progress={(loadingProgress - 50) * 2} />
              )}
            </aside>

              {/* 우측: 큰 프리뷰 */}
              <div className="editor-preview-area">
                <div className="editor-preview__content">
                  {(() => {
                    const isPreviewReady = previewImage && renderedProps && renderedProps.id === selectedPage?.id;
                    const displayProps = isPreviewReady ? renderedProps : { ...selectedPage, rotation: 0 };
                    
                    const isRotated = displayProps?.rotation === 90 || displayProps?.rotation === 270;
                    const baseW = displayProps?.width || 0;
                    const baseH = displayProps?.height || 0;
                    const visualW = isRotated ? baseH : baseW;
                    const visualH = isRotated ? baseW : baseH;

                    return (
                      <>
                        {isPreviewReady ? (
                          <>
                            <div className="editor-preview__scroll-container" ref={previewContainerRef}>
                              <div style={{ 
                                width: `${visualW * baseScale * previewZoom}px`, 
                                height: `${visualH * baseScale * previewZoom}px`,
                                position: 'relative',
                                margin: 'auto'
                              }}>
                                <div 
                                  className="editor-preview__image-wrapper"
                                  style={{ 
                                     transform: `scale(${baseScale * previewZoom})`,
                                     transformOrigin: 'top left',
                                     width: `${visualW}px`,
                                     height: `${visualH}px`,
                                     position: 'absolute',
                                     top: 0,
                                     left: 0
                                  }}
                                >
                                  <img
                                  src={previewImage}
                                  alt={`페이지 ${selectedIndex + 1}`}
                                  className={`editor-preview__image ${previewLoading ? 'editor-preview__image--blurred' : ''}`}
                                />
                                <OverlayPreviewLayer 
                                  globalOverlay={overlay} 
                                  localOverlay={currentLocalOverlay}
                                  onGlobalUpdate={(u) => setOverlay(prev => ({ ...prev, ...u }))} 
                                  onLocalUpdate={handleLocalOverlayChange}
                                />
                                {previewLoading && (
                                  <div className="editor-preview__loading-overlay" style={{position: 'absolute', inset: 0, zIndex: 10}}>
                                    <div className="spinner" />
                                  </div>
                                )}
                                </div>
                              </div>
                            </div>
                            {selectedPage && (
                              <div className="editor-preview__filename-overlay">
                                {selectedPage.pageLabel}
                              </div>
                            )}
                          </>
                        ) : previewLoading || selectedThumbnail ? (
                           <div className="editor-preview__loading-wrap" ref={previewContainerRef} style={{width: '100%', height: '100%'}}>
                             {selectedThumbnail && (
                               <div style={{ width: `${visualW * baseScale}px`, height: `${visualH * baseScale}px`, position: 'relative' }}>
                                 <img
                                   src={selectedThumbnail}
                                   alt={`페이지 ${selectedIndex + 1}`}
                                   className="editor-preview__image editor-preview__image--blurred"
                                 />
                               </div>
                             )}
                             <div className="editor-preview__loading-overlay" style={{position: 'absolute'}}>
                               <div className="spinner" />
                               <p>고해상도 렌더링 중...</p>
                             </div>
                           </div>
                        ) : (
                           <div className="editor-preview__placeholder" ref={previewContainerRef} style={{width: '100%', height: '100%'}}>
                             <div className="spinner" />
                             <p>페이지를 렌더링하고 있습니다...</p>
                           </div>
                        )}
                      </>
                    );
                  })()}
                </div>

                {/* 페이지 네비게이션 + 삭제 */}
                <div className="editor-preview__nav">
                  <button 
                    className="btn btn-secondary btn-icon" 
                    onClick={handlePrevPage} 
                    disabled={selectedIndex <= 0}
                    title="이전 페이지"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <div className="editor-preview__page-info">
                    {selectedIndex + 1} / {pages.length}
                  </div>
                  <button 
                    className="btn btn-secondary btn-icon" 
                    onClick={handleNextPage} 
                    disabled={selectedIndex >= pages.length - 1}
                    title="다음 페이지"
                  >
                    <ChevronRight size={18} />
                  </button>
                  
                  <div className="editor-preview__nav-divider" />
                  
                  <button className="btn btn-secondary btn-icon" onClick={handleZoomOut} title="축소">
                    <ZoomOut size={18} />
                  </button>
                  <div className="toolbar-label">
                    {Math.round(previewZoom * 100)}%
                  </div>
                  <button className="btn btn-secondary btn-icon" onClick={handleZoomIn} title="확대">
                    <ZoomIn size={18} />
                  </button>
                  
                  <div className="editor-preview__nav-divider" />
                  
                  <button className="btn btn-secondary btn-icon" onClick={() => handleRotate('left')} title="왼쪽으로 90도 회전">
                    <RotateLeftIcon size={18} />
                  </button>
                  <div className="toolbar-label">회전</div>
                  <button className="btn btn-secondary btn-icon" onClick={() => handleRotate('right')} title="오른쪽으로 90도 회전">
                    <RotateRightIcon size={18} />
                  </button>

                  <div className="editor-preview__nav-divider" />
                  
                  <button 
                    className="btn btn-secondary editor-preview__delete-btn" 
                    onClick={handlePreviewDelete} 
                    disabled={!selectedPageId && multiSelectedIds.size === 0}
                    title="현재 페이지 삭제"
                  >
                    <Trash2 size={16} />
                    <span style={{ marginLeft: '4px' }}>삭제</span>
                  </button>
                </div>
              </div>

              {/* 우측 사이드바: 오버레이 설정 */}
              <aside className="editor-sidebar">
                <div className="editor-sidebar__generate">
                  <button
                    className="btn btn-primary"
                    onClick={handleGenerate}
                    disabled={isGenerating || pages.length === 0}
                    style={{ width: '100%', marginBottom: '12px', justifyContent: 'center' }}
                  >
                    {isGenerating ? <><Loader size={18} className="action-spinner" />생성 중...</> : <><FileText size={18} />PDF 생성</>}
                  </button>
                </div>
                <OverlaySettings 
                  globalOverlay={overlay} 
                  onGlobalChange={handleGlobalOverlayChange}
                  localOverlay={currentLocalOverlay}
                  onLocalChange={handleLocalOverlayChange}
                  isPageSelected={!!selectedPageId}
                />
              </aside>
            </div>
          ) : (
            /* ========= B모드: 기존 그리드 레이아웃 ========= */
            <div className="editor-layout editor-layout--grid">
              <div className="editor-grid-area">
                {/* ... grid toolbar ... */}
                <div className="editor-grid-toolbar">
                  <div className="editor-grid-toolbar__info">
                    <FileText size={16} /> <span>총 <strong>{pages.length}</strong>페이지</span>
                  </div>
                  {uniqueFileNames.length > 0 && (
                    <div className="editor-grid-toolbar__files">
                      {uniqueFileNames.map((name) => (
                        <span key={name} className="editor-grid-toolbar__file-tag">{name}</span>
                      ))}
                    </div>
                  )}
                  <div style={{ flex: 1 }} />
                  {multiSelectedIds.size > 0 && (
                     <button className="btn btn-danger" style={{ display: 'flex', alignItems: 'center', fontSize: '12px', padding: '6px 10px', height: '32px' }} onClick={() => setDeleteTargetIds(Array.from(multiSelectedIds))}>
                        <Trash2 size={14} style={{ marginRight: '6px' }} /> 선택된 {multiSelectedIds.size}개 삭제
                     </button>
                  )}
                </div>
                <PageGrid
                  pages={pages}
                  thumbnails={thumbnails}
                  dividers={dividers}
                  onToggleDivider={handleToggleDivider}
                  onReorder={handleReorder}
                  onDelete={handleDeleteRequest}
                  viewMode="grid"
                  selectedPageId={selectedPageId}
                  selectedPageIds={multiSelectedIds}
                  onSelectPage={handleSelectPage}
                  onAddFiles={handleFiles}
                  isLoading={isLoading}
                  loadingProgress={loadingProgress}
                />
              </div>
              <aside className="editor-sidebar">
                <div className="editor-sidebar__generate">
                  <button
                    className="btn btn-primary"
                    onClick={handleGenerate}
                    disabled={isGenerating || pages.length === 0}
                    style={{ width: '100%', marginBottom: '12px', justifyContent: 'center' }}
                  >
                    {isGenerating ? <><Loader size={18} className="action-spinner" />생성 중...</> : <><FileText size={18} />PDF 생성</>}
                  </button>
                </div>
                <OverlaySettings 
                  globalOverlay={overlay} 
                  onGlobalChange={handleGlobalOverlayChange}
                  localOverlay={currentLocalOverlay}
                  onLocalChange={handleLocalOverlayChange}
                  isPageSelected={!!selectedPageId}
                />
              </aside>
            </div>
          )}

          {/* 하단: 액션 패널 */}
          <ActionPanel
            isVisible={isActionPanelVisible}
            onGenerate={handleGenerate}
            onReset={handleReset}
            onDownload={handleDownload}
            onShare={handleShare}
            canShare={isShareSupported()}
            isGenerating={isGenerating}
            hasChanges={hasChanges}
          />
        </main>
      )}

      <footer className="app-footer">
        <p>모든 작업 및 처리는 브라우저 내에서 이루어집니다. 파일이 서버로 전송되거나 저장되지 않습니다.</p>
      </footer>
    </div>
  );
}
