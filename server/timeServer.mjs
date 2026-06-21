import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Papa from "papaparse";
import { analyzePreparedRows, prepareRows } from "../src/utils/analysis.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const datasetPath =
  process.env.CHOKEPOINT_CSV_PATH ??
  path.join(rootDir, "dataset", "jan to may police violation_anonymized791b166.csv");
const host = process.env.CHOKEPOINT_API_HOST ?? "127.0.0.1";
const port = Number(process.env.CHOKEPOINT_API_PORT ?? 8787);

let datasetName = path.basename(datasetPath);
let rows = [];
const cache = new Map();

function loadDataset() {
  const started = Date.now();
  const csv = fs.readFileSync(datasetPath, "utf8");
  const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });
  rows = prepareRows(parsed.data.filter((row) => Object.keys(row).length > 1));
  cache.clear();
  console.log(
    `[time-engine] loaded ${rows.length.toLocaleString("en-IN")} rows from ${datasetName} in ${Date.now() - started}ms`
  );
  if (parsed.errors?.length) {
    console.log(`[time-engine] parser warnings: ${parsed.errors.length}`);
  }
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function cleanSpot(spot) {
  if (!spot) return spot;
  const {
    rows: _rows,
    vehicleMap: _vehicleMap,
    violationMap: _violationMap,
    stationMap: _stationMap,
    junctionMap: _junctionMap,
    locationMap: _locationMap,
    ...rest
  } = spot;
  return rest;
}

function cleanAnalysis(analysis, meta) {
  const cleanHotspots = analysis.hotspots.map(cleanSpot);
  const byKey = new Map(cleanHotspots.map((spot) => [spot.key, spot]));

  return {
    ...analysis,
    rows: [],
    hotspots: cleanHotspots,
    topHotspots: analysis.topHotspots.map((spot) => byKey.get(spot.key) ?? cleanSpot(spot)),
    actionQueue: analysis.actionQueue.map((spot) => {
      const clean = byKey.get(spot.key) ?? cleanSpot(spot);
      return { ...clean, priorityRank: spot.priorityRank, priority: spot.priority };
    }),
    sensorCandidates: analysis.sensorCandidates.map((spot) => cleanSpot(spot)),
    backend: {
      datasetName,
      rowCount: rows.length,
      generatedAt: new Date().toISOString(),
      cached: meta.cached,
      computeMs: meta.computeMs
    }
  };
}

function analyzeCached(params) {
  const strategy = params.get("strategy") || "balanced";
  const mode = params.get("mode") || "all";
  const simulatedHour = Number(params.get("hour") ?? 9);
  const dayType = params.get("dayType") || "weekday";
  const key = JSON.stringify({ strategy, mode, simulatedHour, dayType });
  const cached = cache.get(key);
  if (cached) return { ...cached, backend: { ...cached.backend, cached: true } };

  const started = Date.now();
  const analysis = analyzePreparedRows(rows, strategy, { mode, simulatedHour, dayType });
  const clean = cleanAnalysis(analysis, { cached: false, computeMs: Date.now() - started });
  cache.set(key, clean);
  return clean;
}

function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === "OPTIONS") return sendJson(res, 204, {});

  try {
    if (req.method === "GET" && url.pathname === "/api/health") {
      return sendJson(res, 200, {
        ok: true,
        datasetName,
        rows: rows.length,
        cacheSize: cache.size,
        endpoints: ["/api/time-analysis"]
      });
    }

    if (req.method === "GET" && url.pathname === "/api/time-analysis") {
      const payload = analyzeCached(url.searchParams);
      return sendJson(res, 200, payload);
    }

    return sendJson(res, 404, { ok: false, error: "Unknown endpoint" });
  } catch (error) {
    console.error("[time-engine] request failed", error);
    return sendJson(res, 500, { ok: false, error: error.message });
  }
}

loadDataset();

http.createServer(handleRequest).listen(port, host, () => {
  console.log(`[time-engine] listening at http://${host}:${port}`);
});
