import { Trash2 } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import './PageThumbnail.css';

/**
 * PageThumbnail 컴포넌트
 * 썸네일 이미지만 카드 안에, 페이지 번호는 카드 바깥
 * 파일명은 0.5초 호버 후 말풍선으로 표시
 */
export default function PageThumbnail({ page, thumbnail, index, onDelete, isOver, dropPosition, isSelected, isGroupDragging, onSelect, confirmDelete, hasDivider, onToggleDivider, viewMode }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: page.id,
    transition: {
      duration: 200,
      easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging || isGroupDragging ? 0.3 : 1,
    zIndex: isDragging ? 100 : 'auto',
  };

  return (
    <div className="page-thumb-wrapper" style={style} ref={setNodeRef}>
      <div
        className={`page-thumb ${isDragging ? 'page-thumb--dragging' : ''} ${isOver ? 'page-thumb--over' : ''} ${isSelected ? 'page-thumb--selected' : ''}`}
        {...attributes}
        {...listeners}
        onClick={(e) => { if (onSelect) { e.stopPropagation(); onSelect(page.id, e); } }}
        data-filename={page.pageLabel}
      >
        {/* 삭제 버튼 */}
        <button
          className={`page-thumb__delete ${confirmDelete === page.id ? 'page-thumb__delete--confirm' : ''}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(page.id);
          }}
          aria-label="페이지 삭제"
        >
          <Trash2 size={12} />
        </button>

        {/* 썸네일 이미지 */}
        <div className="page-thumb__image-wrap">
          {thumbnail ? (
            <img
              src={thumbnail}
              alt={`페이지 ${index + 1}`}
              className="page-thumb__image"
              draggable={false}
            />
          ) : (
            <div className="page-thumb__placeholder" />
          )}
        </div>

        {/* 드롭 인디케이터 */}
        {isOver && dropPosition && (
          <div className={`page-thumb__drop-indicator page-thumb__drop-indicator--${dropPosition}`} />
        )}

        {/* 구분선 트리거 (페이지 사이 빨간선) */}
        <div
          className={`page-thumb__divider-trigger ${hasDivider ? 'page-thumb__divider-trigger--active' : ''} ${viewMode === 'list' ? 'page-thumb__divider-trigger--list' : 'page-thumb__divider-trigger--grid'}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onToggleDivider && onToggleDivider();
          }}
          title="클릭하여 구분선 토글"
        >
          <span className="page-thumb__divider-visual"></span>
        </div>
      </div>

      {/* 카드 바깥: 페이지 번호만 표시 */}
      <span className="page-thumb__number">{index + 1}</span>
    </div>
  );
}
