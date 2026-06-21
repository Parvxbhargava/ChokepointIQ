const VEHICLE_WEIGHTS = {
  TANKER: 1.45,
  "PRIVATE BUS": 1.38,
  "BUS (BMTC/KSRTC)": 1.36,
  "LORRY/GOODS VEHICLE": 1.34,
  HGV: 1.32,
  "MAXI-CAB": 1.28,
  LGV: 1.22,
  VAN: 1.16,
  TEMPO: 1.16,
  CAR: 1.12,
  JEEP: 1.1,
  "PASSENGER AUTO": 1.08,
  "GOODS AUTO": 1.1,
  "MOTOR CYCLE": 0.86,
  SCOOTER: 0.82,
  MOPED: 0.78
};

const VEHICLE_CLASSES = {
  TANKER: "heavy",
  "PRIVATE BUS": "heavy",
  "BUS (BMTC/KSRTC)": "heavy",
  "LORRY/GOODS VEHICLE": "heavy",
  HGV: "heavy",
  "MAXI-CAB": "large",
  LGV: "large",
  VAN: "large",
  TEMPO: "large",
  CAR: "medium",
  JEEP: "medium",
  "PASSENGER AUTO": "medium",
  "GOODS AUTO": "medium",
  "MOTOR CYCLE": "small",
  SCOOTER: "small",
  MOPED: "small"
};

const VIOLATION_WEIGHTS = {
  "PARKING NEAR ROAD CROSSING": 1.48,
  "PARKING NEAR TRAFFIC LIGHT OR ZEBRA CROSS": 1.46,
  "PARKING IN A MAIN ROAD": 1.42,
  "DOUBLE PARKING": 1.38,
  "PARKING NEAR BUSTOP/SCHOOL/HOSPITAL ETC": 1.34,
  "PARKING ON FOOTPATH": 1.24,
  "WRONG PARKING": 1.2,
  "NO PARKING": 1.1,
  "PARKING OPPOSITE TO ANOTHER PARKED VEHICLE": 1.18,
  "PARKING OTHER THAN BUS STOP": 1.16,
  "DEFECTIVE NUMBER PLATE": 0.72,
  "REFUSE TO GO FOR HIRE": 0.68,
  "DEMANDING EXCESS FARE": 0.64
};

const PEAK_HOURS = new Set([8, 9, 10, 11, 17, 18, 19, 20]);
export const TIME_SHIFTS = {
  morning: { label: "Morning peak", hours: [7, 8, 9, 10, 11] },
  midday: { label: "Midday", hours: [12, 13, 14, 15] },
  evening: { label: "Evening peak", hours: [16, 17, 18, 19, 20] },
  night: { label: "Night / late hours", hours: [21, 22, 23, 0, 1, 2, 3, 4, 5, 6] }
};
const JUNCTION_VIOLATIONS = new Set([
  "PARKING NEAR ROAD CROSSING",
  "PARKING NEAR TRAFFIC LIGHT OR ZEBRA CROSS",
  "PARKING IN A MAIN ROAD",
  "PARKING NEAR BUSTOP/SCHOOL/HOSPITAL ETC",
  "DOUBLE PARKING"
]);

export const STRATEGIES = {
  balanced: {
    label: "Balanced patrol grid",
    focus: "Frequency, severity, validation confidence, and station load are weighted evenly.",
    vehicleBoost: 1,
    junctionBoost: 1,
    severityBoost: 1,
    coverageBoost: 0.22
  },
  heavy: {
    label: "Prioritize heavy obstruction",
    focus: "Moves towing and verification toward tankers, buses, autos, cabs, goods vehicles, and cars.",
    vehicleBoost: 1.42,
    junctionBoost: 0.95,
    severityBoost: 1.05,
    coverageBoost: 0.3
  },
  junction: {
    label: "Junction-sensitive enforcement",
    focus: "Targets road crossings, signal/zebra crossings, bus stops, and main-road parking first.",
    vehicleBoost: 0.95,
    junctionBoost: 1.52,
    severityBoost: 1.22,
    coverageBoost: 0.34
  }
};

