async function findAvailablePoint(
    connection,
    vehicleModelId,
    startTime,
    endTime,
    candidatePointId = null
) {

    // STEP 1: FIND COMPATIBLE CHARGING POINTS
    const [candidates] = await connection.query(
        `SELECT DISTINCT
            cp.point_id,
            cp.point_code,
            cp.connector_type,
            cp.charging_mode,
            cp.max_power_kw
         FROM charging_points AS cp
         INNER JOIN vehicle_connector_compatibility AS vcc
            ON cp.connector_type = vcc.connector_standard
            AND (
                vcc.charging_mode IS NULL
                OR cp.charging_mode = vcc.charging_mode
            )
         WHERE vcc.vehicle_model_id = ?
            AND vcc.evidence_status = 'MANUFACTURER_VERIFIED'
            AND cp.status = 'AVAILABLE'
            AND (? IS NULL OR cp.point_id = ?)
         ORDER BY cp.max_power_kw DESC, cp.point_id ASC`,
        [vehicleModelId, candidatePointId, candidatePointId]
    );

    // STEP 2: CHECK EACH COMPATIBLE POINT
    for (const point of candidates) {

        // LOCK THE CHARGING POINT
        const [lockedPoints] = await connection.query(
            `SELECT point_id
             FROM charging_points
             WHERE point_id = ?
                AND status = 'AVAILABLE'
             FOR UPDATE`,
            [point.point_id]
        );

        if (lockedPoints.length === 0) {
            continue;
        }

        // STEP 3: CHECK BOOKING TIME CONFLICTS
        const [conflicts] = await connection.query(
            `SELECT booking_id
             FROM bookings
             WHERE point_id = ?
                AND status IN ('PENDING', 'CONFIRMED')
                AND start_time < ?
                AND end_time > ?
             FOR UPDATE`,
            [point.point_id, endTime, startTime]
        );

        // STEP 4: RETURN THE AVAILABLE POINT
        if (conflicts.length === 0) {
            return point;
        }
    }

    return null;
}

module.exports = findAvailablePoint;