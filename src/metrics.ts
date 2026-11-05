interface Metrics {
  meaningfulMs: number | null;
  frameIntervals: number[];
  paintIntervals: number[];
  renderer: string;
  graphics: string;
  gpuIntervals: number[];
  windParticles: number;
  windGpuTimes: number[];
}
declare global {
  interface Window {
    gridWeatherMetrics: Metrics;
  }
}
export const metrics: Metrics = {
  meaningfulMs: null,
  frameIntervals: [],
  paintIntervals: [],
  renderer: 'loading',
  graphics: 'loading',
  gpuIntervals: [],
  windParticles: 0,
  windGpuTimes: [],
};
window.gridWeatherMetrics = metrics;
