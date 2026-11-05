const pool = require("./db");

async function testConnection() {
    try {
        const connection = await pool.getConnection();

        const [rows] = await connection.query(
            "SELECT DATABASE() AS databaseName, VERSION() AS mysqlVersion"
        );

        console.log("MySQL connection successful!");
        console.log(rows[0]);

        connection.release();
        await pool.end();
    } catch (error) {
        console.error("MySQL connection failed:", error.message);
        await pool.end();
        process.exitCode = 1;
    }
}

testConnection();