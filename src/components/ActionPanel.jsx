import { Download, Share2 } from 'lucide-react';
import './ActionPanel.css';

/**
 * ActionPanel 컴포넌트
 * PDF 생성 완료 후 표시되는 다운로드/공유 액션
 */
export default function ActionPanel({
  isVisible,
  onDownload,
  onShare,
  canShare,
}) {
  if (!isVisible) return null;

  return (
    <div className="action-panel">
      <div className="action-panel__content">
        <button className="btn btn-secondary action-btn action-btn--secondary" onClick={onDownload}>
          <Download size={20} />
          다운로드
        </button>

        {canShare && (
          <button className="btn btn-secondary action-btn action-btn--secondary" onClick={onShare}>
            <Share2 size={20} />
            공유하기
          </button>
        )}

      </div>
    </div>
  );
}
