
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const pool = require("./db");
const { randomUUID } = require("crypto");
const PriorityQueue = require("./priorityQueue");
const findAvailablePoint = require("./allocation");
const calculateChargingDuration = require("./chargingDuration");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const datasetPath = path.join(
  __dirname,
  "..",
  "data",
  "raw",
  "ChargingRecords_All_Unique_Records.csv"
);

// HOME API
app.get("/", (req, res) => {
  res.json({
    message: "EV Charging Concurrent Booking and Resource Allocation Engine",
    status: "Backend server is running"
  });
});

// HEALTH API
app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    service: "EV Charging Allocation Backend"
  });
});

// HISTORICAL DATASET INSPECTION API
app.get("/api/dataset/inspect", (req, res) => {
  if (!fs.existsSync(datasetPath)) {
    return res.status(404).json({
      error: "Dataset file not found",
      expectedPath: datasetPath
    });
  }

  const columns = [];
  const sampleRecords = [];
  let totalRecords = 0;

  fs.createReadStream(datasetPath)
    .pipe(csv())
    .on("headers", (headers) => {
      columns.push(...headers);
    })
    .on("data", (record) => {
      totalRecords++;

      if (sampleRecords.length < 5) {
        sampleRecords.push(record);
      }
    })
    .on("end", () => {
      res.json({
        dataset: "ChargingRecords_All_Unique_Records.csv",
        totalRecords,
        totalColumns: columns.length,
        columns,
        sampleRecords
      });
    })
    .on("error", (error) => {
      console.error("Dataset reading error:", error.message);

      if (!res.headersSent) {
        res.status(500).json({
          error: "Unable to read dataset"
        });
      }
    });
});

// HISTORICAL DATASET STATISTICS API
app.get("/api/dataset/statistics", (req, res) => {
  if (!fs.existsSync(datasetPath)) {
    return res.status(404).json({
      error: "Dataset file not found"
    });
  }

  const users = new Set();
  const chargers = new Set();
  const chargerTypes = {};
  const locations = {};

  let totalRecords = 0;
  let totalDuration = 0;
  let totalDemand = 0;
  let validDurations = 0;
  let validDemands = 0;

  fs.createReadStream(datasetPath)
    .pipe(csv())
    .on("data", (record) => {
      totalRecords++;

      users.add(record.UserID);
      chargers.add(record.ChargerID);

      const type = record.ChargerType || "Unknown";
      chargerTypes[type] = (chargerTypes[type] || 0) + 1;

      const location = record.Location || "Unknown";
      locations[location] = (locations[location] || 0) + 1;

      const duration = Number(record.Duration);

      if (Number.isFinite(duration) && duration >= 0) {
        totalDuration += duration;
        validDurations++;
      }

      const demand = Number(record.Demand);

      if (
        record.Demand !== "" &&
        Number.isFinite(demand) &&
        demand >= 0
      ) {
        totalDemand += demand;
        validDemands++;
      }
    })
    .on("end", () => {
      res.json({
        dataset: "ChargingRecords_All_Unique_Records.csv",
        totalRecords,
        uniqueUsers: users.size,
        uniqueChargers: chargers.size,
        chargerTypes,
        locations,
        averageDurationMinutes: validDurations
          ? Number((totalDuration / validDurations).toFixed(2))
          : 0,
        totalRecordedDemand: Number(totalDemand.toFixed(2)),
        demandRecordsCounted: validDemands
      });
    })
    .on("error", (error) => {
      console.error("Statistics error:", error.message);

      if (!res.headersSent) {
        res.status(500).json({
          error: "Unable to calculate dataset statistics"
        });
      }
    });
});

// HISTORICAL CHARGER CONSISTENCY API
app.get("/api/chargers", (req, res) => {
  if (!fs.existsSync(datasetPath)) {
    return res.status(404).json({
      error: "Dataset file not found"
    });
  }

  const chargerInventory = new Map();

  fs.createReadStream(datasetPath)
    .pipe(csv())
    .on("data", (record) => {
      const chargerId = record.ChargerID;
      const chargerType = record.ChargerType;

      if (!chargerId) return;

      if (!chargerInventory.has(chargerId)) {
        chargerInventory.set(chargerId, new Set());
      }

      if (chargerType !== undefined && chargerType !== "") {
        chargerInventory.get(chargerId).add(chargerType);
      }
    })
    .on("end", () => {
      const chargers = Array.from(
        chargerInventory,
        ([chargerId, types]) => ({
          chargerId,
          chargerTypes: Array.from(types),
          hasConsistentType: types.size === 1
        })
      );

      const consistentChargers = chargers.filter(
        (charger) => charger.hasConsistentType
      ).length;

      res.json({
        totalUniqueChargers: chargers.length,
        chargersWithOneRecordedType: consistentChargers,
        chargersWithMultipleOrMissingTypes:
          chargers.length - consistentChargers,
        sampleChargers: chargers.slice(0, 20)
      });
    })
    .on("error", (error) => {
      console.error("Charger inventory error:", error.message);

      if (!res.headersSent) {
        res.status(500).json({
          error: "Unable to build charger inventory"
        });
      }
    });
});

// HISTORICAL MYSQL CHARGER API
app.get("/api/db/chargers", async (req, res) => {
  try {
    const [chargers] = await pool.query(
      "SELECT charger_id, charger_type, location, status FROM chargers ORDER BY charger_id"
    );

    res.json({
      success: true,
      totalChargers: chargers.length,
      chargers
    });
  } catch (error) {
    console.error("Database chargers error:", error.message);

    res.status(500).json({
      success: false,
      error: "Unable to retrieve chargers from database"
    });
  }
});

