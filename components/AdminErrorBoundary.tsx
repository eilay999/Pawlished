import React from 'react';

interface Props {
  children?: React.ReactNode;
  /** When this changes, a previously crashed view gets a fresh try (e.g. the user switched tabs). */
  resetKey?: string;
  label?: string;
  /** Render nothing instead of an error card (for side panels that must never disturb the page). */
  silent?: boolean;
}

interface State {
  failed: boolean;
}

// One broken screen must never take down the whole admin app (a missing prop once turned the
// calendar into a white page). The sidebar and the other views keep working.
export class AdminErrorBoundary extends React.Component<Props, State> {
  // The repo ships without @types/react, so declare what the base class would provide.
  declare props: Props;
  declare state: State;
  declare setState: (state: State) => void;

  constructor(props: Props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[admin] view crashed', this.props.label || '', error);
  }

  componentDidUpdate(previous: Props) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  render() {
    if (!this.state.failed) return this.props.children;
    if (this.props.silent) return null;

    return (
      <div className="flex-1 flex items-center justify-center p-6" role="alert">
        <div className="max-w-sm w-full rounded-2xl border border-rose-200 bg-white p-6 text-center shadow-sm">
          <div className="text-lg font-bold text-gray-900">משהו השתבש במסך הזה</div>
          <p className="mt-2 text-sm text-gray-600">שאר המערכת ממשיכה לעבוד. אפשר לנסות שוב או לרענן את הדף.</p>
          <div className="mt-4 flex gap-2 justify-center">
            <button
              type="button"
              className="px-4 py-2 rounded-xl border border-gray-300 bg-white text-sm font-medium text-gray-800 hover:bg-gray-50"
              onClick={() => this.setState({ failed: false })}
            >
              נסו שוב
            </button>
            <button
              type="button"
              className="px-4 py-2 rounded-xl bg-rose-600 text-sm font-medium text-white hover:bg-rose-700"
              onClick={() => window.location.reload()}
            >
              רענון הדף
            </button>
          </div>
        </div>
      </div>
    );
  }
}
