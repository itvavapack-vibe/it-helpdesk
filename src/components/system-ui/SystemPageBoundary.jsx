import { Component } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default class SystemPageBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        console.error('System preview page render failed:', error, info);
    }

    componentDidUpdate(previousProps) {
        if (previousProps.pageKey !== this.props.pageKey && this.state.error) this.setState({ error: null });
    }

    render() {
        if (!this.state.error) return this.props.children;
        return <section className="tap-card tap-page-error"><AlertTriangle size={30} /><h1>หน้านี้แสดงผลไม่สำเร็จ</h1><p>{this.state.error?.message || 'เกิดข้อผิดพลาดระหว่างแสดงข้อมูล'}</p><button type="button" className="tap-primary-button" onClick={() => window.location.reload()}><RefreshCw size={17} /> โหลดหน้าใหม่</button></section>;
    }
}