// INDIAN BEE CHARGING STATIONS API
app.get("/api/stations", async (req, res) => {
  try {
    const [stations] = await pool.query(
      "SELECT * FROM charging_stations LIMIT 100"
    );

    res.json({
      success: true,
      totalReturned: stations.length,
      stations
    });
  } catch (error) {
    console.error("Stations API error:", error.message);

    res.status(500).json({
      success: false,
      error: "Unable to retrieve charging stations"
    });
  }
});

// INDIAN EV VEHICLE CATALOGUE API
app.get("/api/vehicles", async (req, res) => {
  try {
    const [vehicles] = await pool.query(
      "SELECT * FROM vehicle_catalogue LIMIT 100"
    );

    res.json({
      success: true,
      totalReturned: vehicles.length,
      vehicles
    });
  } catch (error) {
    console.error("Vehicles API error:", error.message);

    res.status(500).json({
      success: false,
      error: "Unable to retrieve vehicle catalogue"
    });
  }
});

// INDIAN EV TWO-WHEELER CATALOGUE API
app.get("/api/two-wheelers", async (req, res) => {
  try {
    const [twoWheelers] = await pool.query(
      "SELECT * FROM two_wheeler_catalogue"
    );

    res.json({
      success: true,
      totalReturned: twoWheelers.length,
      twoWheelers
    });
  } catch (error) {
    console.error("Two-wheelers API error:", error.message);

    res.status(500).json({
      success: false,
      error: "Unable to retrieve two-wheeler catalogue"
    });
  }
});

// CONNECTOR STANDARD MAPPING API
app.get("/api/connectors", async (req, res) => {
  try {
    const [connectors] = await pool.query(
      "SELECT * FROM connector_standard_mapping"
    );

    res.json({
      success: true,
      totalReturned: connectors.length,
      connectors
    });
  } catch (error) {
    console.error("Connectors API error:", error.message);

    res.status(500).json({
      success: false,
      error: "Unable to retrieve connector mappings"
    });
  }
});

// FIND COMPATIBLE CHARGING POINTS API
app.get("/api/compatible-points/:vehicleModelId", async (req, res) => {
  try {
    const vehicleModelId = Number(req.params.vehicleModelId);

    if (!Number.isInteger(vehicleModelId) || vehicleModelId <= 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid vehicle model ID"
      });
    }

    const [points] = await pool.query(
      `SELECT
          cp.point_id,
          cp.point_code,
          cp.station_id,
          cp.section,
          cp.connector_type,
          cp.charging_mode,
          cp.max_power_kw,
          cp.status,
          cp.is_simulated,
          vcc.evidence_status
       FROM vehicle_connector_compatibility AS vcc
       INNER JOIN charging_points AS cp
          ON cp.connector_type = vcc.connector_standard
          AND cp.charging_mode = vcc.charging_mode
       WHERE vcc.vehicle_model_id = ?
          AND cp.status = 'AVAILABLE'
       ORDER BY cp.max_power_kw DESC, cp.point_id ASC`,
      [vehicleModelId]
    );

    res.json({
      success: true,
      vehicleModelId,
      totalCompatiblePoints: points.length,
      points
    });

  } catch (error) {
    console.error("Compatible points API error:", error.message);

    res.status(500).json({
      success: false,
      error: "Unable to find compatible charging points"
    });
  }
});

// CHECK CHARGING POINT BOOKING AVAILABILITY API
app.get("/api/points/:pointId/check-availability", async (req, res) => {
  try {
    const pointId = Number(req.params.pointId);
    const { startTime, endTime } = req.query;

    if (!Number.isInteger(pointId) || pointId <= 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid charging point ID"
      });
    }

    if (!startTime || !endTime) {
      return res.status(400).json({
        success: false,
        error: "Start time and end time are required"
      });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end <= start
    ) {
      return res.status(400).json({
        success: false,
        error: "Invalid booking time interval"
      });
    }

    const [conflicts] = await pool.query(
      `SELECT booking_id, start_time, end_time, status
       FROM bookings
       WHERE point_id = ?
         AND status IN ('PENDING', 'CONFIRMED')
         AND start_time < ?
         AND end_time > ?`,
      [pointId, endTime, startTime]
    );

    res.json({
      success: true,
      pointId,
      requestedStartTime: startTime,
      requestedEndTime: endTime,
      available: conflicts.length === 0,
      conflictCount: conflicts.length,
      conflicts
    });

  } catch (error) {
    console.error("Availability check error:", error.message);

    res.status(500).json({
      success: false,
      error: "Unable to check booking availability"
    });
  }
});

