import React, { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Car,
  ChevronRight,
  Crosshair,
  FileUp,
  Gauge,
  MapPin,
  RadioTower,
  Route,
  ShieldCheck,
  Siren,
  SlidersHorizontal,
  Target,
  Truck,
  UploadCloud
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer } from "react-leaflet";
import { analyzeRows, formatNumber, scoreColor, STRATEGIES, TIME_SHIFTS } from "./utils/analysis";
import { sampleRows } from "./data/sampleRows";

const API_BASE = import.meta.env.VITE_CHOKEPOINT_API ?? "http://127.0.0.1:8787";

const tabs = [
  { id: "overview", label: "Command View", icon: Gauge },
  { id: "hotspots", label: "Hotspots", icon: Crosshair },
  { id: "actions", label: "Actions", icon: Siren },
  { id: "simulator", label: "What-if", icon: SlidersHorizontal },
  { id: "sensors", label: "Sensors", icon: RadioTower },
  { id: "about", label: "About", icon: ShieldCheck }
];

function Card({ children, className = "" }) {
  return <section className={`panel ${className}`}>{children}</section>;
}

function Stat({ icon: Icon, label, value, detail, tone = "signal" }) {
  return (
    <Card className="relative overflow-hidden">
      <div className={`absolute right-4 top-4 h-20 w-20 rounded-full blur-2xl ${toneClass(tone, "soft")}`} />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="label">{label}</p>
          <p className="mt-3 font-display text-3xl font-semibold tracking-normal text-white">{value}</p>
          <p className="mt-2 text-sm text-steel">{detail}</p>
        </div>
        <div className={`icon-box ${toneClass(tone, "box")}`}>
          <Icon size={20} />
        </div>
      </div>
    </Card>
  );
}

function toneClass(tone, kind) {
  const classes = {
    signal: {
      soft: "bg-signal/20",
      box: "border-signal/30 bg-signal/12 text-signal"
    },
    amber: {
      soft: "bg-amberline/20",
      box: "border-amberline/35 bg-amberline/12 text-amberline"
    },
    danger: {
      soft: "bg-dangerline/20",
      box: "border-dangerline/35 bg-dangerline/12 text-dangerline"
    },
    patrol: {
      soft: "bg-patrol/20",
      box: "border-patrol/35 bg-patrol/12 text-patrol"
    }
  };
  return classes[tone]?.[kind] ?? classes.signal[kind];
}

function UploadPanel({ onRows, activeSource, parsing }) {
  const handleUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    onRows({ status: "parsing", fileName: file.name });
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      worker: true,
      complete: (result) => {
        onRows({
          status: "loaded",
          fileName: file.name,
          rows: result.data.filter((row) => Object.keys(row).length > 1),
          errors: result.errors
        });
      },
      error: (error) => {
        onRows({ status: "error", fileName: file.name, error: error.message });
      }
    });
  };

  return (
    <label className="upload-control group">
      <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleUpload} />
      <div className="flex items-center gap-3">
        <div className="icon-box border-white/15 bg-white/8 text-white group-hover:border-signal/40 group-hover:text-signal">
          {parsing ? <Activity className="animate-spin" size={18} /> : <UploadCloud size={18} />}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">{parsing ? "Analyzing CSV..." : "Upload Bengaluru CSV"}</p>
          <p className="truncate text-xs text-steel">{activeSource}</p>
        </div>
      </div>
    </label>
  );
}

function hourLabel(hour) {
  return `${String(hour).padStart(2, "0")}:00`;
}

