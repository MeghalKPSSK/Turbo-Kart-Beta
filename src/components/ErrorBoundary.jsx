import { Component, Fragment } from 'react';

// Catches errors anywhere below it so a failure shows a way back instead of a blank page.
export default class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { error: null, attempt: 0 };
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        console.error('Turbo Road League hit an error.', error, info?.componentStack);
    }

    recover = () => {
        this.setState((state) => ({ error: null, attempt: state.attempt + 1 }));
    };

    render() {
        if (!this.state.error) {
            // Changing the key remounts the whole app, which starts again on the home page.
            return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>;
        }
        return (
            <div role="alert" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#14181d', color: '#f4ede4', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
                <div style={{ maxWidth: 460, textAlign: 'center' }}>
                    <p style={{ letterSpacing: '0.2em', fontSize: 12, opacity: 0.7, margin: 0 }}>TURBO ROAD LEAGUE</p>
                    <h1 style={{ margin: '12px 0 8px', fontSize: 32 }}>SOMETHING WENT WRONG</h1>
                    <p style={{ opacity: 0.8, lineHeight: 1.5 }}>{String(this.state.error?.message || this.state.error)}</p>
                    <button
                        onClick={this.recover}
                        style={{ marginTop: 16, padding: '12px 22px', border: 0, borderRadius: 4, background: '#f08a4b', color: '#1b1209', fontWeight: 700, letterSpacing: '0.08em', cursor: 'pointer' }}
                    >
                        BACK TO HOME
                    </button>
                </div>
            </div>
        );
    }
}
