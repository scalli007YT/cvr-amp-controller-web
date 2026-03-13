export {};

declare global {
  interface Window {
    electronWindow?: {
      isDesktop: boolean;
      minimize: () => Promise<boolean>;
      toggleMaximize: () => Promise<boolean>;
      close: () => Promise<boolean>;
      isMaximized: () => Promise<boolean>;
      onMaximizedChange: (callback: (maximized: boolean) => void) => () => void;
    };
  }
}
