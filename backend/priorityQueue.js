class PriorityQueue {
    constructor() {
        this.heap = [];
        this.sequence = 0;
    }

    enqueue(request) {
        const newRequest = {
            ...request,
            sequence: this.sequence++
        };

        this.heap.push(newRequest);
        this.heapifyUp(this.heap.length - 1);
    }

    dequeue() {
        if (this.isEmpty()) {
            return null;
        }

        const highestPriority = this.heap[0];
        const lastElement = this.heap.pop();

        if (!this.isEmpty()) {
            this.heap[0] = lastElement;
            this.heapifyDown(0);
        }

        return highestPriority;
    }

    peek() {
        return this.isEmpty() ? null : this.heap[0];
    }

    isEmpty() {
        return this.heap.length === 0;
    }

    size() {
        return this.heap.length;
    }

    hasHigherPriority(a, b) {
        if (a.priority !== b.priority) {
            return a.priority < b.priority;
        }

        return a.sequence < b.sequence;
    }

    heapifyUp(index) {
        while (index > 0) {
            const parent = Math.floor((index - 1) / 2);

            if (!this.hasHigherPriority(
                this.heap[index],
                this.heap[parent]
            )) {
                break;
            }

            [this.heap[index], this.heap[parent]] =
                [this.heap[parent], this.heap[index]];

            index = parent;
        }
    }

    heapifyDown(index) {
        const length = this.heap.length;

        while (true) {
            let highest = index;
            const left = 2 * index + 1;
            const right = 2 * index + 2;

            if (
                left < length &&
                this.hasHigherPriority(
                    this.heap[left],
                    this.heap[highest]
                )
            ) {
                highest = left;
            }

            if (
                right < length &&
                this.hasHigherPriority(
                    this.heap[right],
                    this.heap[highest]
                )
            ) {
                highest = right;
            }

            if (highest === index) {
                break;
            }

            [this.heap[index], this.heap[highest]] =
                [this.heap[highest], this.heap[index]];

            index = highest;
        }
    }
}

module.exports = PriorityQueue;