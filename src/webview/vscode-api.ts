declare function acquireVsCodeApi(): {
  postMessage: (message: any) => void;
  getState: () => any;
  setState: (state: any) => void;
};

class VSCodeAPIWrapper {
  private vscodeApi: any;

  constructor() {
    if (typeof acquireVsCodeApi === 'function') {
      this.vscodeApi = acquireVsCodeApi();
    } else {
      // Mock for browser testing
      this.vscodeApi = {
        postMessage: (msg: any) => console.log('Mock postMessage:', msg),
        getState: () => ({}),
        setState: (s: any) => console.log('Mock setState:', s)
      };
    }
  }

  public postMessage(message: any) {
    this.vscodeApi.postMessage(message);
  }
}

export const vscode = new VSCodeAPIWrapper();