function TimeLensControl({
  timeLens,
  setTimeLens,
  appliedTimeLens,
  onApply,
  context,
  backendStatus,
  backendMeta,
  preferBackend,
  setPreferBackend
}) {
  const selectedShift = TIME_SHIFTS[context.selectedShift]?.label ?? context.selectedShiftLabel;
  const setField = (key, value) => setTimeLens((current) => ({ ...current, [key]: value }));
  const isAllTimeDraft = timeLens.mode === "all";
  const hasPendingChange =
    timeLens.mode !== appliedTimeLens.mode ||
    timeLens.simulatedHour !== appliedTimeLens.simulatedHour ||
    timeLens.dayType !== appliedTimeLens.dayType;
  const backendLabel =
    backendStatus === "online"
      ? backendMeta?.cached
        ? "Backend cached"
        : "Backend computed"
      : backendStatus === "loading"
        ? "Backend loading"
        : backendStatus === "checking"
          ? "Checking backend"
        : preferBackend
          ? "Local fallback"
          : "Upload mode";

  return (
    <section className="time-lens">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="label">Time Lens</p>
        <h2>{context.mode === "shift" ? "Shift-specific forecast" : "All-time planning view"}</h2>
        <p className="text-xs text-steel">
          {context.mode === "shift"
            ? `${context.analyzedRows} of ${context.totalRows} records match this simulated operating window.`
            : "Using the full dataset to find long-term recurring chokepoints and sensor candidates."}
        </p>
      </div>

      <div className="time-lens-controls">
        <div className="segmented">
          {[
            ["all", "All-time"],
            ["shift", "Shift forecast"]
          ].map(([mode, label]) => (
            <button
              type="button"
              key={mode}
              onClick={() => setField("mode", mode)}
              className={timeLens.mode === mode ? "segmented-active" : ""}
            >
              {label}
            </button>
          ))}
        </div>

        <label className={`time-slider ${isAllTimeDraft ? "time-control-disabled" : ""}`}>
          <span>Simulated hour: <b>{hourLabel(timeLens.simulatedHour)}</b></span>
          <input
            type="range"
            min="0"
            max="23"
            value={timeLens.simulatedHour}
            disabled={isAllTimeDraft}
            onChange={(event) => setField("simulatedHour", Number(event.target.value))}
          />
          <small>{isAllTimeDraft ? "Used only in Shift forecast" : selectedShift}</small>
        </label>

        <div className={`segmented ${isAllTimeDraft ? "time-control-disabled" : ""}`}>
          {[
            ["weekday", "Weekday"],
            ["weekend", "Weekend"],
            ["all", "All days"]
          ].map(([dayType, label]) => (
            <button
              type="button"
              key={dayType}
              onClick={() => setField("dayType", dayType)}
              disabled={isAllTimeDraft}
              className={timeLens.dayType === dayType ? "segmented-active" : ""}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="time-apply-panel">
          <button
            type="button"
            className={`time-apply-button ${hasPendingChange ? "time-apply-button-ready" : ""}`}
            onClick={onApply}
          >
            {hasPendingChange ? "Apply time window" : "Time window applied"}
          </button>
          <button
            type="button"
            className={`backend-chip ${backendStatus === "online" ? "backend-chip-online" : ""}`}
            onClick={() => setPreferBackend(true)}
            title="Use the local backend time engine when it is running."
          >
            {backendLabel}
          </button>
        </div>
      </div>
    </section>
  );
}

function HotspotMap({ hotspots, selectedKey, setSelectedKey }) {
  const center = hotspots[0] ? [hotspots[0].lat, hotspots[0].lng] : [12.9716, 77.5946];
  return (
    <div className="map-shell">
      <MapContainer center={center} zoom={12} scrollWheelZoom className="h-full min-h-[520px] w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {hotspots.slice(0, 90).map((spot) => (
          <CircleMarker
            key={spot.key}
            center={[spot.lat, spot.lng]}
            radius={Math.max(8, Math.min(28, 6 + spot.score / 5 + spot.count / 2))}
            pathOptions={{
              color: scoreColor(spot.score),
              fillColor: scoreColor(spot.score),
              fillOpacity: selectedKey === spot.key ? 0.72 : 0.42,
              opacity: selectedKey === spot.key ? 1 : 0.82,
              weight: selectedKey === spot.key ? 3 : 1.5
            }}
            eventHandlers={{ click: () => setSelectedKey(spot.key) }}
          >
            <Popup>
              <div className="w-64">
                <p className="font-semibold text-slate-950">{spot.riskBand} chokepoint</p>
                <p className="mt-1 text-sm text-slate-700">{spot.topLocation}</p>
                <p className="mt-2 text-sm">
                  Score <b>{spot.score}</b> | Records <b>{spot.count}</b>
                </p>
                <p className="mt-2 text-xs text-slate-600">{spot.action}</p>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
      <div className="map-legend">
        <span className="legend-dot bg-dangerline" /> Critical
        <span className="legend-dot bg-amberline" /> High
        <span className="legend-dot bg-patrol" /> Watch
        <span className="legend-dot bg-signal" /> Emerging
      </div>
    </div>
  );
}

function RankedHotspot({ spot, index, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`hotspot-row text-left ${selected ? "hotspot-row-active" : ""}`}
    >
      <div className="flex items-start gap-3">
        <div className="rank-badge" style={{ borderColor: scoreColor(spot.score), color: scoreColor(spot.score) }}>
          {index + 1}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate font-semibold text-white">{spot.topJunction !== "No Junction" ? spot.topJunction : spot.stationName}</p>
            <span className="score-pill" style={{ color: scoreColor(spot.score), borderColor: scoreColor(spot.score) }}>
              {spot.score}
            </span>
          </div>
          <p className="mt-1 line-clamp-1 text-sm text-steel">{spot.topLocation}</p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <span className="mini-metric">{spot.count} records</span>
            <span className="mini-metric">J-risk {spot.junctionRiskScore}</span>
            <span className="mini-metric">Obstruct {spot.obstructionIndex}</span>
          </div>
          <p className="mt-3 text-xs font-medium text-white/80">{spot.action}</p>
        </div>
      </div>
    </button>
  );
}

function InsightStrip({ analysis }) {
  const top = analysis.topHotspots[0];
  const vehicle = analysis.vehicleStats[0];
  const violation = analysis.violationStats[0];
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="border-dangerline/25">
        <div className="flex items-center gap-3">
          <Siren className="text-dangerline" size={22} />
          <p className="label">Highest Risk Zone</p>
        </div>
        <p className="mt-4 font-display text-xl font-semibold text-white">{top?.topJunction ?? "Awaiting data"}</p>
        <p className="mt-2 text-sm text-steel">
          {top ? `${top.score}/100 impact score, ${top.count} repeated records, ${top.action}.` : "Upload a CSV to reveal hotspots."}
        </p>
      </Card>
      <Card className="border-amberline/25">
        <div className="flex items-center gap-3">
          <Car className="text-amberline" size={22} />
          <p className="label">Priority Vehicle Class</p>
        </div>
        <p className="mt-4 font-display text-xl font-semibold text-white">{vehicle?.name ?? "No vehicle data"}</p>
        <p className="mt-2 text-sm text-steel">
          {vehicle ? `${vehicle.share}% of records. Obstruction weight ${vehicle.weight.toFixed(2)}x.` : "Vehicle mix will appear after parsing."}
        </p>
      </Card>
      <Card className="border-signal/25">
        <div className="flex items-center gap-3">
          <AlertTriangle className="text-signal" size={22} />
          <p className="label">Dominant Violation</p>
        </div>
        <p className="mt-4 font-display text-xl font-semibold text-white">{violation?.name ?? "No violation data"}</p>
        <p className="mt-2 text-sm text-steel">
          {violation ? `${formatNumber(violation.count)} mentions. Severity weight ${violation.weight.toFixed(2)}x.` : "Violation severity powers the score."}
        </p>
      </Card>
    </div>
  );
}

function DecisionBriefing({ analysis, selectedSpot, setSelectedKey }) {
  const top = selectedSpot ?? analysis.topHotspots[0];
  const nextActions = analysis.actionQueue.slice(0, 3);
  return (
    <Card className="command-brief">
      <div className="section-heading">
        <div>
          <p className="label">Operational Briefing</p>
          <h2>Illegal parking zones ranked by expected traffic disruption</h2>
        </div>
        <div className="status-chip border-dangerline/30 text-dangerline">
          {analysis.metrics.criticalHotspots} critical chokepoint{analysis.metrics.criticalHotspots === 1 ? "" : "s"}
        </div>
      </div>
      <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_1.2fr]">
        <div className="brief-primary">
          <div className="flex items-center gap-3">
            <Siren className="text-dangerline" size={24} />
            <p className="label">Act First</p>
          </div>
          <h3 className="mt-4 font-display text-3xl font-semibold text-white">{top?.topJunction ?? top?.stationName}</h3>
          <p className="mt-2 text-sm text-steel">{top?.topLocation}</p>
          <div className="mt-5 grid grid-cols-3 gap-2 text-xs">
            <span className="mini-metric">Score {top?.score}</span>
            <span className="mini-metric">J-risk {top?.junctionRiskScore}</span>
            <span className="mini-metric">Obstruct {top?.obstructionIndex}</span>
          </div>
          <p className="mt-4 rounded-md border border-dangerline/25 bg-dangerline/10 p-3 text-sm font-medium text-white">
            {top?.action}
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {nextActions.map((spot) => (
            <button
              type="button"
              className="brief-action"
              key={spot.key}
              onClick={() => setSelectedKey(spot.key)}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="status-chip">{spot.priority}</span>
                <span className="score-pill" style={{ color: scoreColor(spot.score), borderColor: scoreColor(spot.score) }}>
                  {spot.score}
                </span>
              </div>
              <p className="mt-3 line-clamp-1 font-semibold text-white">{spot.actionType}</p>
              <p className="mt-2 line-clamp-1 text-sm text-steel">{spot.stationName}</p>
              <p className="mt-3 text-xs text-white/72">{spot.resources.policeUnits} police unit{spot.resources.policeUnits === 1 ? "" : "s"} | {spot.resources.towVehicles} tow | target response {spot.resources.responseSla}</p>
            </button>
          ))}
        </div>
      </div>
    </Card>
  );
}