// AUTOMATIC BOOKING AND RESOURCE ALLOCATION API
app.post("/api/bookings/allocate", async (req, res) => {
  let connection;

  try {
    const {
      userId,
      vehicleModelId,
      startTime,
      endTime,
      batteryLevel,
      priority = 1
    } = req.body;

    if (
      !Number.isInteger(Number(userId)) ||
      Number(userId) <= 0 ||
      !Number.isInteger(Number(vehicleModelId)) ||
      Number(vehicleModelId) <= 0
    ) {
      return res.status(400).json({
        success: false,
        error: "Valid user ID and vehicle model ID are required"
      });
    }

    const timePattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

    if (
      !timePattern.test(startTime || "") ||
      !timePattern.test(endTime || "") ||
      endTime <= startTime
    ) {
      return res.status(400).json({
        success: false,
        error: "Provide valid start and end times in YYYY-MM-DD HH:mm:ss format"
      });
    }
    const requestedStart = new Date(startTime.replace(" ", "T"));

if (requestedStart.getTime() <= Date.now()) {
  return res.status(400).json({
    success: false,
    error: "Booking start time must be in the future"
  });
}

    if (
      batteryLevel !== undefined &&
      (Number(batteryLevel) < 0 || Number(batteryLevel) > 100)
    ) {
      return res.status(400).json({
        success: false,
        error: "Battery level must be between 0 and 100"
      });
    }

    if (
      !Number.isInteger(Number(priority)) ||
      Number(priority) < 1
    ) {
      return res.status(400).json({
        success: false,
        error: "Priority must be a positive integer"
      });
    }

    connection = await pool.getConnection();

    await connection.beginTransaction();

    // FIND AN AVAILABLE COMPATIBLE CHARGING POINT
    const allocatedPoint = await findAvailablePoint(
      connection,
      Number(vehicleModelId),
      startTime,
      endTime
    );

    if (!allocatedPoint) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        error: "No compatible charging point is available for the requested time"
      });
    }

    // CREATE THE BOOKING
    const [bookingResult] = await connection.query(
      `INSERT INTO bookings
       (user_id, point_id, start_time, end_time,
        battery_level, priority, status)
       VALUES (?, ?, ?, ?, ?, ?, 'CONFIRMED')`,
      [
        Number(userId),
        allocatedPoint.point_id,
        startTime,
        endTime,
        batteryLevel === undefined ? null : Number(batteryLevel),
        Number(priority)
      ]
    );

    const bookingId = bookingResult.insertId;

    // RECORD THE ALLOCATION DECISION
    await connection.query(
      `INSERT INTO allocation_logs
       (booking_id, point_id, decision, reason)
       VALUES (?, ?, ?, ?)`,
      [
        bookingId,
        allocatedPoint.point_id,
        "ALLOCATED",
        "Compatible charging point found with no overlapping booking"
      ]
    );

    await connection.commit();

    res.status(201).json({
      success: true,
      message: "Charging point allocated and booking confirmed",
      bookingId,
      allocatedPoint,
      booking: {
        userId: Number(userId),
        vehicleModelId: Number(vehicleModelId),
        startTime,
        endTime,
        batteryLevel: batteryLevel === undefined
          ? null
          : Number(batteryLevel),
        priority: Number(priority),
        status: "CONFIRMED"
      }
    });

  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    console.error("Booking allocation error:", error.message);

    res.status(500).json({
      success: false,
      error: "Unable to allocate charging point"
    });

  } finally {
    if (connection) {
      connection.release();
    }
  }
});



// ADD BOOKING REQUEST TO WAITING QUEUE

