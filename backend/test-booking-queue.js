const {
    addBookingRequest,
    getNextBookingRequest,
    getQueueSize,
    isQueueEmpty
} = require("./bookingQueue");

console.log("ADDING BOOKING REQUESTS");

addBookingRequest({
    userId: 1001,
    priority: 3,
    vehicleModelId: 13
});

addBookingRequest({
    userId: 1002,
    priority: 1,
    vehicleModelId: 13
});

addBookingRequest({
    userId: 1003,
    priority: 2,
    vehicleModelId: 13
});

addBookingRequest({
    userId: 1004,
    priority: 1,
    vehicleModelId: 13
});

console.log("Total waiting requests:", getQueueSize());

console.log("\nPROCESSING BOOKING REQUESTS");

while (!isQueueEmpty()) {
    const request = getNextBookingRequest();

    console.log(
        "User:", request.userId,
        "| Priority:", request.priority
    );
}

console.log("\nRemaining requests:", getQueueSize());