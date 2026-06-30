"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorState } from "./state";

export class ErrorBoundary extends Component<
  Readonly<{ children: ReactNode }>,
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return <ErrorState message={this.state.error.message} />;
    }
    return this.props.children;
  }
}