app.post("/api/booking-requests", async (req, res) => {
  const connection = await pool.getConnection();

  let transactionStarted = false;
  let userLockAcquired = false;
  let userLockName = null;

  try {
    const {
      userId,
      vehicleModelId,
      startTime,
      batteryLevel,
      targetBatteryLevel = 80,
      priority
    } = req.body;

    const userLatitude = req.body.userLatitude;
    const userLongitude = req.body.userLongitude;

    // STEP 1: VALIDATE REQUIRED FIELDS
    if (!userId || !vehicleModelId || !startTime) {
      return res.status(400).json({
        success: false,
        message: "User ID, vehicle model ID and start time are required"
      });
    }

    const userIdNumber = Number(userId);
    const vehicleModelIdNumber = Number(vehicleModelId);
    const currentBattery = Number(batteryLevel);
    const targetBattery = Number(targetBatteryLevel);

    if (
      !Number.isInteger(userIdNumber) || userIdNumber <= 0 ||
      !Number.isInteger(vehicleModelIdNumber) || vehicleModelIdNumber <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "User ID and vehicle model ID must be positive integers"
      });
    }

    if (
      batteryLevel === undefined ||
      batteryLevel === null ||
      batteryLevel === "" ||
      !Number.isFinite(currentBattery) ||
      currentBattery < 0 ||
      currentBattery > 100
    ) {
      return res.status(400).json({
        success: false,
        message: "Battery level must be between 0 and 100"
      });
    }

    if (
      !Number.isFinite(targetBattery) ||
      targetBattery <= currentBattery ||
      targetBattery > 100
    ) {
      return res.status(400).json({
        success: false,
        message: "Target battery must be greater than current battery and at most 100"
      });
    }

    const requestPriority =
      priority === undefined ? 1 : Number(priority);

    const start = new Date(startTime);

    if (Number.isNaN(start.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid start time"
      });
    }
    if (start.getTime() <= Date.now()) {
  return res.status(400).json({
    success: false,
    message: "Booking start time must be in the future"
  });
}

    // STEP 2: VALIDATE USER LOCATION
    let latitude = null;
    let longitude = null;

    if (
      userLatitude !== undefined ||
      userLongitude !== undefined
    ) {
      latitude = Number(userLatitude);
      longitude = Number(userLongitude);

      if (
        userLatitude === undefined ||
        userLongitude === undefined ||
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitude < -90 || latitude > 90 ||
        longitude < -180 || longitude > 180
      ) {
        return res.status(400).json({
          success: false,
          message: "Valid user latitude and longitude must be provided together"
        });
      }
    }

    // STEP 3: LOCK THIS USER'S BOOKING OPERATIONS
    userLockName = `ev_user_${userIdNumber}`;

    const [lockRows] = await connection.query(
      `SELECT GET_LOCK(?, 10) AS lock_acquired`,
      [userLockName]
    );

    if (Number(lockRows[0].lock_acquired) !== 1) {
      return res.status(409).json({
        success: false,
        message: "Unable to process this user's booking request. Try again."
      });
    }

    userLockAcquired = true;

    await connection.beginTransaction();
    transactionStarted = true;

    // STEP 4: FIND ALL VERIFIED COMPATIBLE CHARGING POINTS
    const [chargerRows] = await connection.query(
      `SELECT DISTINCT
          vc.battery_capacity_kwh,
          cp.point_id,
          cp.point_code,
          cp.connector_type,
          cp.charging_mode,
          cp.max_power_kw,
          cs.latitude,
          cs.longitude,
          LEAST(
            cp.max_power_kw,
            COALESCE(vcc.max_charging_power_kw, cp.max_power_kw)
          ) AS effective_power_kw
       FROM vehicle_catalogue vc
       JOIN vehicle_connector_compatibility vcc
          ON vc.vehicle_model_id = vcc.vehicle_model_id
       JOIN charging_points cp
          ON cp.connector_type = vcc.connector_standard
          AND (
            vcc.charging_mode IS NULL
            OR cp.charging_mode = vcc.charging_mode
          )
       JOIN charging_stations cs
          ON cp.station_id = cs.station_id
       WHERE vc.vehicle_model_id = ?
         AND vcc.evidence_status = 'MANUFACTURER_VERIFIED'
         AND cp.status = 'AVAILABLE'
       ORDER BY effective_power_kw DESC, cp.point_id ASC`,
      [vehicleModelIdNumber]
    );

    if (chargerRows.length === 0) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(400).json({
        success: false,
        message: "No manufacturer-verified compatible charging point found"
      });
    }

    // STEP 5: FORMAT DATE AND TIME
    const formatDateTime = (date) => {
      const pad = (value) => String(value).padStart(2, "0");

      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    };

    const calculatedStartTime = formatDateTime(start);

    // STEP 6: CALCULATE DISTANCE
    const calculateDistance = (lat1, lon1, lat2, lon2) => {
      const toRadians = (value) => value * Math.PI / 180;

      const earthRadiusKm = 6371;

      const dLat = toRadians(lat2 - lat1);
      const dLon = toRadians(lon2 - lon1);

      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRadians(lat1)) *
        Math.cos(toRadians(lat2)) *
        Math.sin(dLon / 2) ** 2;

      return 2 * earthRadiusKm *
        Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    // STEP 7: PREPARE EACH COMPATIBLE ALTERNATIVE
    const alternatives = [];

    for (const charger of chargerRows) {

      const batteryCapacity = Number(charger.battery_capacity_kwh);
      const effectivePower = Number(charger.effective_power_kw);

      if (
        !Number.isFinite(batteryCapacity) ||
        batteryCapacity <= 0 ||
        !Number.isFinite(effectivePower) ||
        effectivePower <= 0
      ) {
        continue;
      }

      const calculation = calculateChargingDuration({
        batteryCapacityKwh: batteryCapacity,
        currentBatteryLevel: currentBattery,
        targetBatteryLevel: targetBattery,
        chargingPowerKw: effectivePower,
        efficiency: 0.90
      });

      const durationMinutes =
        calculation.estimatedDurationMinutes;

      const end = new Date(
        start.getTime() + durationMinutes * 60 * 1000
      );

      const calculatedEndTime = formatDateTime(end);

      let distanceKm = null;

      if (
        latitude !== null &&
        longitude !== null &&
        charger.latitude !== null &&
        charger.longitude !== null
      ) {
        distanceKm = calculateDistance(
          latitude,
          longitude,
          Number(charger.latitude),
          Number(charger.longitude)
        );
      }

      // ESTIMATE WAITING TIME FROM EXISTING QUEUE
      const [queueRows] = await connection.query(
        `SELECT COALESCE(SUM(grouped.duration_minutes), 0)
           AS queue_wait_minutes
         FROM (
           SELECT
             COALESCE(
               br.alternative_group_id,
               CONCAT('request-', br.request_id)
             ) AS group_key,
             MAX(COALESCE(br.estimated_duration_minutes, 0))
               AS duration_minutes
           FROM booking_requests br
           WHERE br.request_status = 'WAITING'
             AND br.start_time < ?
             AND br.end_time > ?
             AND (
               br.candidate_point_id = ?
               OR (
                 br.candidate_point_id IS NULL
                 AND EXISTS (
                   SELECT 1
                   FROM vehicle_connector_compatibility vcc2
                   JOIN charging_points cp2
                     ON cp2.connector_type = vcc2.connector_standard
                     AND (
                       vcc2.charging_mode IS NULL
                       OR cp2.charging_mode = vcc2.charging_mode
                     )
                   WHERE vcc2.vehicle_model_id = br.vehicle_model_id
                     AND vcc2.evidence_status = 'MANUFACTURER_VERIFIED'
                     AND cp2.point_id = ?
                 )
               )
             )
           GROUP BY group_key
         ) grouped`,
        [
          calculatedEndTime,
          calculatedStartTime,
          charger.point_id,
          charger.point_id
        ]
      );

      const queuedWaitMinutes =
        Number(queueRows[0].queue_wait_minutes || 0);

      // INCLUDE EXISTING BOOKING OCCUPANCY
      const [bookingWaitRows] = await connection.query(
        `SELECT COALESCE(
           SUM(
             GREATEST(
               0,
               TIMESTAMPDIFF(
                 MINUTE,
                 GREATEST(NOW(), start_time),
                 end_time
               )
             )
           ),
           0
         ) AS booking_wait_minutes
         FROM bookings
         WHERE point_id = ?
           AND status IN ('PENDING', 'CONFIRMED')
           AND start_time < ?
           AND end_time > ?`,
        [
          charger.point_id,
          calculatedEndTime,
          calculatedStartTime
        ]
      );

      const bookingWaitMinutes =
        Number(bookingWaitRows[0].booking_wait_minutes || 0);

      alternatives.push({
        pointId: charger.point_id,
        pointCode: charger.point_code,
        connectorType: charger.connector_type,
        chargingPowerKw: effectivePower,
        batteryCapacityKwh: batteryCapacity,
        energyRequiredKwh: calculation.energyRequiredKwh,
        estimatedDurationMinutes: durationMinutes,
        estimatedStartTime: calculatedStartTime,
        estimatedEndTime: calculatedEndTime,
        estimatedQueueWaitMinutes:
          queuedWaitMinutes + bookingWaitMinutes,
        distanceKm:
          distanceKm === null ? null : Number(distanceKm.toFixed(2))
      });
    }

    if (alternatives.length === 0) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(400).json({
        success: false,
        message: "Unable to calculate valid charging alternatives"
      });
    }

    // STEP 8: RANK ALTERNATIVES
    alternatives.sort((a, b) => {
      // FIRST: LOWEST WAITING TIME
      if (
        a.estimatedQueueWaitMinutes !==
        b.estimatedQueueWaitMinutes
      ) {
        return a.estimatedQueueWaitMinutes -
          b.estimatedQueueWaitMinutes;
      }

      // SECOND: SHORTEST DISTANCE
      const distanceA =
        a.distanceKm === null ? Infinity : a.distanceKm;

      const distanceB =
        b.distanceKm === null ? Infinity : b.distanceKm;

      if (distanceA !== distanceB) {
        return distanceA - distanceB;
      }

      // THIRD: HIGHEST CHARGING POWER
      return b.chargingPowerKw - a.chargingPowerKw;
    });

    // STEP 9: PREVENT OVERLAPPING BOOKINGS FOR THIS USER
    const maximumEndTime = alternatives.reduce(
      (latest, alternative) =>
        alternative.estimatedEndTime > latest
          ? alternative.estimatedEndTime
          : latest,
      alternatives[0].estimatedEndTime
    );

    const [activeBookings] = await connection.query(
      `SELECT booking_id
       FROM bookings
       WHERE user_id = ?
         AND status IN ('PENDING', 'CONFIRMED')
         AND start_time < ?
         AND end_time > ?
       LIMIT 1
       FOR UPDATE`,
      [
        userIdNumber,
        maximumEndTime,
        calculatedStartTime
      ]
    );

    if (activeBookings.length > 0) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(409).json({
        success: false,
        message: "You already have an overlapping active booking",
        existingBookingId: activeBookings[0].booking_id
      });
    }

    // STEP 10: CREATE ONE ALTERNATIVE GROUP
    const alternativeGroupId = randomUUID();

    const createdRequests = [];

    for (const alternative of alternatives) {

      const [result] = await connection.query(
        `INSERT INTO booking_requests
         (
           user_id,
           vehicle_model_id,
           start_time,
           end_time,
           battery_level,
           target_battery_level,
           estimated_duration_minutes,
           priority,
           alternative_group_id,
           candidate_point_id
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userIdNumber,
          vehicleModelIdNumber,
          alternative.estimatedStartTime,
          alternative.estimatedEndTime,
          currentBattery,
          targetBattery,
          alternative.estimatedDurationMinutes,
          requestPriority,
          alternativeGroupId,
          alternative.pointId
        ]
      );

      createdRequests.push({
        requestId: result.insertId,
        pointId: alternative.pointId,
        pointCode: alternative.pointCode,
        chargingPowerKw: alternative.chargingPowerKw,
        estimatedDurationMinutes:
          alternative.estimatedDurationMinutes,
        estimatedQueueWaitMinutes:
          alternative.estimatedQueueWaitMinutes,
        distanceKm: alternative.distanceKm,
        estimatedStartTime: alternative.estimatedStartTime,
        estimatedEndTime: alternative.estimatedEndTime
      });
    }

    await connection.commit();
    transactionStarted = false;

    // STEP 11: RETURN ALL ALTERNATIVES
    res.status(201).json({
      success: true,
      message: "Alternative booking requests added successfully",

      alternativeGroupId,
      requestStatus: "WAITING",
      totalAlternatives: createdRequests.length,

      userLocationProvided:
        latitude !== null && longitude !== null,

      selectedBestAlternative: createdRequests[0],

      alternatives: createdRequests,

      currentBatteryLevel: currentBattery,
      targetBatteryLevel: targetBattery,
      batteryCapacityKwh:
        alternatives[0].batteryCapacityKwh,
      energyRequiredKwh:
        alternatives[0].energyRequiredKwh,

      priority: requestPriority
    });

  } catch (error) {

    if (transactionStarted) {
      await connection.rollback();
    }

    console.error("Booking request error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to add booking request"
    });

  } finally {

    if (userLockAcquired) {
      try {
        await connection.query(
          `SELECT RELEASE_LOCK(?)`,
          [userLockName]
        );
      } catch (lockError) {
        console.error(
          "User lock release error:",
          lockError.message
        );
      }
    }

    connection.release();
  }
});

app.post("/api/booking-requests/process-next", async (req, res) => {
  const connection = await pool.getConnection();

  let transactionStarted = false;
  let userLockAcquired = false;
  let userLockName = null;

  try {
    await connection.beginTransaction();
    transactionStarted = true;
  // STEP 0: MARK EXPIRED WAITING REQUESTS
const [expiredResult] = await connection.query(
  `UPDATE booking_requests
   SET request_status = 'EXPIRED',
       failure_reason = 'Booking request expired because its end time has passed',
       processed_at = NOW()
   WHERE request_status = 'WAITING'
     AND end_time <= NOW()`
);

console.log(
  "Expired requests updated:",
  expiredResult.affectedRows
);

    // STEP 1: GET THE HIGHEST-PRIORITY WAITING REQUEST

const requestedRequestId = req.body?.requestId ?? null;

if (
    requestedRequestId !== null &&
    (!Number.isInteger(Number(requestedRequestId)) ||
     Number(requestedRequestId) <= 0)
) {
    await connection.rollback();
    transactionStarted = false;

    return res.status(400).json({
        success: false,
        message: "Invalid request ID"
    });
}

let requests;

if (requestedRequestId !== null) {
    [requests] = await connection.query(
        `SELECT *
         FROM booking_requests
         WHERE request_status = 'WAITING'
           AND end_time > NOW()
           AND request_id = ?
         LIMIT 1
         FOR UPDATE`,
        [Number(requestedRequestId)]
    );
} else {
    [requests] = await connection.query(
        `SELECT *
         FROM booking_requests
         WHERE request_status = 'WAITING'
           AND end_time > NOW()
         ORDER BY priority ASC, created_at ASC, request_id ASC
         FOR UPDATE`
    );
}

// CREATE THE PRIORITY QUEUE
const priorityQueue = new PriorityQueue();

// INSERT WAITING REQUESTS INTO THE HEAP
for (const waitingRequest of requests) {
    priorityQueue.enqueue(waitingRequest);
}

// GET THE HIGHEST-PRIORITY REQUEST
const request = priorityQueue.dequeue();

if (request === null) {
    await connection.commit();
    transactionStarted = false;

    return res.json({
        success: true,
        message: "No eligible waiting booking request found"
    });
}

    // STEP 2: LOCK THIS USER'S BOOKING OPERATIONS
    userLockName = `ev_user_${request.user_id}`;

    const [lockResult] = await connection.query(
      `SELECT GET_LOCK(?, 10) AS lock_acquired`,
      [userLockName]
    );

    if (Number(lockResult[0].lock_acquired) !== 1) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(409).json({
        success: false,
        message: "Unable to lock user booking operation. Try again."
      });
    }

    userLockAcquired = true;

    // STEP 3: GET ALL ALTERNATIVES IN THE SAME GROUP
    let alternativeRequests = [request];

    if (request.alternative_group_id) {
      const [groupRows] = await connection.query(
        `SELECT *
         FROM booking_requests
         WHERE alternative_group_id = ?
           AND request_status = 'WAITING'
           AND end_time > NOW()
         ORDER BY request_id ASC
         FOR UPDATE`,
        [request.alternative_group_id]
      );

      alternativeRequests = groupRows;
    }

    // STEP 5: TRY EACH ALTERNATIVE CHARGING POINT
    let allocatedPoint = null;
    let selectedRequest = null;

    for (const alternative of alternativeRequests) {

      const point = await findAvailablePoint(
        connection,
        alternative.vehicle_model_id,
        alternative.start_time,
        alternative.end_time,
        alternative.candidate_point_id
      );

      if (point) {
        allocatedPoint = point;
        selectedRequest = alternative;
        break;
      }
    }

    // STEP 6: KEEP ALL ALTERNATIVES WAITING IF NONE IS AVAILABLE
    if (!allocatedPoint) {
      await connection.query(
        `UPDATE booking_requests
         SET failure_reason = ?
         WHERE request_status = 'WAITING'
           AND (
             request_id = ?
             OR alternative_group_id = ?
           )`,
        [
          "No compatible charging point is currently available",
          request.request_id,
          request.alternative_group_id
        ]
      );

      await connection.commit();
      transactionStarted = false;

      return res.json({
        success: true,
        message: "No compatible charging point available. Request remains WAITING.",
        requestId: request.request_id,
        requestStatus: "WAITING"
      });
    }

    // STEP 4: CHECK FOR AN EXISTING OVERLAPPING USER BOOKING
const [activeBookings] = await connection.query(
    `SELECT booking_id
     FROM bookings
     WHERE user_id = ?
       AND status IN ('PENDING', 'CONFIRMED')
       AND start_time < ?
       AND end_time > ?
     LIMIT 1
     FOR UPDATE`,
    [
        selectedRequest.user_id,
        selectedRequest.end_time,
        selectedRequest.start_time
    ]
);

if (activeBookings.length > 0) {

    await connection.query(
        `UPDATE booking_requests
         SET failure_reason = ?
         WHERE request_status = 'WAITING'
           AND (request_id = ? OR alternative_group_id = ?)`,
        [
            "User already has an overlapping active booking",
            selectedRequest.request_id,
            selectedRequest.alternative_group_id
        ]
    );

    await connection.commit();
    transactionStarted = false;

    return res.status(409).json({
        success: false,
        status: "WAITING",
        message: "User already has an overlapping active booking",
        requestId: selectedRequest.request_id
    });
}
    // STEP 7: CREATE ONLY ONE CONFIRMED BOOKING
    const [bookingResult] = await connection.query(
      `INSERT INTO bookings
       (
         user_id,
         vehicle_model_id,
         point_id,
         start_time,
         end_time,
         battery_level,
         priority,
         status
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, 'CONFIRMED')`,
      [
        selectedRequest.user_id,
        selectedRequest.vehicle_model_id,
        allocatedPoint.point_id,
        selectedRequest.start_time,
        selectedRequest.end_time,
        selectedRequest.battery_level,
        selectedRequest.priority
      ]
    );

    const bookingId = bookingResult.insertId;

    // STEP 8: RECORD THE ALLOCATION DECISION
    await connection.query(
      `INSERT INTO allocation_logs
       (booking_id, point_id, decision, reason)
       VALUES (?, ?, ?, ?)`,
      [
        bookingId,
        allocatedPoint.point_id,
        "ALLOCATED",
        "Compatible charging point found with no overlapping booking"
      ]
    );

    // STEP 9: ALLOCATE SELECTED REQUEST AND CANCEL OTHER ALTERNATIVES
    if (request.alternative_group_id) {
      await connection.query(
        `UPDATE booking_requests
         SET request_status =
               CASE
                 WHEN request_id = ? THEN 'ALLOCATED'
                 ELSE 'CANCELLED'
               END,
             booking_id =
               CASE
                 WHEN request_id = ? THEN ?
                 ELSE NULL
               END,
             processed_at = CURRENT_TIMESTAMP,
             failure_reason =
               CASE
                 WHEN request_id = ? THEN NULL
                 ELSE 'Another alternative was selected'
               END
         WHERE alternative_group_id = ?
           AND request_status = 'WAITING'`,
        [
          selectedRequest.request_id,
          selectedRequest.request_id,
          bookingId,
          selectedRequest.request_id,
          request.alternative_group_id
        ]
      );
    } else {
      await connection.query(
        `UPDATE booking_requests
         SET request_status = 'ALLOCATED',
             booking_id = ?,
             processed_at = CURRENT_TIMESTAMP,
             failure_reason = NULL
         WHERE request_id = ?`,
        [bookingId, selectedRequest.request_id]
      );
    }

    await connection.commit();
    transactionStarted = false;

    res.json({
      success: true,
      message: "Booking request successfully allocated",
      requestId: selectedRequest.request_id,
      bookingId: bookingId,
      pointId: allocatedPoint.point_id,
      pointCode: allocatedPoint.point_code,
      requestStatus: "ALLOCATED",
      alternativeGroupId: request.alternative_group_id,
      alternativesCancelled: request.alternative_group_id
        ? alternativeRequests.length - 1
        : 0
    });

  } catch (error) {
    if (transactionStarted) {
      await connection.rollback();
    }

    console.error("Queue processing error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to process booking queue"
    });

  } finally {
    if (userLockAcquired) {
      try {
        await connection.query(
          `SELECT RELEASE_LOCK(?)`,
          [userLockName]
        );
      } catch (lockError) {
        console.error("User lock release error:", lockError.message);
      }
    }

    connection.release();
  }
});


// GET BOOKING HISTORY FOR A USER
app.get("/api/bookings/user/:userId", async (req, res) => {
  try {
    const userId = Number(req.params.userId);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID"
      });
    }

    const [bookings] = await pool.query(
      `SELECT
          booking_id,
          user_id,
          point_id,
          start_time,
          end_time,
          battery_level,
          priority,
          status,
          created_at
       FROM bookings
       WHERE user_id = ?
       ORDER BY created_at DESC, booking_id DESC`,
      [userId]
    );

    res.json({
      success: true,
      userId: userId,
      totalBookings: bookings.length,
      bookings: bookings
    });

  } catch (error) {
    console.error("Booking history error:", error.message);

    res.status(500).json({
      success: false,
      message: "Unable to retrieve booking history"
    });
  }
});

// GET INDIVIDUAL BOOKING STATUS
app.get("/api/bookings/:bookingId", async (req, res) => {
  try {
    const bookingId = Number(req.params.bookingId);

    if (!Number.isInteger(bookingId) || bookingId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking ID"
      });
    }

    const [bookings] = await pool.query(
      `SELECT *
       FROM bookings
       WHERE booking_id = ?`,
      [bookingId]
    );

    if (bookings.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Booking not found"
      });
    }

    res.json({
      success: true,
      booking: bookings[0]
    });

  } catch (error) {
    console.error("Booking status error:", error.message);

    res.status(500).json({
      success: false,
      message: "Unable to retrieve booking status"
    });
  }
});

// CANCEL AN EXISTING BOOKING
app.post("/api/bookings/:bookingId/cancel", async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const bookingId = Number(req.params.bookingId);

    if (!Number.isInteger(bookingId) || bookingId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking ID"
      });
    }

    await connection.beginTransaction();

    // STEP 1: FIND AND LOCK THE BOOKING
    const [bookings] = await connection.query(
      `SELECT booking_id, point_id, status
       FROM bookings
       WHERE booking_id = ?
       FOR UPDATE`,
      [bookingId]
    );

    if (bookings.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Booking not found"
      });
    }

    const booking = bookings[0];

    // STEP 2: CHECK BOOKING STATUS
    if (booking.status !== "CONFIRMED") {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message: `Booking cannot be cancelled because its status is ${booking.status}`
      });
    }

    // STEP 3: UPDATE BOOKING STATUS
    await connection.query(
      `UPDATE bookings
       SET status = 'CANCELLED'
       WHERE booking_id = ?`,
      [bookingId]
    );

    // STEP 4: RECORD CANCELLATION
    await connection.query(
      `INSERT INTO allocation_logs
       (booking_id, point_id, decision, reason)
       VALUES (?, ?, ?, ?)`,
      [
        bookingId,
        booking.point_id,
        "CANCELLED",
        "Booking cancelled by user"
      ]
    );

   await connection.commit();

// STEP 5: AUTOMATICALLY PROCESS THE WAITING QUEUE
try {
  const queueResponse = await fetch(
    `http://localhost:${PORT}/api/booking-requests/process-next`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    }
  );

  const queueResult = await queueResponse.json();

  console.log(
    "Queue processing after cancellation:",
    queueResult.message
  );

} catch (queueError) {
  console.error(
    "Automatic queue processing failed:",
    queueError.message
  );
}

