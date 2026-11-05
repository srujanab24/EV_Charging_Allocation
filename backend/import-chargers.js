const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const pool = require("./db");

const datasetPath = path.join(
    __dirname,
    "..",
    "data",
    "raw","ChargingRecords_All_Unique_Records.csv"
);

async function importChargers() {
    const chargers = new Map();

    try {
        await new Promise((resolve, reject) => {
            fs.createReadStream(datasetPath)
                .pipe(csv())
                .on("data", (record) => {
                    const id = Number(record.ChargerID);

                    if (!Number.isInteger(id) || id <= 0) {
                        return;
                    }

                    if (!chargers.has(id)) {
                        chargers.set(id, {
                            type: record.ChargerType || "Unknown",
                            location: record.Location || null
                        });
                    }
                })
                .on("end", resolve)
                .on("error", reject);
        });

        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            for (const [id, charger] of chargers) {
                await connection.query(
                    `INSERT INTO chargers
                    (charger_id, charger_type, location, status)
                    VALUES (?, ?, ?, 'AVAILABLE')
                    ON DUPLICATE KEY UPDATE
                    charger_type = VALUES(charger_type),
                    location = VALUES(location)`,
                    [id, charger.type, charger.location]
                );
            }

            await connection.commit();

            console.log("Charger import successful!");
            console.log("Unique chargers processed:", chargers.size);
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error("Charger import failed:", error.message);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

importChargers();