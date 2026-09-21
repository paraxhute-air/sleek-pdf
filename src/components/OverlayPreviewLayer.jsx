import React, { useState, useRef, useEffect } from 'react';
import './OverlayPreviewLayer.css';

/**
 * OverlayPreviewLayer
 * Renders global (Watermark, Stamp) and local (Text, Image) overlays.
 * Handles interactions (drag, resize, rotate) and routes updates to appropriate handlers.
 */
export default function OverlayPreviewLayer({ 
  globalOverlay, 
  localOverlay, 
  onGlobalUpdate, 
  onLocalUpdate 
}) {
  const containerRef = useRef(null);
  
  // Selection state: { id: string, type: string, scope: 'global'|'local' } | null
  const [selectedItem, setSelectedItem] = useState(null);

  const handleBackgroundClick = (e) => {
    if (e.target === containerRef.current) {
      setSelectedItem(null);
    }
  };

  const update = (scope, updates) => {
    if (scope === 'global') onGlobalUpdate(updates);
    else onLocalUpdate(updates);
  };

  // Delete Selection
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!selectedItem) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
         // Remove the mode from enabledModes
         const scope = selectedItem.scope;
         const type = selectedItem.type; 
         const config = scope === 'global' ? globalOverlay : localOverlay;
         
         if (config && config.enabledModes) {
            // Check type mapping if needed, but we use consistent keys now.
            // Global: 'watermark', 'stamp'
            // Local: 'text', 'image'
            
            // Wait, enabledModes stores: 'watermark', 'stamp' (global)
            // 'text', 'image' (local)
            // selectedItem.type matches these strings.
            
            const newModes = config.enabledModes.filter(m => m !== type);
            update(scope, { enabledModes: newModes });
            setSelectedItem(null);
         }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedItem, globalOverlay, localOverlay, onGlobalUpdate, onLocalUpdate]);

  // Interaction Handlers
  const handleDragEnd = (item, xPct, yPct) => {
     const updates = {};
     if (item.type === 'text' || item.type === 'watermark') {
        updates.customX = xPct;
        updates.customY = yPct;
        // Also update position string? No, keep it as fallback.
     } else if (item.type === 'image') {
        updates.imageCustomX = xPct;
        updates.imageCustomY = yPct;
     } else if (item.type === 'stamp') {
        updates.stampCustomX = xPct;
        updates.stampCustomY = yPct;
     }
     update(item.scope, updates);
  };

  const handleRotate = (item, rotation) => {
    const updates = {};
    if (item.type === 'image') updates.imageRotation = rotation;
    else if (item.type === 'stamp') updates.stampRotation = rotation;
    else updates.rotation = rotation; 
    update(item.scope, updates);
  };

  const handleResize = (item, factor, startValues) => {
    const updates = {};
    if (item.type === 'image') {
       const newScale = Math.max(0.1, Math.min(5.0, startValues.scale * factor));
       updates.imageScale = newScale;
    } else {
       // Text based
       const newSize = Math.max(10, Math.min(300, startValues.fontSize * factor));
       if (item.type === 'stamp') updates.stampFontSize = newSize;
       else updates.fontSize = newSize;
    }
    update(item.scope, updates);
  };

  const renderOverlayItem = (config, scope, type) => {
    if (!config || !config.enabledModes?.includes(type)) return null;

    let content = null;
    let style = {};
    let position = 'middle-center'; // Default center
    let customX = null;
    let customY = null;
    let rotation = 0;
    let scale = 1;
    let fontSize = 40;
    
    const isSelected = selectedItem?.scope === scope && selectedItem?.type === type;
    const key = `${scope}-${type}`;

    if (type === 'image') {
       if (!config.imageDataUrl) return null;
       content = <img src={config.imageDataUrl} alt="overlay" style={{ display: 'block', pointerEvents: 'none' }} />;
       
       position = config.imagePosition || 'middle-center';
       customX = config.imageCustomX;
       customY = config.imageCustomY;
       rotation = config.imageRotation ?? 0;
       scale = config.imageScale ?? 0.2;
       style = { opacity: config.imageOpacity ?? 1 };

    } else if (type === 'stamp') {
       const text = config.stampText || 'CONFIDENTIAL';
       const color = config.stampColor || { r:0.8, g:0.1, b:0.1 }; 
       const colorStr = getColor(color);
       
       fontSize = config.stampFontSize || 40;
       
       const borderStyle = config.stampBorder 
          ? `3px solid ${colorStr}` 
          : 'none'; 

       content = (
         <div className="stamp-content" style={{
            border: borderStyle,
            padding: '0.2em 0.5em',
            borderRadius: '4px',
            fontWeight: 'bold',
            color: colorStr,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            textAlign: 'center',
            lineHeight: 1.2
         }}>{text}</div>
       );
       
       position = config.stampPosition || 'bottom-right';
       customX = config.stampCustomX;
       customY = config.stampCustomY;
       rotation = config.stampRotation ?? -15; 
       style = { opacity: config.stampOpacity ?? 0.8, fontSize: `${fontSize}px` };

    } else {
       // Text / Watermark
       const text = config.text || (type === 'watermark' ? 'Watermark' : 'Text');
       content = text;
       
       position = config.position || 'middle-center';
       customX = config.customX;
       customY = config.customY;
       rotation = config.rotation ?? (type === 'watermark' ? 45 : 0);
       fontSize = config.fontSize || 60;
       
       const color = config.color || { r:0.5, g:0.5, b:0.5 };
       const colorStr = getColor(color);

       style = {
          color: colorStr,
          opacity: config.opacity ?? 0.4,
          fontSize: `${fontSize}px`,
          fontWeight: config.textStyle?.bold ? 'bold' : 'normal',
          fontStyle: config.textStyle?.italic ? 'italic' : 'normal',
          textDecoration: config.textStyle?.underline ? 'underline' : 'none',
          fontFamily: getFontFamily(config.fontFamily),
          border: config.border ? `2px solid ${colorStr}` : 'none',
          padding: '0.15em 0.3em', // Tight padding
          lineHeight: 1, // Ensure tight vertical alignment
          whiteSpace: 'nowrap'
       };
    }

    return (
      <DraggableElement
        key={key}
        id={key}
        type={type}
        scope={scope}
        containerRef={containerRef}
        isSelected={isSelected}
        onSelect={() => setSelectedItem({ id: key, type, scope })}
        position={position}
        customX={customX}
        customY={customY}
        rotation={rotation}
        scale={scale} 
        fontSize={fontSize}
        onDragEnd={handleDragEnd}
        onResize={handleResize}
        onRotate={handleRotate}
        style={style}
      >
        {content}
      </DraggableElement>
    );
  };
  
  return (
    <div 
      className="overlay-preview-layer" 
      ref={containerRef} 
      onMouseDown={handleBackgroundClick}
      style={{ pointerEvents: 'auto' }}
    >
      {/* Background to Foreground */}
      {globalOverlay && renderOverlayItem(globalOverlay, 'global', 'watermark')}
      {localOverlay && renderOverlayItem(localOverlay, 'local', 'image')}
      {localOverlay && renderOverlayItem(localOverlay, 'local', 'text')}
      {globalOverlay && renderOverlayItem(globalOverlay, 'global', 'stamp')}
    </div>
  );
}