res.json({
  success: true,
  message: "Booking cancelled successfully",
  bookingId: bookingId,
  status: "CANCELLED"
});

  } catch (error) {
    await connection.rollback();

    console.error("Booking cancellation error:", error.message);

    res.status(500).json({
      success: false,
      message: "Unable to cancel booking"
    });

  } finally {
    connection.release();
  }
});
// MODIFY AN EXISTING BOOKING
app.put("/api/bookings/:bookingId/modify", async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const bookingId = Number(req.params.bookingId);
    const { startTime, endTime } = req.body;

    if (!Number.isInteger(bookingId) || bookingId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking ID"
      });
    }

   const start = new Date(startTime);
const end = new Date(endTime);

if (
  !startTime ||
  !endTime ||
  Number.isNaN(start.getTime()) ||
  Number.isNaN(end.getTime()) ||
  end <= start
) {
  return res.status(400).json({
    success: false,
    message: "Valid start and end times are required"
  });
}

if (start.getTime() <= Date.now()) {
  return res.status(400).json({
    success: false,
    message: "Booking start time must be in the future"
  });
}

if (end.getTime() <= Date.now()) {
  return res.status(400).json({
    success: false,
    message: "Booking end time must be in the future"
  });
}
    await connection.beginTransaction();

    // STEP 1: FIND AND LOCK THE BOOKING
    const [bookings] = await connection.query(
      `SELECT booking_id, point_id, status
       FROM bookings
       WHERE booking_id = ?
       FOR UPDATE`,
      [bookingId]
    );

    if (bookings.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Booking not found"
      });
    }

    const booking = bookings[0];

    // STEP 2: ONLY CONFIRMED BOOKINGS CAN BE MODIFIED
    if (booking.status !== "CONFIRMED") {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message: "Only confirmed bookings can be modified"
      });
    }

    // STEP 3: LOCK THE ALLOCATED CHARGING POINT
    await connection.query(
      `SELECT point_id
       FROM charging_points
       WHERE point_id = ?
       FOR UPDATE`,
      [booking.point_id]
    );

    // STEP 4: CHECK FOR OVERLAPPING BOOKINGS
    const [conflicts] = await connection.query(
      `SELECT booking_id
       FROM bookings
       WHERE point_id = ?
         AND booking_id != ?
         AND status IN ('PENDING', 'CONFIRMED')
         AND start_time < ?
         AND end_time > ?
       FOR UPDATE`,
      [booking.point_id, bookingId, endTime, startTime]
    );

    if (conflicts.length > 0) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message: "Charging point is already booked during the requested time"
      });
    }

    // STEP 5: UPDATE THE BOOKING TIME
    await connection.query(
      `UPDATE bookings
       SET start_time = ?, end_time = ?
       WHERE booking_id = ?`,
      [startTime, endTime, bookingId]
    );

    // STEP 6: RECORD THE MODIFICATION
    await connection.query(
      `INSERT INTO allocation_logs
       (booking_id, point_id, decision, reason)
       VALUES (?, ?, ?, ?)`,
      [
        bookingId,
        booking.point_id,
        "MODIFIED",
        "Booking time modified after availability check"
      ]
    );

    await connection.commit();

    res.json({
      success: true,
      message: "Booking modified successfully",
      bookingId: bookingId,
      pointId: booking.point_id,
      startTime: startTime,
      endTime: endTime,
      status: "CONFIRMED"
    });

  } catch (error) {
    await connection.rollback();

    console.error("Booking modification error:", error.message);

    res.status(500).json({
      success: false,
      message: "Unable to modify booking"
    });

  } finally {
    connection.release();
  }
});

