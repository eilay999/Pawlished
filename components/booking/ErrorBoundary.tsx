import React from 'react';

interface Props {
  children?: React.ReactNode;
}

interface State {
  failed: boolean;
}

// A blank white page is the worst outcome for a customer mid-booking; show a way out instead.
export class BookingErrorBoundary extends React.Component<Props, State> {
  // The repo ships without @types/react, so declare what the base class would provide.
  declare props: Props;
  declare state: State;

  constructor(props: Props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('Booking page crashed', error);
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <div className="bk-root" dir="rtl">
        <div className="bk-shell">
          <section className="bk-card" role="alert" style={{ textAlign: 'center', marginTop: 48 }}>
            <h1 className="bk-h1">משהו השתבש</h1>
            <p className="bk-sub">רעננו את הדף ונסו שוב. אם זה חוזר, פנו אלינו ונסדר את התור ביחד.</p>
            <button type="button" className="bk-btn bk-btn-primary" onClick={() => window.location.reload()}>
              רענון הדף
            </button>
          </section>
        </div>
      </div>
    );
  }
}
