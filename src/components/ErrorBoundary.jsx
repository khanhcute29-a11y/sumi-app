import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // Fallback tùy chọn: cho phép nơi gọi tự quyết định UI khi lỗi (VD Trợ lý
      // Gen truyền fallback={null} để tự biến mất, KHÔNG làm sập app chính).
      // Không truyền fallback -> giữ nguyên hành vi mặc định (tương thích main.jsx).
      if (this.props.fallback !== undefined) {
        const reset = () => this.setState({ hasError: false, error: null });
        return typeof this.props.fallback === 'function'
          ? this.props.fallback(this.state.error, reset)
          : this.props.fallback;
      }
      return (
        <div style={{
          padding: 24, margin: '20px auto', maxWidth: 540,
          background: 'var(--surface-card)', borderRadius: 20,
          border: '1px solid var(--border-default)', textAlign: 'center'
        }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
          <h3 style={{ color: 'var(--status-danger)', margin: '0 0 8px' }}>Đã xảy ra lỗi hiển thị</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 16 }}>
            {this.state.error?.message || 'Có lỗi bất ngờ khi tải thành phần này.'}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            style={{
              padding: '10px 20px', borderRadius: 12, border: 0,
              background: 'var(--action-primary)', color: '#fff',
              fontWeight: 800, cursor: 'pointer'
            }}
          >
            🔄 Tải lại trang
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
