import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';
import { requestImport } from './lib/ui/importState.svelte';

const app = mount(App, { target: document.getElementById('app')! });

// PWA file handler (manifest file_handlers): "Open with WayPoint" on .gpx
// files lands in the import flow (DESIGN.md §8).
interface LaunchParams {
  files: Array<{ getFile(): Promise<File> }>;
}
interface LaunchQueue {
  setConsumer(cb: (params: LaunchParams) => void): void;
}

const launchQueue = (window as { launchQueue?: LaunchQueue }).launchQueue;
launchQueue?.setConsumer((params) => {
  void (async () => {
    const handle = params.files?.[0];
    if (!handle) return;
    const file = await handle.getFile();
    requestImport(file.name, await file.text());
  })();
});

export default app;
