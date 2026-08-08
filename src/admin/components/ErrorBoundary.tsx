// @ts-nocheck
import React, { Component, ErrorInfo, ReactNode } from "react";
import { LoggerService } from "../services/logging/LoggerService";

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(_: Error): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error caught by ErrorBoundary:", error, errorInfo);

    LoggerService.logRuntimeError({
      error_message: error.message,
      stack_trace:
        errorInfo.componentStack || error.stack || "No stack trace available",
      context: "ErrorBoundary",
      severity: "critical",
    });
  }

  public render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="p-6 bg-red-50 border border-red-200 rounded-lg m-4">
            <h2 className="text-red-800 text-xl font-bold mb-2">
              সিস্টেমে একটি অপ্রত্যাশিত ত্রুটি ঘটেছে।
            </h2>
            <p className="text-red-600 text-sm">
              আমাদের ইঞ্জিনিয়ারিং টিমকে স্বয়ংক্রিয়ভাবে অবহিত করা হয়েছে এবং
              লগ রেকর্ড করা হয়েছে।
            </p>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
