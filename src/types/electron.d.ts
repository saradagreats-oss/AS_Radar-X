export {};

declare global {
  interface Window {
    asRadarDesktop?: {
      isDesktop: boolean;
      setBrowserBounds(bounds: { x: number; y: number; width: number; height: number }): void;
      showBrowser(url?: string): Promise<any>;
      hideBrowser(): Promise<any>;
      setBrowserTakeover(enabled: boolean): Promise<any>;
      browserStatus(): Promise<any>;
      onBrowserEvent(callback: (payload: any) => void): () => void;
    };
  }
}
