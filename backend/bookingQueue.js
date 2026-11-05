
const PriorityQueue = require("./priorityQueue");

const bookingQueue = new PriorityQueue();

function addBookingRequest(request) {
    bookingQueue.enqueue(request);

    return {
        message: "Booking request added to priority queue",
        queueSize: bookingQueue.size(),
        nextRequest: bookingQueue.peek()
    };
}

function getNextBookingRequest() {
    return bookingQueue.dequeue();
}

function getQueueSize() {
    return bookingQueue.size();
}

function isQueueEmpty() {
    return bookingQueue.isEmpty();
}

module.exports = {
    addBookingRequest,
    getNextBookingRequest,
    getQueueSize,
    isQueueEmpty
};