// Helpers
const getColor = (c) => c ? `rgb(${c.r * 255}, ${c.g * 255}, ${c.b * 255})` : 'black';
const getFontFamily = (fontId) => {
  switch(fontId) {
    case 'courier': return '"Courier New", Courier, monospace';
    case 'helvetica': return 'Helvetica, Arial, sans-serif';
    case 'times': return '"Times New Roman", Times, serif';
    case 'symbol': return 'Symbol, serif'; 
    case 'zapfdingbats': return 'Zapf Dingbats, serif'; 
    case 'classic': return '"Times New Roman", Times, serif';
    case 'modern': return 'Helvetica, Arial, sans-serif';
    case 'code': return '"Courier New", Courier, monospace';
    case 'nanum': return '"Nanum Gothic", sans-serif';
    case 'malgun': default: return '"Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
  }
};

// pdfHelpers.js의 calculatePosition()과 동일한 margin(24pt).
// 이 컨테이너는 폭/높이가 PDF 페이지 크기(pt)와 1:1로 매핑되므로 px 값을 그대로 써도 된다.
const PRESET_MARGIN = 24;

/**
 * 위치 프리셋(top-left 등)에 대해 요소 자신의 모서리를 앵커에 붙이는 스타일을 계산한다.
 * 텍스트 폭/높이를 몰라도 브라우저가 알아서 배치하므로 계측이 필요 없다.
 */