function Overview({ analysis, selectedSpot, setSelectedKey }) {
  return (
    <div className="grid gap-5">
      <div className="grid gap-4 md:grid-cols-3">
        <Stat
          icon={FileUp}
          label={analysis.timeContext.mode === "shift" ? "Records In Time Window" : "Analyzed Records"}
          value={formatNumber(analysis.metrics.totalRecords)}
          detail={analysis.timeContext.mode === "shift" ? `${formatNumber(analysis.metrics.totalSourceRecords)} total records available` : "CSV rows converted into enforcement signals"}
          tone="signal"
        />
        <Stat icon={Crosshair} label="Micro Hotspots" value={formatNumber(analysis.metrics.hotspotCount)} detail="Clustered by ~100m geospatial grid" tone="danger" />
        <Stat icon={Route} label="Junction Sensitive" value={`${analysis.metrics.junctionSensitiveShare}%`} detail="Near crossings, junctions, signals, bus stops, or main roads" tone="amber" />
      </div>

      <DecisionBriefing analysis={analysis} selectedSpot={selectedSpot} setSelectedKey={setSelectedKey} />

      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <ShiftForecastPanel analysis={analysis} setSelectedKey={setSelectedKey} />
        <Card>
          <div className="section-heading">
            <div>
              <p className="label">Historical Day-Hour Risk</p>
              <h2>When parking-induced chokepoints usually appear</h2>
            </div>
            <div className="status-chip">IST calendar pattern</div>
          </div>
          <div className="mt-4">
            <DayHourHeatmap
              matrix={analysis.dayHourMatrix}
              maxCount={analysis.maxDayHourCount}
              selectedHour={analysis.timeContext.selectedHour}
            />
          </div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_0.8fr]">
        <Card className="p-0">
          <div className="section-heading px-5 pt-5">
            <div>
              <p className="label">Bengaluru Chokepoint Map</p>
              <h2>Live risk surface from illegal parking records</h2>
            </div>
            <div className="status-chip">OpenStreetMap + dataset clusters</div>
          </div>
          <HotspotMap hotspots={analysis.hotspots} selectedKey={selectedSpot?.key} setSelectedKey={setSelectedKey} />
        </Card>

        <Card>
          <div className="section-heading">
            <div>
              <p className="label">Ranked Chokepoints</p>
              <h2>Priority response queue</h2>
            </div>
          </div>
          <div className="mt-4 grid gap-3">
            {analysis.topHotspots.slice(0, 6).map((spot, index) => (
              <RankedHotspot
                key={spot.key}
                spot={spot}
                index={index}
                selected={selectedSpot?.key === spot.key}
                onSelect={() => setSelectedKey(spot.key)}
              />
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <ChartCard title="Police Station Load" label="where enforcement demand concentrates">
          <div className="space-y-4">
            {analysis.stationStats.slice(0, 7).map((station) => (
              <div key={station.name}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="truncate text-white">{station.name}</span>
                  <span className="text-steel">{station.share}%</span>
                </div>
                <div className="h-2 rounded-full bg-white/8">
                  <div className="h-2 rounded-full bg-gradient-to-r from-patrol to-signal" style={{ width: `${Math.min(100, station.share * 8)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </ChartCard>
        <ChartCard title="Vehicle Obstruction Mix" label="tow need vs officer clearing">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={analysis.vehicleStats.slice(0, 7)} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.08)" horizontal={false} />
              <XAxis type="number" hide />
              <YAxis dataKey="name" type="category" width={116} tick={{ fill: "#cbd5e1", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="count" fill="#ffbd3d" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Violation Severity Drivers" label="what creates disruption risk">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={analysis.violationStats.slice(0, 7)} layout="vertical" margin={{ left: 28 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.08)" horizontal={false} />
              <XAxis type="number" hide />
              <YAxis dataKey="name" type="category" width={132} tick={{ fill: "#cbd5e1", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="count" fill="#19f0c4" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

function ChartCard({ title, label, children, className = "" }) {
  return (
    <Card className={className}>
      <div className="section-heading">
        <div>
          <p className="label">{label}</p>
          <h2>{title}</h2>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </Card>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-white/15 bg-asphalt/95 px-3 py-2 text-sm shadow-panel">
      <p className="font-semibold text-white">{label}</p>
      <p className="text-signal">{formatNumber(payload[0].value)} records</p>
    </div>
  );
}

function DayHourHeatmap({ matrix, maxCount, selectedHour }) {
  return (
    <div className="day-hour-grid">
      <div className="day-hour-header">
        <span />
        <div>
          {[0, 4, 8, 12, 16, 20, 23].map((hour) => (
            <b key={hour}>{hour}</b>
          ))}
        </div>
      </div>
      {matrix.map((row) => (
        <div className="day-hour-row" key={row.day}>
          <span>{row.day}</span>
          <div className="day-hour-cells">
            {row.hours.map((cell) => {
              const intensity = Math.min(1, cell.count / Math.max(maxCount, 1));
              return (
                <div
                  key={`${row.day}-${cell.hour}`}
                  title={`${row.day} ${hourLabel(cell.hour)}: ${formatNumber(cell.count)} records`}
                  className={`day-hour-cell ${cell.hour === selectedHour ? "day-hour-selected" : ""}`}
                  style={{ backgroundColor: `rgba(25, 240, 196, ${0.08 + intensity * 0.72})` }}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function ShiftForecastPanel({ analysis, setSelectedKey }) {
  return (
    <Card>
      <div className="section-heading">
        <div>
          <p className="label">Likely Active This Time Window</p>
          <h2>{analysis.timeContext.label}</h2>
        </div>
        {analysis.timeContext.usingFallback && <div className="status-chip border-amberline/30 text-amberline">broadened sample</div>}
      </div>
      <div className="mt-4 grid gap-3">
        {analysis.likelyActive.slice(0, 4).map((spot, index) => (
          <button type="button" className="forecast-row" key={spot.key} onClick={() => setSelectedKey(spot.key)}>
            <span className="rank-badge">{index + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <p className="truncate font-semibold text-white">{spot.topJunction !== "No Junction" ? spot.topJunction : spot.stationName}</p>
                <span className="score-pill" style={{ color: scoreColor(spot.score), borderColor: scoreColor(spot.score) }}>{spot.score}</span>
              </div>
              <p className="mt-1 text-xs text-steel">{spot.forecastReason}</p>
            </div>
          </button>
        ))}
      </div>
    </Card>
  );
}

function ScoreBreakdown({ breakdown }) {
  return (
    <div className="score-breakdown">
      {breakdown?.map((item) => (
        <div key={item.name}>
          <div className="mb-1 flex items-center justify-between gap-2 text-xs">
            <span className="text-steel">{item.name}</span>
            <span className="font-semibold text-white">{item.value}/{item.max}</span>
          </div>
          <div className="h-2 rounded-full bg-white/8">
            <div
              className="h-2 rounded-full bg-gradient-to-r from-patrol via-signal to-amberline"
              style={{ width: `${Math.min(100, (item.value / Math.max(item.max, 1)) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function Hotspots({ analysis, selectedSpot, setSelectedKey }) {
  const spot = selectedSpot ?? analysis.topHotspots[0];
  return (
    <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      <Card>
        <div className="section-heading">
          <div>
            <p className="label">Hotspot Command Queue</p>
            <h2>Ranked by Chokepoint Impact Score</h2>
          </div>
        </div>
        <div className="mt-5 grid gap-3">
          {analysis.topHotspots.map((item, index) => (
            <RankedHotspot
              key={item.key}
              spot={item}
              index={index}
              selected={spot?.key === item.key}
              onSelect={() => setSelectedKey(item.key)}
            />
          ))}
        </div>
      </Card>

      <div className="grid gap-5">
        <Card className="border-dangerline/25">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="label">Selected Chokepoint</p>
              <h2 className="mt-2 font-display text-3xl font-semibold text-white">{spot?.topJunction}</h2>
              <p className="mt-2 max-w-2xl text-sm text-steel">{spot?.topLocation}</p>
            </div>
            <div className="impact-dial" style={{ borderColor: scoreColor(spot?.score ?? 0), color: scoreColor(spot?.score ?? 0) }}>
              <span>{spot?.score}</span>
              <small>{spot?.riskBand}</small>
            </div>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {spot?.reasons.map((reason) => (
              <div className="reason-tile" key={reason}>
                <ChevronRight size={16} className="text-signal" />
                <span>{reason}</span>
              </div>
            ))}
          </div>
          <div className="mt-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="label">Impact Score Breakdown</p>
              <span className="status-chip">explainable ranking</span>
            </div>
            <ScoreBreakdown breakdown={spot?.scoreBreakdown} />
          </div>
          <div className="mt-6 rounded-md border border-dangerline/25 bg-dangerline/10 p-4">
            <div className="flex items-center gap-3">
              <Truck className="text-dangerline" size={22} />
              <p className="font-semibold text-white">Recommended police action</p>
            </div>
            <p className="mt-2 text-sm text-white/78">{spot?.action}</p>
            <p className="mt-2 text-xs text-steel">
              Vehicle-size logic: {spot?.needsTow ? `${spot?.dominantVehicleClass} vehicles create ${spot?.towNeedIndex}/100 tow need.` : `${spot?.dominantVehicleClass} vehicles create ${spot?.officerNeedIndex}/100 officer clearing need, so tow is not the first response.`}
            </p>
          </div>
        </Card>

        <div className="grid gap-5 lg:grid-cols-2">
          <ChartCard title="Priority Vehicles" label="selected hotspot">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={spot?.topVehicles ?? []} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={104} tick={{ fill: "#cbd5e1", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                  {(spot?.topVehicles ?? []).map((_, index) => (
                    <Cell key={index} fill={index === 0 ? "#ffbd3d" : "#5ea1ff"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Violation Mix" label="selected hotspot">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={spot?.topViolations ?? []} layout="vertical" margin={{ left: 36 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={132} tick={{ fill: "#cbd5e1", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="count" fill="#19f0c4" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </div>
    </div>
  );
}

function RerouteMap({ spot }) {
  if (!spot) return null;
  const blockedLine = [
    [spot.lat - 0.0054, spot.lng - 0.0046],
    [spot.lat, spot.lng],
    [spot.lat + 0.0054, spot.lng + 0.0046]
  ];
  return (
    <div className="reroute-map">
      <MapContainer
        key={spot.key}
        center={[spot.lat, spot.lng]}
        zoom={15}
        scrollWheelZoom
        className="h-full min-h-[360px] w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Polyline positions={blockedLine} pathOptions={{ color: "#ff4d6d", weight: 6, opacity: 0.72 }} />
        {spot.alternateRoutes?.map((route, index) => (
          <Polyline
            key={route.name}
            positions={route.coordinates}
            pathOptions={{
              color: index === 0 ? "#19f0c4" : "#5ea1ff",
              weight: 5,
              dashArray: index === 0 ? undefined : "8 8",
              opacity: 0.86
            }}
          />
        ))}
        <CircleMarker
          center={[spot.lat, spot.lng]}
          radius={12}
          pathOptions={{ color: "#ffffff", fillColor: scoreColor(spot.score), fillOpacity: 0.8, weight: 2 }}
        >
          <Popup>
            <div className="w-56">
              <p className="font-semibold text-slate-950">Blocked chokepoint</p>
              <p className="mt-1 text-xs text-slate-600">{spot.topLocation}</p>
            </div>
          </Popup>
        </CircleMarker>
      </MapContainer>
      <div className="route-legend">
        <span><i className="bg-dangerline" /> blocked approach</span>
        <span><i className="bg-signal" /> diversion A</span>
        <span><i className="bg-patrol" /> diversion B</span>
      </div>
    </div>
  );
}

function RecommendedActions({ analysis, selectedSpot, setSelectedKey }) {
  const spot = analysis.actionQueue.find((item) => item.key === selectedSpot?.key) ?? analysis.actionQueue[0];
  return (
    <div className="grid gap-5 xl:grid-cols-[0.95fr_1.25fr]">
      <Card>
        <div className="section-heading">
          <div>
            <p className="label">Recommended Actions</p>
            <h2>Priority queue for targeted enforcement</h2>
          </div>
          <div className="status-chip">problem-response view</div>
        </div>
        <div className="mt-5 grid gap-3">
          {analysis.actionQueue.slice(0, 12).map((item) => (
            <button
              type="button"
              key={item.key}
              onClick={() => setSelectedKey(item.key)}
              className={`action-row ${spot?.key === item.key ? "action-row-active" : ""}`}
            >
              <div className="flex items-start gap-3">
                <span className={`priority-badge priority-${item.priority.toLowerCase()}`}>{item.priority}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate font-semibold text-white">{item.actionType}</p>
                    <span className="score-pill" style={{ color: scoreColor(item.score), borderColor: scoreColor(item.score) }}>{item.score}</span>
                  </div>
                  <p className="mt-1 line-clamp-1 text-sm text-steel">{item.topJunction !== "No Junction" ? item.topJunction : item.stationName}</p>
                  <p className="mt-3 text-xs text-white/72">{item.actionRationale}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </Card>

      <div className="grid gap-5">
        <Card className="border-dangerline/25">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="label">Selected Response</p>
              <h2 className="mt-2 font-display text-3xl font-semibold text-white">{spot?.actionType}</h2>
              <p className="mt-2 max-w-3xl text-sm text-steel">{spot?.topLocation}</p>
            </div>
            <div className="impact-dial" style={{ borderColor: scoreColor(spot?.score ?? 0), color: scoreColor(spot?.score ?? 0) }}>
              <span>{spot?.score}</span>
              <small>{spot?.priority}</small>
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <span className="action-metric">Police units <b>{spot?.resources.policeUnits}</b></span>
            <span className="action-metric">Tow vehicles <b>{spot?.resources.towVehicles}</b></span>
            <span className="action-metric">Target response <b>{spot?.resources.responseSla}</b></span>
            <span className="action-metric">Impact if cleared <b>{spot?.expectedImpactReduction}%</b></span>
          </div>
          <div className="mt-5 rounded-md border border-white/10 bg-black/20 p-4">
            <p className="font-semibold text-white">{spot?.action}</p>
            <p className="mt-2 text-sm text-steel">{spot?.actionRationale}</p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <span className="mini-metric">Status: {spot?.dispatchStatus}</span>
              <span className="mini-metric">Estimated clearing time: {spot?.resources.handlingMinutes} min</span>
              <span className="mini-metric">Reroute: {spot?.needsReroute ? "trace alternates" : "monitor"}</span>
            </div>
            <p className="mt-3 text-xs text-steel">
              Tow reasoning: {spot?.needsTow ? `Tow is justified because the dominant mix is ${spot?.dominantVehicleClass}, with ${spot?.towNeedIndex}/100 tow need.` : `Tow is deprioritized because the dominant mix is ${spot?.dominantVehicleClass}; officer clearing need is ${spot?.officerNeedIndex}/100.`}
            </p>
          </div>
        </Card>

        <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <Card>
            <div className="section-heading">
              <div>
                <p className="label">Why This Priority</p>
                <h2>Score contribution</h2>
              </div>
            </div>
            <div className="mt-4">
              <ScoreBreakdown breakdown={spot?.scoreBreakdown} />
            </div>
            <div className="mt-5">
              <p className="label">Closed-loop response</p>
              <div className="mt-3 grid gap-2">
                {[
                  ["Detect", "Hotspot or sensor threshold crossed"],
                  ["Assign", `${spot?.resources.policeUnits} police unit${spot?.resources.policeUnits === 1 ? "" : "s"}${spot?.resources.towVehicles ? " + tow vehicle" : ""}`],
                  ["Clear", `${spot?.expectedImpactReduction}% local risk reduction expected`],
                  ["Learn", "Outcome feeds future hotspot priority"]
                ].map(([step, text]) => (
                  <div className="dispatch-step" key={step}>
                    <b>{step}</b>
                    <span>{text}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-5 grid gap-2">
              {spot?.alternateRoutes?.map((route) => (
                <div className="route-option" key={route.name}>
                  <div>
                    <p className="font-semibold text-white">{route.name}: {route.label}</p>
                    <p className="mt-1 text-xs text-steel">{route.clearance}</p>
                  </div>
                  <span className="status-chip">{route.delay}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-0">
            <div className="section-heading px-5 pt-5">
              <div>
                <p className="label">Critical Scenario Routing</p>
                <h2>Alternate diversion trace</h2>
              </div>
            </div>
            <RerouteMap spot={spot} />
          </Card>
        </div>
      </div>
    </div>
  );
}

function buildResourcePlan(hotspots, strategyKey, constraints) {
  const strategyMultiplier = {
    balanced: (spot) => spot.score,
    heavy: (spot) => spot.score + spot.obstructionIndex * 0.22,
    junction: (spot) => spot.score + spot.junctionRiskScore * 0.26
  };
  const candidates = [...hotspots]
    .sort((a, b) => (strategyMultiplier[strategyKey]?.(b) ?? b.score) - (strategyMultiplier[strategyKey]?.(a) ?? a.score))
    .slice(0, 36);
  let patrolMinutes = constraints.patrolUnits * constraints.shiftHours * 60;
  let towSlots = constraints.towVehicles * Math.max(1, Math.floor(constraints.shiftHours * 0.85));
  const assigned = [];
  const deferred = [];

  candidates.forEach((spot) => {
    const minutes = spot.resources.handlingMinutes;
    const needsTow = spot.resources.towVehicles > 0;
    const canPatrol = patrolMinutes >= minutes;
    const canTow = !needsTow || towSlots > 0;
    if (canPatrol && canTow) {
      assigned.push(spot);
      patrolMinutes -= minutes;
      if (needsTow) towSlots -= 1;
    } else {
      deferred.push({ ...spot, blockedBy: !canPatrol ? "police capacity" : "tow capacity" });
    }
  });

  const targetScore = assigned.reduce((sum, spot) => sum + spot.score, 0);
  const totalScore = candidates.reduce((sum, spot) => sum + spot.score, 0) || 1;
  const criticalDeferred = deferred.filter((spot) => spot.score >= 80).length;
  const towDemand = candidates.filter((spot) => spot.resources.towVehicles > 0).length;

  return {
    assigned,
    deferred,
    coverage: Math.round((assigned.length / Math.max(candidates.length, 1)) * 100),
    riskReduction: Math.round(Math.min(68, (targetScore / totalScore) * 52 + assigned.filter((spot) => spot.needsReroute).length * 3)),
    criticalDeferred,
    towDemand,
    towCovered: towDemand - deferred.filter((spot) => spot.resources.towVehicles > 0).length,
    patrolMinutesRemaining: Math.max(0, Math.round(patrolMinutes)),
    bottleneck: criticalDeferred > 0 ? "critical zones left open" : deferred.some((spot) => spot.blockedBy === "tow capacity") ? "tow capacity" : deferred.some((spot) => spot.blockedBy === "police capacity") ? "police capacity" : "none"
  };
}

function Simulator({ analysis, strategyKey, setStrategyKey }) {
  const [constraints, setConstraints] = useState({ patrolUnits: 3, towVehicles: 1, shiftHours: 2 });
  const plan = useMemo(
    () => buildResourcePlan(analysis.actionQueue, strategyKey, constraints),
    [analysis.actionQueue, strategyKey, constraints]
  );
  const updateConstraint = (key, value) => {
    setConstraints((current) => ({ ...current, [key]: Number(value) }));
  };

  return (
    <div className="grid gap-5">
      <Card>
        <div className="section-heading">
          <div>
            <p className="label">Resource-Constrained Simulator</p>
            <h2>Allocate limited police units and tow vehicles to the highest-impact chokepoints</h2>
          </div>
          <div className="status-chip">operational constraints enabled</div>
        </div>
        <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="grid gap-3 lg:grid-cols-3">
            {Object.entries(STRATEGIES).map(([key, strategy]) => (
              <button
                key={key}
                type="button"
                onClick={() => setStrategyKey(key)}
                className={`strategy-card ${strategyKey === key ? "strategy-card-active" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-white">{strategy.label}</p>
                  <Target size={18} className={strategyKey === key ? "text-signal" : "text-steel"} />
                </div>
                <p className="mt-3 text-sm text-steel">{strategy.focus}</p>
              </button>
            ))}
          </div>
          <div className="constraint-panel">
            {[
              ["patrolUnits", "Police units", 1, 16],
              ["towVehicles", "Tow vehicles", 0, 8],
              ["shiftHours", "Shift hours", 1, 8]
            ].map(([key, label, min, max]) => (
              <label className="constraint-control" key={key}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span>{label}</span>
                  <b>{constraints[key]}</b>
                </div>
                <input
                  type="range"
                  min={min}
                  max={max}
                  value={constraints[key]}
                  onChange={(event) => updateConstraint(key, event.target.value)}
                />
              </label>
            ))}
          </div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-4">
        <Stat icon={Activity} label="Hotspots Covered" value={`${plan.coverage}%`} detail={`${plan.assigned.length} assigned, ${plan.deferred.length} deferred`} tone="signal" />
        <Stat icon={AlertTriangle} label="Risk Reduction" value={`${plan.riskReduction}%`} detail="estimated from assigned score mass" tone="danger" />
        <Stat icon={Truck} label="Tow Coverage" value={`${plan.towCovered}/${plan.towDemand}`} detail="tow-required hotspots served" tone="amber" />
        <Stat icon={Route} label="Bottleneck" value={plan.bottleneck} detail={`${plan.criticalDeferred} critical zones deferred`} tone="patrol" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <Card>
          <div className="section-heading">
            <div>
              <p className="label">Assigned This Shift</p>
              <h2>Highest-value coverage under current constraints</h2>
            </div>
            <div className="status-chip">{plan.patrolMinutesRemaining} patrol min left</div>
          </div>
          <div className="mt-5 grid gap-3">
            {plan.assigned.slice(0, 8).map((spot, index) => (
              <div className="allocation-row" key={spot.key}>
                <span className="rank-badge">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-white">{spot.topJunction !== "No Junction" ? spot.topJunction : spot.stationName}</p>
                  <p className="mt-1 text-xs text-steel">{spot.actionType} | {spot.resources.policeUnits} police | {spot.resources.towVehicles} tow | clear ~{spot.resources.handlingMinutes} min | target response {spot.resources.responseSla}</p>
                </div>
                <span className="score-pill" style={{ color: scoreColor(spot.score), borderColor: scoreColor(spot.score) }}>{spot.score}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="section-heading">
            <div>
              <p className="label">Deferred Risk</p>
              <h2>What cannot be covered with current resources</h2>
            </div>
          </div>
          <div className="mt-5 grid gap-3">
            {plan.deferred.slice(0, 8).map((spot) => (
              <div className="allocation-row allocation-row-deferred" key={spot.key}>
                <span className={`priority-badge ${spot.score >= 80 ? "priority-p1" : "priority-p2"}`}>{spot.score >= 80 ? "P1" : "P2"}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-white">{spot.topJunction !== "No Junction" ? spot.topJunction : spot.stationName}</p>
                  <p className="mt-1 text-xs text-steel">Blocked by {spot.blockedBy} | {spot.actionType}</p>
                </div>
                <span className="score-pill" style={{ color: scoreColor(spot.score), borderColor: scoreColor(spot.score) }}>{spot.score}</span>
              </div>
            ))}
            {!plan.deferred.length && <p className="rounded-md border border-signal/20 bg-signal/10 p-4 text-sm text-signal">All priority chokepoints are covered by this shift plan.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Sensors({ analysis }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
      <Card>
        <div className="section-heading">
          <div>
            <p className="label">Future Sensor Deployment</p>
            <h2>Deploy curbside true/false occupancy sensors where response value is highest</h2>
          </div>
        </div>
        <div className="mt-5 grid gap-3">
          {analysis.sensorCandidates.map((spot, index) => (
            <div className="sensor-row" key={spot.key}>
              <div className="flex items-start gap-3">
                <div className="sensor-rank">{index + 1}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-white">{spot.topJunction !== "No Junction" ? spot.topJunction : spot.stationName}</p>
                    <span className="status-chip">{spot.sensorPriority}/100 priority</span>
                  </div>
                  <p className="mt-1 text-sm text-steel">{spot.topLocation}</p>
                  <div className="mt-3 grid gap-2 text-xs md:grid-cols-3">
                    <span className="mini-metric">{spot.sensorType}</span>
                    <span className="mini-metric">{spot.dwellThreshold} dwell trigger</span>
                    <span className="mini-metric">{spot.count} historic records</span>
                  </div>
                  <p className="mt-3 rounded-md border border-white/10 bg-black/20 p-3 text-xs text-white/76">
                    {spot.alertRule}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card className="sensor-diagram">
        <p className="label">Sensor Response Logic</p>
        <h2 className="mt-2 font-display text-2xl font-semibold text-white">From curbside occupancy to faster police action</h2>
        <div className="mt-6 space-y-4">
          {[
            ["1", "Sensor detects parked vehicle at known chokepoint"],
            ["2", "Dwell threshold changes by impact score, junction risk, and vehicle obstruction"],
            ["3", "Heavy or large vehicles escalate toward tow; small vehicles escalate toward officer clearing"],
            ["4", "Dispatch board receives alert, action type, response deadline, and expected clearance impact"]
          ].map(([step, text]) => (
            <div className="flow-step" key={step}>
              <span>{step}</span>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function AboutPage() {
  const calculations = [
    ["Chokepoint Impact Score", "0-100 score combining repeated violations, violation severity, vehicle obstruction, junction risk, recurrence, station load, and validation confidence."],
    ["Junction Risk", "Higher near junctions, road crossings, traffic lights, bus stops, schools, hospitals, and main-road parking violations."],
    ["Obstruction Index", "Measures how much the vehicle mix can reduce usable carriageway width. Heavy and large vehicles score higher than two-wheelers."],
    ["Tow Need", "Raised when cars, autos, cabs, goods vehicles, buses, tankers, or other larger vehicles dominate the hotspot."],
    ["Officer Clearing Need", "Raised when the hotspot is mostly scooters, motorcycles, mopeds, or non-tow situations where rapid officer presence is more useful."],
    ["Time Lens", "Uses created_datetime to switch between all-time hotspot discovery and shift-specific operational forecasting."],
    ["Backend Time Engine", "For the full CSV, a local Node API loads records once and caches each hour, shift, day-type, and strategy combination."],
    ["Likely Active This Shift", "Ranks hotspots that historically occurred in the selected simulated hour, shift, and weekday/weekend context."],
    ["Respond Within", "A simple priority deadline: critical hotspots should be responded to fastest; lower-risk hotspots can wait longer."],
    ["Estimated Clearing Time", "Operational time consumed by an action. Tow actions take longer than officer-led clearing and are used by the simulator."],
    ["Sensor Dwell Trigger", "How long a future curbside sensor can stay occupied before creating an alert. Critical junctions get shorter thresholds."]
  ];

  const backendPlan = [
    ["API layer", "Keep CSV parsing, hotspot scoring, action generation, and shift forecasts behind endpoints instead of recomputing them in the browser."],
    ["Geospatial database", "Use PostgreSQL + PostGIS for clustering, distance queries, police-station boundaries, and sensor placement history."],
    ["Better clustering", "Replace coordinate rounding with DBSCAN, H3, geohash, or road-network-aware clustering."],
    ["Live sensors", "Ingest true/false curbside occupancy events with sensor ID, location, timestamp, dwell duration, and optional vehicle class."],
    ["Dispatch workflow", "Persist action status: pending, assigned, en route, cleared, needs tow, deferred, and learned outcome."],
    ["Routing engine", "Replace prototype diversion traces with OSRM, Valhalla, Google Routes, or city traffic-control routing rules."],
    ["Feedback learning", "Use cleared/uncleared outcomes, repeat violations, response time, and future congestion data to recalibrate scores."]
  ];

  return (
    <div className="grid gap-5">
      <Card className="method-card">
        <p className="label">About ChokepointIQ</p>
        <h2 className="mt-2 font-display text-3xl font-semibold text-white">From parking violation records to congestion-aware enforcement decisions</h2>
        <p className="mt-4 text-steel">
          This prototype answers a more useful question than "where did violations happen?" It estimates which illegal
          parking hotspots are most likely to choke traffic, what action should be taken first, how limited police and
          tow resources should be allocated, and where future curbside occupancy sensors should be placed.
        </p>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <div className="about-pill">Current demo: React dashboard + local time API</div>
          <div className="about-pill">Input: backend CSV, uploaded CSV, or sample data</div>
          <div className="about-pill">Output: ranked actions and sensor plan</div>
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <div className="section-heading">
            <div>
              <p className="label">Prototype Calculations</p>
              <h2>What the current prototype calculates</h2>
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {calculations.map(([title, text]) => (
              <div className="factor-tile" key={title}>
                <p className="font-semibold text-white">{title}</p>
                <p className="mt-2 text-sm text-steel">{text}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="section-heading">
            <div>
              <p className="label">Backend Plan</p>
              <h2>How this becomes a real deployment</h2>
            </div>
          </div>
          <div className="mt-5 grid gap-3">
            {backendPlan.map(([title, text]) => (
              <div className="factor-tile" key={title}>
                <p className="font-semibold text-white">{title}</p>
                <p className="mt-2 text-sm text-steel">{text}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <div className="section-heading">
          <div>
            <p className="label">Why This Solves The Problem</p>
            <h2>The system closes the gap between visibility and action</h2>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-4">
          {[
            ["Detect", "Cluster repeated illegal parking locations from geotagged violations."],
            ["Prioritize", "Convert hotspots into impact scores using obstruction, junction, recurrence, and validation signals."],
            ["Act", "Recommend tow, officer clearing, patrol, reroute, or sensor deployment based on the hotspot pattern."],
            ["Improve", "Future backend stores outcomes and recalibrates risk from dispatch and sensor feedback."]
          ].map(([title, text]) => (
            <div className="factor-tile" key={title}>
              <p className="font-semibold text-white">{title}</p>
              <p className="mt-2 text-sm text-steel">{text}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

export default function App() {
  const [rawRows, setRawRows] = useState(sampleRows);
  const [source, setSource] = useState("Sample Bengaluru parking violations");
  const [parseState, setParseState] = useState("idle");
  const [activeTab, setActiveTab] = useState("overview");
  const [strategyKey, setStrategyKey] = useState("balanced");
  const [selectedKey, setSelectedKey] = useState(null);
  const [timeLens, setTimeLens] = useState({ mode: "all", simulatedHour: 9, dayType: "weekday" });
  const [draftTimeLens, setDraftTimeLens] = useState(timeLens);
  const [serverAnalysis, setServerAnalysis] = useState(null);
  const [backendStatus, setBackendStatus] = useState("checking");
  const [preferBackend, setPreferBackend] = useState(true);

  useEffect(() => {
    if (!preferBackend) {
      setServerAnalysis(null);
      setBackendStatus("offline");
      return undefined;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({
      strategy: strategyKey,
      mode: timeLens.mode,
      hour: String(timeLens.simulatedHour),
      dayType: timeLens.dayType
    });

    setBackendStatus((current) => (current === "online" ? "loading" : "checking"));
    fetch(`${API_BASE}/api/time-analysis?${params.toString()}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Backend returned ${response.status}`);
        return response.json();
      })
      .then((payload) => {
        setServerAnalysis(payload);
        setBackendStatus("online");
      })
      .catch((error) => {
        if (error.name === "AbortError") return;
        setServerAnalysis(null);
        setBackendStatus("offline");
      });

    return () => controller.abort();
  }, [preferBackend, strategyKey, timeLens]);

  const analysis = useMemo(() => {
    if (preferBackend && serverAnalysis) return serverAnalysis;
    return analyzeRows(rawRows, strategyKey, timeLens);
  }, [preferBackend, rawRows, serverAnalysis, strategyKey, timeLens]);

  const selectedSpot = useMemo(
    () => analysis.hotspots.find((spot) => spot.key === selectedKey) ?? analysis.topHotspots[0],
    [analysis.hotspots, analysis.topHotspots, selectedKey]
  );
  const displaySource =
    preferBackend && serverAnalysis?.backend
      ? `Backend: ${serverAnalysis.backend.datasetName} | ${formatNumber(serverAnalysis.backend.rowCount)} records`
      : source;

  const handleRows = (payload) => {
    if (payload.status === "parsing") {
      setParseState("parsing");
      setSource(payload.fileName);
      return;
    }
    if (payload.status === "loaded") {
      setRawRows(payload.rows.length ? payload.rows : sampleRows);
      setSource(`${payload.fileName} | ${formatNumber(payload.rows.length)} records`);
      setParseState(payload.errors?.length ? "loaded-with-warnings" : "loaded");
      setSelectedKey(null);
      setPreferBackend(false);
      setServerAnalysis(null);
      return;
    }
    setParseState("error");
    setSource(`${payload.fileName}: ${payload.error}`);
  };

  const tabContent = {
    overview: <Overview analysis={analysis} selectedSpot={selectedSpot} setSelectedKey={setSelectedKey} />,
    hotspots: <Hotspots analysis={analysis} selectedSpot={selectedSpot} setSelectedKey={setSelectedKey} />,
    actions: <RecommendedActions analysis={analysis} selectedSpot={selectedSpot} setSelectedKey={setSelectedKey} />,
    simulator: <Simulator analysis={analysis} strategyKey={strategyKey} setStrategyKey={setStrategyKey} />,
    sensors: <Sensors analysis={analysis} />,
    about: <AboutPage />
  };

  return (
    <main className="min-h-screen overflow-hidden bg-asphalt text-white">
      <div className="city-grid" />
      <div className="relative mx-auto max-w-[1540px] px-4 py-5 sm:px-6 lg:px-8">
        <header className="control-header">
          <div className="flex min-w-0 items-center gap-4">
            <div className="brand-mark">
              <MapPin size={24} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-3xl font-semibold tracking-normal text-white sm:text-4xl">ChokepointIQ</h1>
                <span className="status-chip border-signal/30 text-signal">Bengaluru control room</span>
              </div>
              <p className="mt-1 max-w-3xl text-sm text-steel">
                AI-powered parking-induced congestion intelligence for hotspot discovery, enforcement prioritization, and sensor planning.
              </p>
            </div>
          </div>
          <UploadPanel onRows={handleRows} activeSource={displaySource} parsing={parseState === "parsing"} />
        </header>

        <nav className="nav-rail" aria-label="Dashboard sections">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`nav-button ${activeTab === id ? "nav-button-active" : ""}`}
              title={label}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <TimeLensControl
          timeLens={draftTimeLens}
          setTimeLens={setDraftTimeLens}
          appliedTimeLens={timeLens}
          onApply={() => {
            setTimeLens(draftTimeLens);
            setSelectedKey(null);
          }}
          context={analysis.timeContext}
          backendStatus={backendStatus}
          backendMeta={serverAnalysis?.backend}
          preferBackend={preferBackend}
          setPreferBackend={setPreferBackend}
        />

        {parseState === "loaded-with-warnings" && (
          <div className="mb-5 rounded-md border border-amberline/30 bg-amberline/10 px-4 py-3 text-sm text-amberline">
            CSV loaded with parser warnings. Usable rows were analyzed; malformed rows were ignored where coordinates or timestamps could not be read.
          </div>
        )}
        {parseState === "error" && (
          <div className="mb-5 rounded-md border border-dangerline/30 bg-dangerline/10 px-4 py-3 text-sm text-dangerline">
            Upload failed. The built-in sample dataset is still available for demo mode.
          </div>
        )}

        {tabContent[activeTab]}
      </div>
    </main>
  );
}
