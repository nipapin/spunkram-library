/** One FIFO for network, file reads and decoding, including duplicate consumers. */
export class PosterQueue {
    load;
    concurrency;
    jobs = new Map();
    pending = [];
    active = 0;
    constructor(load, concurrency = 4) {
        this.load = load;
        this.concurrency = concurrency;
    }
    subscribe(key, listener) {
        let job = this.jobs.get(key);
        if (!job) {
            job = { key, listeners: new Set(), started: false, settled: false, resource: null };
            this.jobs.set(key, job);
            this.pending.push(job);
        }
        const current = job;
        current.listeners.add(listener);
        if (current.settled)
            listener(current.resource?.url ?? null);
        this.pump();
        return () => {
            current.listeners.delete(listener);
            if (current.listeners.size)
                return;
            if (!current.started) {
                this.pending = this.pending.filter((entry) => entry !== current);
                this.jobs.delete(key);
            }
            else if (current.settled) {
                current.resource?.release();
                this.jobs.delete(key);
            }
        };
    }
    pump() {
        while (this.active < this.concurrency && this.pending.length) {
            const job = this.pending.shift();
            job.started = true;
            this.active += 1;
            // Yield between completions even when every file is already cached.
            setTimeout(() => {
                void this.run(job);
            }, 0);
        }
    }
    async run(job) {
        try {
            if (job.listeners.size)
                job.resource = await this.load(job.key);
        }
        catch {
            job.resource = null;
        }
        job.settled = true;
        if (!job.listeners.size) {
            job.resource?.release();
            this.jobs.delete(job.key);
        }
        else {
            for (const listener of job.listeners)
                listener(job.resource?.url ?? null);
        }
        this.active -= 1;
        this.pump();
    }
}