function getPresetAnchorStyle(position, rotation, scaleTransform = '') {
  const [vPos, hPos] = (position || 'middle-center').split('-');
  const boxStyle = {};
  let translateX = '0';
  let translateY = '0';

  if (hPos === 'left') {
    boxStyle.left = `${PRESET_MARGIN}px`;
  } else if (hPos === 'right') {
    boxStyle.right = `${PRESET_MARGIN}px`;
  } else {
    boxStyle.left = '50%';
    translateX = '-50%';
  }

  if (vPos === 'top') {
    boxStyle.top = `${PRESET_MARGIN}px`;
  } else if (vPos === 'bottom') {
    boxStyle.bottom = `${PRESET_MARGIN}px`;
  } else {
    boxStyle.top = '50%';
    translateY = '-50%';
  }

  boxStyle.transform = `translate(${translateX}, ${translateY}) rotate(${rotation}deg)${scaleTransform}`;
  return boxStyle;
}

/**
 * DraggableElement
 * Handles DOM events for Drag, Resize, Rotate.
 */
function DraggableElement({ 
  children, 
  containerRef, 
  type, scope, 
  isSelected, onSelect, 
  position, customX, customY, 
  rotation, scale, fontSize,
  onDragEnd, onResize, onRotate, 
  style 
}) {
  const elementRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [currentCenter, setCurrentCenter] = useState({ x: null, y: null });

  useEffect(() => {
    if (!isDragging) {
      setCurrentCenter({ x: null, y: null });
    }
  }, [position, customX, customY, isDragging]);

  const handleMouseDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect();
    
    if (!containerRef.current || !elementRef.current) return;
    const container = containerRef.current.getBoundingClientRect();
    const element = elementRef.current.getBoundingClientRect();
    
    const scaleX = container.width / containerRef.current.offsetWidth;
    const scaleY = container.height / containerRef.current.offsetHeight;
    
    const centerX = element.left + element.width / 2;
    const centerY = element.top + element.height / 2;
    
    setDragOffset({
      x: e.clientX - centerX,
      y: e.clientY - centerY
    });
    
    setCurrentCenter({
      x: (centerX - container.left) / scaleX,
      y: (centerY - container.top) / scaleY
    });
    
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;
    
    const handleMove = (e) => {
       if (!containerRef.current) return;
       const container = containerRef.current.getBoundingClientRect();
       const scaleX = container.width / containerRef.current.offsetWidth;
       const scaleY = container.height / containerRef.current.offsetHeight;
       
       setCurrentCenter({
          x: (e.clientX - container.left - dragOffset.x) / scaleX,
          y: (e.clientY - container.top - dragOffset.y) / scaleY
       });
    };
    
    const handleUp = () => {
       setIsDragging(false);
       if (containerRef.current && currentCenter.x !== null) {
          const width = containerRef.current.offsetWidth;
          const height = containerRef.current.offsetHeight;
          onDragEnd({ type, scope }, currentCenter.x / width, currentCenter.y / height);
       }
    };
    
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isDragging, dragOffset, containerRef, onDragEnd, type, scope, currentCenter.x]);

  const handleResizeStart = (e, handleType) => {
     e.stopPropagation(); e.preventDefault();
     if (!elementRef.current) return; 
     
     const rect = elementRef.current.getBoundingClientRect();
     const centerX = rect.left + rect.width / 2;
     const centerY = rect.top + rect.height / 2;
     const startDist = Math.hypot(e.clientX - centerX, e.clientY - centerY);
     const startValues = { fontSize, scale };

     const handleMove = (ev) => {
        const curDist = Math.hypot(ev.clientX - centerX, ev.clientY - centerY);
        const factor = curDist / Math.max(1, startDist);
        onResize({ type, scope }, factor, startValues);
     };
     
     const handleUp = () => {
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('mouseup', handleUp);
     };
     window.addEventListener('mousemove', handleMove);
     window.addEventListener('mouseup', handleUp);
  };

  const handleRotateStart = (e) => {
     e.stopPropagation(); e.preventDefault();
     if (!elementRef.current) return;
     const rect = elementRef.current.getBoundingClientRect();
     const centerX = rect.left + rect.width / 2;
     const centerY = rect.top + rect.height / 2;

     const handleMove = (ev) => {
        const dx = ev.clientX - centerX;
        const dy = ev.clientY - centerY;
        const angleRad = Math.atan2(dy, dx);
        let deg = angleRad * (180 / Math.PI) + 90; 
        if (ev.shiftKey) deg = Math.round(deg / 15) * 15;
        onRotate({ type, scope }, deg);
     };
     
     const handleUp = () => {
        window.removeEventListener('mouseup', handleUp);
        window.removeEventListener('mousemove', handleMove);
     };
     window.addEventListener('mousemove', handleMove);
     window.addEventListener('mouseup', handleUp);
  };

  // Construct styles
  let finalStyle = { ...style, position: 'absolute', cursor: 'move', userSelect: 'none' };
  let className = `overlay-item ${type} ${isSelected ? 'is-selected' : ''}`;

  if (currentCenter.x !== null) {
      finalStyle.left = `${currentCenter.x}px`;
      finalStyle.top = `${currentCenter.y}px`;
      finalStyle.transform = `translate(-50%, -50%) rotate(${rotation}deg) scale(${type === 'image' ? scale : 1})`;
  } else if (customX != null && customY != null) {
      finalStyle.left = `${customX * 100}%`;
      finalStyle.top = `${customY * 100}%`;
      finalStyle.transform = `translate(-50%, -50%) rotate(${rotation}deg) scale(${type === 'image' ? scale : 1})`;
  } else {
      // 프리셋 위치(top-left 등): PDF의 calculatePosition()과 동일한 여백(24)·앵커 규칙을 재현
      const scaleTransform = type === 'image' ? ` scale(${scale})` : '';
      Object.assign(finalStyle, getPresetAnchorStyle(position, rotation, scaleTransform));
  }

  return (
    <div 
      ref={elementRef}
      className={className} 
      style={finalStyle}
      onMouseDown={handleMouseDown}
    >
      {isSelected && (
        <>
           <div className="rotate-line"></div>
           <div className="rotate-handle" onMouseDown={handleRotateStart}></div>
           <div className="resize-handle nw" onMouseDown={(e) => handleResizeStart(e, 'nw')}></div>
           <div className="resize-handle ne" onMouseDown={(e) => handleResizeStart(e, 'ne')}></div>
           <div className="resize-handle sw" onMouseDown={(e) => handleResizeStart(e, 'sw')}></div>
           <div className="resize-handle se" onMouseDown={(e) => handleResizeStart(e, 'se')}></div>
        </>
      )}
      {children}
    </div>
  );
}
