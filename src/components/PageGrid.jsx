import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { useState, useCallback } from 'react';
import PageThumbnail from './PageThumbnail';
import DropZone from './DropZone';
import ThumbnailProgressOverlay from './ThumbnailProgressOverlay';
import './PageGrid.css';

/**
 * PageGrid 컴포넌트
 * 듀얼 뷰 모드 지원: grid(B모드) / list(A모드 사이드바용)
 */
export default function PageGrid({
  pages,
  thumbnails,
  onReorder,
  onDelete,
  viewMode = 'grid',
  selectedPageId,
  selectedPageIds = new Set(),
  onSelectPage,
  onAddFiles,
  isLoading = false,
  loadingProgress = 0,
  confirmDelete,
  dividers,
  onToggleDivider,
}) {
  const [activeId, setActiveId] = useState(null);
  const [activeIds, setActiveIds] = useState([]);
  const [overId, setOverId] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  const handleDragStart = useCallback((event) => {
    const draggedId = event.active.id;
    // 선택된 페이지에서 드래그를 시작한 경우에만 선택 전체를 함께 이동한다.
    const ids = selectedPageIds.has(draggedId)
      ? pages.filter((page) => selectedPageIds.has(page.id)).map((page) => page.id)
      : [draggedId];

    setActiveId(draggedId);
    setActiveIds(ids);
  }, [pages, selectedPageIds]);

  const handleDragOver = useCallback((event) => {
    setOverId(event.over ? event.over.id : null);
  }, []);

  const handleDragEnd = useCallback((event) => {
    const { active, over } = event;
    setActiveId(null);
    setActiveIds([]);
    setOverId(null);
    if (!over || active.id === over.id || activeIds.includes(over.id)) return;

    const oldIndex = pages.findIndex((p) => p.id === active.id);
    const overIndex = pages.findIndex((p) => p.id === over.id);
    if (oldIndex === -1 || overIndex === -1) return;

    if (activeIds.length === 1) {
      onReorder(arrayMove(pages, oldIndex, overIndex));
      return;
    }

    const movingIds = new Set(activeIds);
    const movingPages = pages.filter((page) => movingIds.has(page.id));
    const remainingPages = pages.filter((page) => !movingIds.has(page.id));
    const targetIndex = remainingPages.findIndex((page) => page.id === over.id);
    const insertIndex = oldIndex < overIndex ? targetIndex + 1 : targetIndex;

    onReorder([
      ...remainingPages.slice(0, insertIndex),
      ...movingPages,
      ...remainingPages.slice(insertIndex),
    ]);
  }, [activeIds, pages, onReorder]);

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
    setActiveIds([]);
    setOverId(null);
  }, []);

  const isListMode = viewMode === 'list';

  const getDropPosition = useCallback((pageId) => {
    if (!activeId || !overId || overId !== pageId) return null;
    const activeIndex = pages.findIndex((p) => p.id === activeId);
    const overIndex = pages.findIndex((p) => p.id === overId);
    if (activeIndex === -1 || overIndex === -1) return null;
    if (isListMode) {
      return activeIndex < overIndex ? 'bottom' : 'top';
    }
    return activeIndex < overIndex ? 'right' : 'left';
  }, [activeId, overId, pages, isListMode]);

  const activePage = activeId ? pages.find((p) => p.id === activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext
        items={pages.map((p) => p.id)}
        strategy={isListMode ? verticalListSortingStrategy : rectSortingStrategy}
      >
        <div 
          className={`page-grid ${isListMode ? 'page-grid--list' : 'page-grid--grid'}`}
          style={{ overflowY: isListMode ? 'visible' : ((loadingProgress >= 50 && loadingProgress < 100) ? 'hidden' : 'auto') }}
        >
          {/* Batch Reveal: 썸네일 생성 중(50~100%)에는 임시 카드를 아예 그리지 않음 */}
          {(!(!isListMode && loadingProgress >= 50 && loadingProgress < 100)) && pages.map((page, index) => (
            <PageThumbnail
              key={page.id}
              page={page}
              thumbnail={thumbnails.get(page.id)}
              index={index}
              onDelete={onDelete}
              isOver={!!getDropPosition(page.id)}
              dropPosition={getDropPosition(page.id)}
              isSelected={selectedPageIds ? selectedPageIds.has(page.id) : selectedPageId === page.id}
              isGroupDragging={activeIds.length > 1 && activeIds.includes(page.id)}
              onSelect={onSelectPage}
              confirmDelete={confirmDelete}
              hasDivider={dividers?.has(index)}
              onToggleDivider={() => onToggleDivider && onToggleDivider(index)}
              viewMode={viewMode}
            />
          ))}

          {/* 그리드 모드: 마지막 카드에 추가 버튼 겸 DropZone. */}
          {!isListMode && onAddFiles && (
            <div className="page-thumb-wrapper page-thumb-wrapper--add">
              <DropZone onFilesSelected={onAddFiles} isCompact disabled={isLoading} />
            </div>
          )}
          
          {/* 그리드 모드: 썸네일 생성 중 도넛 로딩바 (그리드 전체 덮기) */}
          {!isListMode && loadingProgress >= 50 && loadingProgress < 100 && (
            <ThumbnailProgressOverlay progress={(loadingProgress - 50) * 2} />
          )}
        </div>
      </SortableContext>

      <DragOverlay
        adjustScale={false}
        dropAnimation={{
          duration: 150,
          easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
        }}
      >
        {activePage ? (
          <div className={`page-thumb page-thumb--overlay ${isListMode ? 'page-thumb--overlay-list' : ''}`}>
            <div className="page-thumb__image-wrap">
              {thumbnails.get(activePage.id) ? (
                <img src={thumbnails.get(activePage.id)} alt="드래그 중" className="page-thumb__image" />
              ) : (
                <div className="page-thumb__placeholder" />
              )}
            </div>
            {activeIds.length > 1 && (
              <span className="page-thumb__drag-count">{activeIds.length}</span>
            )}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
