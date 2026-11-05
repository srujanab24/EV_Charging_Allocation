const PriorityQueue = require("./priorityQueue");

const queue = new PriorityQueue();

queue.enqueue({ userId: 1001, priority: 3 });
queue.enqueue({ userId: 1002, priority: 1 });
queue.enqueue({ userId: 1003, priority: 2 });
queue.enqueue({ userId: 1004, priority: 1 });

console.log("Total requests:", queue.size());

console.log("Processing order:");

while (!queue.isEmpty()) {
    const request = queue.dequeue();

    console.log(
        "User ID:", request.userId,
        "| Priority:", request.priority
    );
}