function normalizeValue(value) {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  if (!text || text.toUpperCase() === "NULL" || text.toLowerCase() === "nan") return "";
  return text;
}

function parseList(value) {
  const text = normalizeValue(value);
  if (!text) return [];
  try {
    const parsed = JSON.parse(text.replaceAll("'", '"'));
    if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim()).filter(Boolean);
  } catch {
    // Fall through to permissive parsing.
  }
  return text
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(",")
    .map((part) => part.replaceAll('"', "").trim())
    .filter(Boolean);
}

function parseDate(value) {
  const text = normalizeValue(value);
  if (!text) return null;
  let normalized = text.includes(" ") ? text.replace(" ", "T") : text;
  normalized = normalized.replace(/\.(\d{3})\d+/, ".$1");
  normalized = normalized.replace(/([+-]\d{2})$/, "$1:00");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function localHour(date) {
  if (!date) return null;
  const ist = new Date(date.getTime() + 330 * 60 * 1000);
  return ist.getUTCHours();
}

function localWeekdayIndex(date) {
  if (!date) return null;
  const ist = new Date(date.getTime() + 330 * 60 * 1000);
  return ist.getUTCDay();
}

function shiftForHour(hour) {
  if (hour === null || hour === undefined) return "unknown";
  return Object.entries(TIME_SHIFTS).find(([, shift]) => shift.hours.includes(Number(hour)))?.[0] ?? "night";
}

function shiftLabel(shiftKey) {
  return TIME_SHIFTS[shiftKey]?.label ?? "Unknown shift";
}

function dayTypeForWeekday(weekdayIndex) {
  if (weekdayIndex === 0 || weekdayIndex === 6) return "weekend";
  if (weekdayIndex === null || weekdayIndex === undefined || weekdayIndex < 0) return "unknown";
  return "weekday";
}

function hotspotKey(lat, lng) {
  return `${Math.round(lat * 1000) / 1000},${Math.round(lng * 1000) / 1000}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function percentileScale(value, max) {
  if (!max) return 0;
  return clamp(value / max, 0, 1);
}

function vehicleWeight(vehicleType) {
  return VEHICLE_WEIGHTS[vehicleType] ?? 1;
}

function vehicleClass(vehicleType) {
  return VEHICLE_CLASSES[vehicleType] ?? "medium";
}

function vehicleTowNeed(vehicleType) {
  const type = vehicleClass(vehicleType);
  if (type === "heavy") return 1;
  if (type === "large") return 0.78;
  if (type === "medium") return 0.48;
  return 0.08;
}

function vehicleOfficerNeed(vehicleType) {
  const type = vehicleClass(vehicleType);
  if (type === "small") return 0.86;
  if (type === "medium") return 0.62;
  if (type === "large") return 0.48;
  return 0.36;
}

function violationWeight(violation) {
  return VIOLATION_WEIGHTS[violation] ?? 1;
}

function isJunctionSensitive(violations, junctionName) {
  const junction = normalizeValue(junctionName);
  return (
    (junction && junction !== "No Junction") ||
    violations.some((violation) => JUNCTION_VIOLATIONS.has(violation))
  );
}

function rowJunctionRisk(violations, junctionName) {
  const explicitJunction = normalizeValue(junctionName) && normalizeValue(junctionName) !== "No Junction";
  const violationPressure = violations.reduce((sum, violation) => {
    if (violation === "PARKING NEAR ROAD CROSSING") return sum + 0.34;
    if (violation === "PARKING NEAR TRAFFIC LIGHT OR ZEBRA CROSS") return sum + 0.34;
    if (violation === "PARKING IN A MAIN ROAD") return sum + 0.27;
    if (violation === "PARKING NEAR BUSTOP/SCHOOL/HOSPITAL ETC") return sum + 0.22;
    if (violation === "DOUBLE PARKING") return sum + 0.2;
    return sum;
  }, 0);
  return clamp((explicitJunction ? 0.42 : 0.08) + violationPressure, 0, 1);
}

function buildAlternateRoutes(spot) {
  const lat = spot.lat;
  const lng = spot.lng;
  const north = 0.0062;
  const south = -0.0062;
  const east = 0.0068;
  const west = -0.0068;
  return [
    {
      name: "Diversion A",
      label: "Use parallel street west of chokepoint",
      delay: "+4 min",
      clearance: "Keeps traffic out of junction mouth",
      coordinates: [
        [lat + south, lng + west],
        [lat - 0.002, lng + west * 1.25],
        [lat + north, lng + west],
        [lat + north * 1.12, lng + east * 0.7]
      ]
    },
    {
      name: "Diversion B",
      label: "Loop via east-side connector",
      delay: "+6 min",
      clearance: "Useful when towing blocks one lane",
      coordinates: [
        [lat + south, lng + west * 0.7],
        [lat + south * 1.15, lng + east],
        [lat + 0.001, lng + east * 1.25],
        [lat + north, lng + east * 0.6]
      ]
    }
  ];
}

function actionFor(hotspot) {
  const topViolation = hotspot.topViolations[0]?.name ?? "parking violation";
  if (hotspot.needsTow && hotspot.score >= 84 && hotspot.junctionRiskScore >= 42) {
    return "Immediate towing + peak-hour patrol at junction mouth";
  }
  if (!hotspot.needsTow && hotspot.officerNeedIndex >= 62) {
    return "Officer-led clearing and no-stopping enforcement";
  }
  if (hotspot.needsTow) {
    return "Tow vehicle standby for high-obstruction vehicles";
  }
  if (topViolation.includes("MAIN ROAD")) {
    return "Temporary no-stopping enforcement on main-road stretch";
  }
  if (hotspot.validationRate < 0.45) {
    return "Officer verification sweep before escalation";
  }
  if (hotspot.recurrenceIndex > 0.64) {
    return "Repeat monitoring and barricade placement";
  }
  return "Targeted patrol and repeat-offender monitoring";
}

function actionTypeFor(spot) {
  if (spot.needsTow && spot.score >= 86 && spot.junctionRiskScore >= 42) return "Critical reroute + tow";
  if (!spot.needsTow && spot.score >= 80) return "Rapid officer clearing";
  if (spot.needsTow && spot.score >= 80) return "Immediate towing";
  if (spot.needsTow) return "Tow standby";
  if (spot.validationRate < 0.45) return "Officer verification";
  if (spot.recurrenceIndex > 0.62) return "Repeat patrol";
  return "Targeted enforcement";
}

function actionRationale(spot) {
  const parts = [
    `${spot.score}/100 impact score`,
    `${spot.count} historic record${spot.count === 1 ? "" : "s"}`,
    `${spot.junctionRiskScore}/100 junction risk`,
    `${spot.obstructionIndex}/100 obstruction index`,
    `${spot.dominantVehicleClass} vehicle mix`
  ];
  if (spot.needsTow) parts.push(`${spot.towNeedIndex}/100 tow need`);
  else parts.push(`${spot.officerNeedIndex}/100 officer clearing need`);
  if (spot.peakShare >= 0.35) parts.push("peak-hour exposure");
  if (spot.validationRate < 0.45) parts.push("needs field validation");
  return parts.join(" | ");
}

function dispatchStatusFor(spot) {
  if (priorityFor(spot.score) === "P1") return "Pending dispatch";
  if (spot.needsTow) return "Tow standby";
  if (spot.validationRate < 0.45) return "Needs verification";
  return "Patrol queue";
}

function responseSlaFor(score) {
  if (score >= 84) return 10;
  if (score >= 70) return 20;
  if (score >= 56) return 35;
  return 50;
}

function handlingTimeFor(spot) {
  if (spot.needsTow && spot.score >= 84) return 45;
  if (spot.needsTow) return 35;
  if (spot.officerNeedIndex >= 62) return 22;
  return 18;
}

function impactIfCleared(spot) {
  return Math.round(clamp(spot.score * 0.34 + spot.junctionRiskScore * 0.12 + spot.obstructionIndex * 0.08, 8, 58));
}

function sensorDwellThreshold(spot) {
  let minutes = 15;
  if (spot.score >= 84) minutes = 7;
  else if (spot.score >= 70) minutes = 10;
  if (spot.junctionRiskScore >= 70) minutes -= 2;
  if (spot.towNeedIndex >= 65) minutes -= 1;
  return `${Math.max(4, minutes)} min`;
}

function sensorAlertRule(spot) {
  const vehicleClause = spot.needsTow ? "heavy/large vehicle detected" : "repeated non-tow occupancy";
  return `If occupied beyond ${spot.dwellThreshold} during peak hour, or ${vehicleClause}, create ${priorityFor(spot.score)} alert`;
}

function riskBand(score) {
  if (score >= 80) return "Critical";
  if (score >= 65) return "High";
  if (score >= 48) return "Watch";
  return "Emerging";
}

function priorityFor(score) {
  if (score >= 84) return "P1";
  if (score >= 70) return "P2";
  if (score >= 56) return "P3";
  return "P4";
}

function topEntries(map, limit = 6) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

export function prepareRows(rawRows) {
  return rawRows
    .map((row, index) => {
      const lat = Number(row.latitude);
      const lng = Number(row.longitude ?? row.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      const createdAt = parseDate(row.created_datetime);
      const hour = localHour(createdAt);
      const weekdayIndex = localWeekdayIndex(createdAt);
      const dayType = dayTypeForWeekday(weekdayIndex);
      const shift = shiftForHour(hour);
      const vehicleType = normalizeValue(row.updated_vehicle_type) || normalizeValue(row.vehicle_type) || "UNKNOWN";
      const violations = parseList(row.violation_type);
      const validationStatus = normalizeValue(row.validation_status).toLowerCase();
      const policeStation = normalizeValue(row.police_station) || "No Police Station";
      const junctionName = normalizeValue(row.junction_name) || "No Junction";
      const stationOrJunction = junctionName !== "No Junction" ? junctionName : policeStation;
      const severity = violations.length
        ? violations.reduce((sum, violation) => sum + violationWeight(violation), 0) / violations.length
        : 1;
      const vehicle = vehicleWeight(vehicleType);
      const peak = hour !== null && PEAK_HOURS.has(hour);
      const junctionSensitive = isJunctionSensitive(violations, junctionName);
      const junctionRisk = rowJunctionRisk(violations, junctionName);

      return {
        id: normalizeValue(row.id) || `ROW-${index + 1}`,
        lat,
        lng,
        key: hotspotKey(lat, lng),
        location: normalizeValue(row.location) || stationOrJunction,
        vehicleType,
        vehicleClass: vehicleClass(vehicleType),
        violations,
        offenceCodes: parseList(row.offence_code),
        createdAt,
        hour,
        weekdayIndex,
        dayType,
        shift,
        policeStation,
        junctionName,
        validationStatus,
        dataSent: String(row.data_sent_to_scita).toLowerCase() === "true",
        severity,
        vehicle,
        peak,
        junctionSensitive,
        junctionRisk
      };
    })
    .filter(Boolean);
}

export function analyzePreparedRows(allRows, strategyKey = "balanced", timeLens = {}) {
  const requestedHour = Number.isFinite(Number(timeLens.simulatedHour)) ? Number(timeLens.simulatedHour) : 9;
  const requestedShift = shiftForHour(requestedHour);
  const requestedDayType = timeLens.dayType ?? "weekday";
  const timeMode = timeLens.mode ?? "all";

  const strictRows = allRows.filter(
    (row) =>
      row.shift === requestedShift &&
      (requestedDayType === "all" || row.dayType === requestedDayType)
  );
  const shiftOnlyRows = allRows.filter((row) => row.shift === requestedShift);
  const minimumRows = Math.min(20, Math.max(4, Math.ceil(allRows.length * 0.01)));
  const usingFallback = timeMode === "shift" && strictRows.length < minimumRows;
  const rows =
    timeMode === "shift"
      ? strictRows.length >= minimumRows
        ? strictRows
        : shiftOnlyRows.length >= minimumRows
          ? shiftOnlyRows
          : allRows
      : allRows;

  const strategy = STRATEGIES[strategyKey] ?? STRATEGIES.balanced;
  const stationCounts = new Map();
  const vehicleCounts = new Map();
  const violationCounts = new Map();
  const hourCounts = new Map();
  const hotspotsByKey = new Map();

  rows.forEach((row) => {
    stationCounts.set(row.policeStation, (stationCounts.get(row.policeStation) ?? 0) + 1);
    vehicleCounts.set(row.vehicleType, (vehicleCounts.get(row.vehicleType) ?? 0) + 1);
    row.violations.forEach((violation) => {
      violationCounts.set(violation, (violationCounts.get(violation) ?? 0) + 1);
    });
    if (row.hour !== null) hourCounts.set(row.hour, (hourCounts.get(row.hour) ?? 0) + 1);

    const existing = hotspotsByKey.get(row.key);
    if (!existing) {
      hotspotsByKey.set(row.key, {
        key: row.key,
        lat: row.lat,
        lng: row.lng,
        rows: [],
        vehicleMap: new Map(),
        violationMap: new Map(),
        stationMap: new Map(),
        junctionMap: new Map(),
        locationMap: new Map()
      });
    }
    const hotspot = hotspotsByKey.get(row.key);
    hotspot.rows.push(row);
    hotspot.vehicleMap.set(row.vehicleType, (hotspot.vehicleMap.get(row.vehicleType) ?? 0) + 1);
    hotspot.stationMap.set(row.policeStation, (hotspot.stationMap.get(row.policeStation) ?? 0) + 1);
    hotspot.junctionMap.set(row.junctionName, (hotspot.junctionMap.get(row.junctionName) ?? 0) + 1);
    hotspot.locationMap.set(row.location, (hotspot.locationMap.get(row.location) ?? 0) + 1);
    row.violations.forEach((violation) => {
      hotspot.violationMap.set(violation, (hotspot.violationMap.get(violation) ?? 0) + 1);
    });
  });

  const maxFrequency = Math.max(...[...hotspotsByKey.values()].map((spot) => spot.rows.length), 1);
  const maxStationLoad = Math.max(...stationCounts.values(), 1);
  const hotspots = [...hotspotsByKey.values()]
    .map((spot) => {
      const count = spot.rows.length;
      const frequency = percentileScale(count, maxFrequency);
      const avgSeverity =
        spot.rows.reduce((sum, row) => sum + row.severity, 0) / Math.max(count, 1);
      const avgVehicle =
        spot.rows.reduce((sum, row) => sum + row.vehicle, 0) / Math.max(count, 1);
      const peakShare = spot.rows.filter((row) => row.peak).length / count;
      const junctionShare = spot.rows.filter((row) => row.junctionSensitive).length / count;
      const avgJunctionRisk =
        spot.rows.reduce((sum, row) => sum + row.junctionRisk, 0) / Math.max(count, 1);
      const validationRate =
        spot.rows.filter((row) => ["approved", "created1", "processing"].includes(row.validationStatus)).length /
        count;
      const heavyShare =
        spot.rows.filter((row) => vehicleWeight(row.vehicleType) >= 1.18).length / count;
      const towNeedIndex = Math.round(
        (spot.rows.reduce((sum, row) => sum + vehicleTowNeed(row.vehicleType), 0) / Math.max(count, 1)) * 100
      );
      const officerNeedIndex = Math.round(
        (spot.rows.reduce((sum, row) => sum + vehicleOfficerNeed(row.vehicleType), 0) / Math.max(count, 1)) * 100
      );
      const classMap = new Map();
      spot.rows.forEach((row) => classMap.set(row.vehicleClass, (classMap.get(row.vehicleClass) ?? 0) + 1));
      const dominantVehicleClass = topEntries(classMap, 1)[0]?.name ?? "medium";
      const needsTow = towNeedIndex >= 46 || heavyShare >= 0.22;
      const stationName = topEntries(spot.stationMap, 1)[0]?.name ?? "No Police Station";
      const stationLoad = percentileScale(stationCounts.get(stationName), maxStationLoad);
      const days = new Set(
        spot.rows
          .map((row) => row.createdAt?.toISOString().slice(0, 10))
          .filter(Boolean)
      ).size;
      const recurrenceIndex = clamp((count > 1 ? 0.35 : 0) + Math.min(days / 10, 0.65), 0, 1);
      const frequencyPoints = frequency * 25;
      const severityPoints = clamp((avgSeverity - 0.62) / 0.88, 0, 1) * 18 * strategy.severityBoost;
      const obstructionPoints = clamp((avgVehicle - 0.78) / 0.7, 0, 1) * 15 * strategy.vehicleBoost;
      const peakPoints = peakShare * 12;
      const recurrencePoints = recurrenceIndex * 11;
      const junctionPoints = avgJunctionRisk * 13 * strategy.junctionBoost;
      const stationPoints = stationLoad * 8;
      const validationPoints = validationRate * 8;
      const rawScore =
        frequencyPoints +
        severityPoints +
        obstructionPoints +
        peakPoints +
        recurrencePoints +
        junctionPoints +
        stationPoints +
        validationPoints;
      const score = Math.round(clamp(rawScore * 1.24 + 12, 0, 100));
      const junctionRiskScore = Math.round(avgJunctionRisk * 100);
      const obstructionIndex = Math.round(clamp((avgVehicle - 0.72) / 0.78, 0, 1) * 100);
      const topViolations = topEntries(spot.violationMap, 4);
      const topVehicles = topEntries(spot.vehicleMap, 4);
      const topJunction = topEntries(spot.junctionMap, 1)[0]?.name ?? "No Junction";
      const topLocation = topEntries(spot.locationMap, 1)[0]?.name ?? stationName;
      const reasons = [
        `${count} repeated record${count === 1 ? "" : "s"} in this micro-zone`,
        `${junctionRiskScore}/100 junction conflict risk`,
        `${obstructionIndex}/100 carriageway obstruction index`,
        `${Math.round(peakShare * 100)}% during peak traffic windows`
      ];
      const scoreBreakdown = [
        { name: "Frequency", value: Math.round(frequencyPoints), max: 25 },
        { name: "Violation severity", value: Math.round(severityPoints), max: Math.round(18 * strategy.severityBoost) },
        { name: "Vehicle obstruction", value: Math.round(obstructionPoints), max: Math.round(15 * strategy.vehicleBoost) },
        { name: "Peak timing", value: Math.round(peakPoints), max: 12 },
        { name: "Recurrence", value: Math.round(recurrencePoints), max: 11 },
        { name: "Junction conflict", value: Math.round(junctionPoints), max: Math.round(13 * strategy.junctionBoost) },
        { name: "Station load", value: Math.round(stationPoints), max: 8 },
        { name: "Validation confidence", value: Math.round(validationPoints), max: 8 }
      ];

      const enriched = {
        ...spot,
        count,
        score,
        riskBand: riskBand(score),
        avgSeverity,
        avgVehicle,
        peakShare,
        junctionShare,
        junctionRiskScore,
        validationRate,
        heavyShare,
        obstructionIndex,
        towNeedIndex,
        officerNeedIndex,
        dominantVehicleClass,
        needsTow,
        stationName,
        stationLoad,
        recurrenceIndex,
        topViolations,
        topVehicles,
        topJunction,
        topLocation,
        reasons,
        scoreBreakdown,
        action: actionFor({
          score,
          topViolations,
          obstructionIndex,
          needsTow,
          officerNeedIndex,
          validationRate,
          recurrenceIndex,
          junctionRiskScore
        })
      };
      enriched.actionType = actionTypeFor(enriched);
      enriched.actionRationale = actionRationale(enriched);
      enriched.resources = {
        policeUnits: enriched.score >= 82 || enriched.officerNeedIndex >= 68 ? 2 : 1,
        towVehicles: enriched.needsTow ? 1 : 0,
        responseSla: responseSlaFor(enriched.score),
        handlingMinutes: handlingTimeFor(enriched)
      };
      enriched.expectedImpactReduction = impactIfCleared(enriched);
      enriched.dispatchStatus = dispatchStatusFor(enriched);
      enriched.needsReroute = enriched.score >= 86 && enriched.junctionRiskScore >= 42;
      enriched.alternateRoutes = buildAlternateRoutes(enriched);
      return enriched;
    })
    .sort((a, b) => b.score - a.score || b.count - a.count)
    .slice(0, 250);

  const criticalHotspots = hotspots.filter((spot) => spot.score >= 80).length;
  const averageScore = Math.round(
    hotspots.reduce((sum, spot) => sum + spot.score, 0) / Math.max(hotspots.length, 1)
  );
  const topHotspots = hotspots.slice(0, 12);
  const likelyActive = topHotspots.slice(0, 5).map((spot) => ({
    ...spot,
    forecastReason:
      timeMode === "shift"
        ? `${spot.count} historical record${spot.count === 1 ? "" : "s"} matched ${requestedDayType === "all" ? "all days" : requestedDayType} ${shiftLabel(requestedShift).toLowerCase()}`
        : "All-time hotspot, switch to Shift forecast to see time-specific risk"
  }));

  const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayHourCounts = new Map();
  allRows.forEach((row) => {
    if (row.weekdayIndex >= 0 && row.hour !== null) {
      const key = `${row.weekdayIndex}-${row.hour}`;
      dayHourCounts.set(key, (dayHourCounts.get(key) ?? 0) + 1);
    }
  });
  const dayHourMatrix = weekdayLabels.map((day, weekday) => ({
    day,
    hours: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      count: dayHourCounts.get(`${weekday}-${hour}`) ?? 0
    }))
  }));
  const maxDayHourCount = Math.max(
    ...dayHourMatrix.flatMap((row) => row.hours.map((hour) => hour.count)),
    1
  );
  const sensorCandidates = hotspots
    .filter((spot) => spot.score >= 55)
    .map((spot, index) => ({
      ...spot,
      sensorPriority: Math.round(
        clamp(spot.score * 0.62 + spot.recurrenceIndex * 16 + (spot.junctionRiskScore / 100) * 14 + spot.validationRate * 8, 0, 100)
      ),
      sensorType: spot.junctionRiskScore > 58 ? "Junction-mouth occupancy" : "Curbside dwell sensor",
      dwellThreshold: sensorDwellThreshold(spot),
      alertRule: "",
      rank: index + 1
    }))
    .map((spot) => ({ ...spot, alertRule: sensorAlertRule(spot) }))
    .sort((a, b) => b.sensorPriority - a.sensorPriority)
    .slice(0, 8);

  const weightedTargetScore =
    topHotspots.reduce((sum, spot) => sum + spot.score * (spot.count + 1), 0) /
    Math.max(topHotspots.reduce((sum, spot) => sum + spot.count + 1, 0), 1);
  const enforcementCoverage = Math.round(
    clamp(38 + strategy.coverageBoost * 100 + topHotspots.length * 1.2, 0, 92)
  );
  const highRiskReduction = Math.round(
    clamp((weightedTargetScore / 100) * (strategyKey === "balanced" ? 37 : strategyKey === "heavy" ? 44 : 49), 8, 63)
  );
  const congestionRiskReduction = Math.round(
    clamp(highRiskReduction * 0.72 + (strategyKey === "junction" ? 8 : strategyKey === "heavy" ? 4 : 2), 4, 58)
  );

  return {
    rows,
    hotspots,
    topHotspots,
    actionQueue: hotspots.slice(0, 18).map((spot, index) => ({
      ...spot,
      priorityRank: index + 1,
      priority: priorityFor(spot.score)
    })),
    sensorCandidates,
    stationStats: topEntries(stationCounts, 10).map((entry) => ({
      ...entry,
      share: Math.round((entry.count / Math.max(rows.length, 1)) * 1000) / 10
    })),
    vehicleStats: topEntries(vehicleCounts, 10).map((entry) => ({
      ...entry,
      weight: vehicleWeight(entry.name),
      share: Math.round((entry.count / Math.max(rows.length, 1)) * 1000) / 10
    })),
    violationStats: topEntries(violationCounts, 10).map((entry) => ({
      ...entry,
      weight: violationWeight(entry.name),
      share: Math.round((entry.count / Math.max(rows.length, 1)) * 1000) / 10
    })),
    hourStats: [...Array(24)].map((_, hour) => ({
      hour: `${String(hour).padStart(2, "0")}:00`,
      count: hourCounts.get(hour) ?? 0
    })),
    metrics: {
      totalRecords: rows.length,
      totalSourceRecords: allRows.length,
      contextualRecords: rows.length,
      hotspotCount: hotspots.length,
      criticalHotspots,
      averageScore,
      validatedShare: Math.round(
        (rows.filter((row) => row.validationStatus).length / Math.max(rows.length, 1)) * 100
      ),
      junctionSensitiveShare: Math.round(
        (rows.filter((row) => row.junctionSensitive).length / Math.max(rows.length, 1)) * 100
      ),
      obstructionAverage: Math.round(
        hotspots.reduce((sum, spot) => sum + spot.obstructionIndex, 0) / Math.max(hotspots.length, 1)
      )
    },
    timeContext: {
      mode: timeMode,
      selectedHour: requestedHour,
      selectedShift: requestedShift,
      selectedShiftLabel: shiftLabel(requestedShift),
      selectedDayType: requestedDayType,
      strictMatchCount: strictRows.length,
      shiftMatchCount: shiftOnlyRows.length,
      analyzedRows: rows.length,
      totalRows: allRows.length,
      usingFallback,
      label:
        timeMode === "shift"
          ? `${requestedDayType === "all" ? "All days" : requestedDayType} | ${shiftLabel(requestedShift)} | ${String(requestedHour).padStart(2, "0")}:00`
          : "All-time hotspot intelligence"
    },
    likelyActive,
    dayHourMatrix,
    maxDayHourCount,
    simulation: {
      strategy,
      enforcementCoverage,
      highRiskReduction,
      congestionRiskReduction,
      patrolUnits: Math.max(4, Math.ceil(topHotspots.length / 2)),
      towStandby: topHotspots.filter((spot) => spot.heavyShare > 0.28 || spot.score >= 84).length
    }
  };
}

export function analyzeRows(rawRows, strategyKey = "balanced", timeLens = {}) {
  return analyzePreparedRows(prepareRows(rawRows), strategyKey, timeLens);
}

export function formatNumber(value) {
  return new Intl.NumberFormat("en-IN").format(value ?? 0);
}

export function scoreColor(score) {
  if (score >= 80) return "#ff4d6d";
  if (score >= 65) return "#ffbd3d";
  if (score >= 48) return "#5ea1ff";
  return "#19f0c4";
}