// MODIFY AN EXISTING BOOKING
app.put("/api/bookings/:bookingId/modify", async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const bookingId = Number(req.params.bookingId);
    const { startTime, endTime } = req.body;

   const start = new Date(startTime);
const end = new Date(endTime);

if (
  !startTime ||
  !endTime ||
  Number.isNaN(start.getTime()) ||
  Number.isNaN(end.getTime()) ||
  end <= start
) {
  return res.status(400).json({
    success: false,
    message: "Valid start and end times are required"
  });
}

if (start.getTime() <= Date.now()) {
  return res.status(400).json({
    success: false,
    message: "Booking start time must be in the future"
  });
}

if (end.getTime() <= Date.now()) {
  return res.status(400).json({
    success: false,
    message: "Booking end time must be in the future"
  });
}
if (new Date(startTime).getTime() <= Date.now()) {
  return res.status(400).json({
    success: false,
    message: "Booking start time must be in the future"
  });
}
    await connection.beginTransaction();

    // STEP 1: FIND AND LOCK THE BOOKING
    const [bookings] = await connection.query(
      `SELECT booking_id, point_id, status
       FROM bookings
       WHERE booking_id = ?
       FOR UPDATE`,
      [bookingId]
    );

    if (bookings.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Booking not found"
      });
    }

    const booking = bookings[0];

    // STEP 2: ONLY CONFIRMED BOOKINGS CAN BE MODIFIED
    if (booking.status !== "CONFIRMED") {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message: "Only confirmed bookings can be modified"
      });
    }

    // STEP 3: LOCK THE ALLOCATED CHARGING POINT
    await connection.query(
      `SELECT point_id
       FROM charging_points
       WHERE point_id = ?
       FOR UPDATE`,
      [booking.point_id]
    );

    // STEP 4: CHECK FOR OVERLAPPING BOOKINGS
    const [conflicts] = await connection.query(
      `SELECT booking_id
       FROM bookings
       WHERE point_id = ?
         AND booking_id != ?
         AND status IN ('PENDING', 'CONFIRMED')
         AND start_time < ?
         AND end_time > ?
       FOR UPDATE`,
      [booking.point_id, bookingId, endTime, startTime]
    );

    if (conflicts.length > 0) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message: "Charging point is already booked during the requested time"
      });
    }

    // STEP 5: UPDATE THE BOOKING TIME
    await connection.query(
      `UPDATE bookings
       SET start_time = ?, end_time = ?
       WHERE booking_id = ?`,
      [startTime, endTime, bookingId]
    );

    // STEP 6: RECORD THE MODIFICATION
    await connection.query(
      `INSERT INTO allocation_logs
       (booking_id, point_id, decision, reason)
       VALUES (?, ?, ?, ?)`,
      [
        bookingId,
        booking.point_id,
        "MODIFIED",
        "Booking time modified after availability check"
      ]
    );

    await connection.commit();

    res.json({
      success: true,
      message: "Booking modified successfully",
      bookingId: bookingId,
      pointId: booking.point_id,
      startTime: startTime,
      endTime: endTime,
      status: "CONFIRMED"
    });

  } catch (error) {
    await connection.rollback();

    console.error("Booking modification error:", error.message);

    res.status(500).json({
      success: false,
      message: "Unable to modify booking"
    });

  } finally {
    connection.release();
  }
});

// START BACKEND SERVER
app.listen(PORT, () => {
  console.log(`EV Charging backend running at http://localhost:${PORT}`);
});
