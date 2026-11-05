
const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const pool = require("./db");

const DATA_DIR = path.join(__dirname, "..", "data", "processed");

function readCSV(filename) {
    return new Promise((resolve, reject) => {
        const records = [];

        fs.createReadStream(path.join(DATA_DIR, filename))
            .pipe(csv())
            .on("data", (record) => records.push(record))
            .on("end", () => resolve(records))
            .on("error", reject);
    });
}


async function importRecords(tableName, records, columns, mapRecord) {
    if (records.length === 0) {
        console.log(`${tableName}: No records found.`);
        return;
    }

    const connection = await pool.getConnection();

    try {
        const [countResult] = await connection.query(
            `SELECT COUNT(*) AS total FROM \`${tableName}\``
        );

        if (countResult[0].total > 0) {
            console.log(`${tableName}: Already contains records. Skipping import.`);
            return;
        }

        await connection.beginTransaction();

        const placeholders = columns.map(() => "?").join(", ");
        const columnNames = columns.map(column => `\`${column}\``).join(", ");

        const sql = `
            INSERT INTO \`${tableName}\` (${columnNames})
            VALUES (${placeholders})
        `;

        for (const record of records) {
            await connection.execute(sql, mapRecord(record));
        }

        await connection.commit();

        console.log(`${tableName}: ${records.length} records imported successfully.`);
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

async function main() {
    try {
        console.log("Starting Indian EV dataset import...");

        const stations = await readCSV("bee_charging_stations_india_cleaned.csv");
        const vehicles = await readCSV("india_ev_vehicle_master.csv");
        const twoWheelers = await readCSV("india_ev_two_wheeler_master.csv");
        const connectors = await readCSV("connector_standard_mapping.csv");

        console.log("CSV files loaded successfully.");

        await importRecords(
            "charging_stations",
            stations,
            [
                "cpo_name", "ownership", "state", "district",
                "city_village", "location", "latitude", "longitude",
                "charger_type", "charger_rating_kw",
                "connector_rating_kw", "number_of_connectors"
            ],
            r => [
                r.CPO_Name, r.Govt_Private, r.State, r.District,
                r.City_Village, r.Location, r.Latitude, r.Longitude,
                r.Charger_Type, r.Charger_Rating_kW,
                r.Connector_Rating_kW, r.Number_of_Connectors
            ]
        );

        await importRecords(
            "vehicle_catalogue",
            vehicles,
            [
                "make", "model", "variant", "battery_capacity_kwh",
                "motor_power_kw", "vehicle_weight_kg",
                "drag_coefficient_cd", "frontal_area_m2",
                "motor_efficiency_pct", "arai_range_km",
                "price_lakh_inr"
            ],
            r => [
                r.make, r.model, r.variant,
                r.battery_capacity_kWh_new, r.motor_power_kW,
                r.vehicle_weight_kg, r.drag_coefficient_Cd,
                r.frontal_area_m2, r.motor_efficiency_pct,
                r.ARAI_certified_range_km, r.price_lakh_INR
            ]
        );

        await importRecords(
            "two_wheeler_catalogue",
            twoWheelers,
            [
                "make", "model_series", "variant", "vehicle_category",
                "connector_standard", "charging_mode",
                "compatibility_status", "source_name", "source_url"
            ],
            r => [
                r.make, r.model_series, r.variant,
                r.vehicle_category, r.connector_standard,
                r.charging_mode, r.compatibility_status,
                r.source_name, r.source_url
            ]
        );

        await importRecords(
            "connector_standard_mapping",
            connectors,
            [
                "bee_label", "normalized_standard", "mapping_status",
                "vehicle_category_guidance", "notes",
                "source_url", "evidence_scope"
            ],
            r => [
                r.bee_label, r.normalized_standard, r.status,
                r.vehicle_category_guidance, r.notes,
                r.source_url, r.evidence_scope
            ]
        );

        console.log("All four datasets imported successfully.");
    } catch (error) {
        console.error("Dataset import failed:", error.message);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

main();
