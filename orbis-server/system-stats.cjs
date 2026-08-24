const os = require("node:os");

function finiteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function safeCall(callback, fallback) {
  try {
    const value = callback();
    return value === undefined || value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

function getSystemStats(dependencies = {}) {
  const osApi = dependencies.os || os;
  const processApi = dependencies.process || process;
  const cpus = safeCall(() => osApi.cpus(), []);
  const cpuList = Array.isArray(cpus) ? cpus : [];
  const totalBytes = finiteNumber(safeCall(() => osApi.totalmem(), 0));
  const freeBytes = Math.min(
    totalBytes,
    finiteNumber(safeCall(() => osApi.freemem(), 0)),
  );
  const totalMemNumber = totalBytes / 1024 ** 3;
  const freeMemNumber = freeBytes / 1024 ** 3;
  const usedMemNumber = Math.max(0, totalMemNumber - freeMemNumber);
  const loadAverage = safeCall(() => osApi.loadavg(), [0, 0, 0]);
  const load = Array.isArray(loadAverage) ? loadAverage : [0, 0, 0];
  const uptimeSeconds = finiteNumber(safeCall(() => osApi.uptime(), 0));
  const hours = Math.floor(uptimeSeconds / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  const memoryUsage = safeCall(() => processApi.memoryUsage(), { heapUsed: 0 });
  const processUptime = finiteNumber(safeCall(() => processApi.uptime(), 0));

  return {
    cpuCores: cpuList.length,
    cpuModel:
      typeof cpuList[0]?.model === "string" && cpuList[0].model.trim()
        ? cpuList[0].model.trim().slice(0, 160)
        : "Unavailable",
    arch: String(safeCall(() => osApi.arch(), "unknown")).slice(0, 32),
    platform: String(safeCall(() => osApi.platform(), "unknown"))
      .toUpperCase()
      .slice(0, 32),
    release: String(safeCall(() => osApi.release(), "unknown")).slice(0, 80),
    hostname: "Unavailable",
    load: finiteNumber(load[0]).toFixed(2),
    load5m: finiteNumber(load[1]).toFixed(2),
    load15m: finiteNumber(load[2]).toFixed(2),
    totalMem: totalMemNumber.toFixed(2),
    freeMem: freeMemNumber.toFixed(2),
    usedMem: usedMemNumber.toFixed(2),
    ramUsedPercent:
      totalMemNumber > 0
        ? ((usedMemNumber / totalMemNumber) * 100).toFixed(1)
        : "0.0",
    uptime: `${hours}h ${minutes}m`,
    processUptime: processUptime.toFixed(0),
    heapUsed: (finiteNumber(memoryUsage?.heapUsed) / 1024 ** 2).toFixed(2),
    status: "ONLINE",
  };
}

module.exports = { getSystemStats };
