const ACTIVE_STATUSES = new Set(["running", "rendering"]);
const RESUMABLE_STATUSES = new Set(["queued", "running"]);

function now() {
  return new Date().toISOString();
}

export class TaskScheduler {
  constructor({ store, maxConcurrency = 2, worker }) {
    this.store = store;
    this.maxConcurrency = Math.max(1, Number(maxConcurrency) || 2);
    this.worker = worker;
    this.pending = [];
    this.active = new Set();
    this.deferred = new Set();
    this.pumping = false;
    this.resumed = false;
  }

  async enqueue(id, { message = "任务已进入生产队列" } = {}) {
    if (this.pending.includes(id) || this.deferred.has(id)) return this.store.get(id);
    const project = await this.store.get(id);
    if (!project) throw new Error("项目不存在");
    if (this.active.has(id)) this.deferred.add(id);
    else this.pending.push(id);
    project.status = "queued";
    project.queuedAt = now();
    project.startedAt = null;
    project.completedAt = null;
    project.updatedAt = now();
    project.error = null;
    if (message) project.activity.unshift({ at: now(), message });
    await this.store.save(project);
    await this.updateQueuePositions();
    queueMicrotask(() => this.pump());
    return this.store.get(id);
  }

  async pump() {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.active.size < this.maxConcurrency && this.pending.length) {
        const id = this.pending.shift();
        this.active.add(id);
        await this.updateQueuePositions();
        this.worker(id)
          .then((retainSlot) => {
            if (!retainSlot) return this.release(id);
          })
          .catch(() => this.release(id));
      }
    } finally {
      this.pumping = false;
    }
  }

  async release(id) {
    this.active.delete(id);
    if (this.deferred.delete(id) && !this.pending.includes(id)) this.pending.push(id);
    await this.updateQueuePositions();
    queueMicrotask(() => this.pump());
  }

  async updateQueuePositions() {
    const averageMinutes = await this.averageDurationMinutes();
    await Promise.all(this.pending.map(async (id, index) => {
      const project = await this.store.get(id);
      if (!project) return;
      const queuePosition = index + 1;
      project.queuePosition = queuePosition;
      project.estimatedWaitMinutes = Math.max(
        1,
        Math.ceil((queuePosition / this.maxConcurrency) * averageMinutes)
      );
      project.updatedAt = now();
      await this.store.save(project);
    }));
  }

  async averageDurationMinutes() {
    const durations = (await this.store.list())
      .filter((project) => project.startedAt && project.completedAt)
      .map((project) => (new Date(project.completedAt) - new Date(project.startedAt)) / 60000)
      .filter((duration) => Number.isFinite(duration) && duration > 0)
      .slice(0, 20);
    if (!durations.length) return 15;
    return Math.max(1, Math.ceil(durations.reduce((sum, value) => sum + value, 0) / durations.length));
  }

  async resume() {
    if (this.resumed) return;
    this.resumed = true;
    const projects = await this.store.list();
    for (const project of projects) {
      if (project.status === "rendering") {
        this.active.add(project.id);
      } else if (RESUMABLE_STATUSES.has(project.status)) {
        this.pending.push(project.id);
        project.status = "queued";
        project.queuedAt ||= project.createdAt;
        project.activity.unshift({ at: now(), message: "服务恢复，任务重新进入队列" });
        await this.store.save(project);
      }
    }
    this.pending.sort((leftId, rightId) => {
      const left = projects.find((project) => project.id === leftId);
      const right = projects.find((project) => project.id === rightId);
      return (left?.queuePosition || Infinity) - (right?.queuePosition || Infinity)
        || left.createdAt.localeCompare(right.createdAt);
    });
    await this.updateQueuePositions();
    queueMicrotask(() => this.pump());
  }

  async snapshot() {
    const projects = await this.store.list();
    const averageDurationMinutes = await this.averageDurationMinutes();
    const active = projects.filter((project) => ACTIVE_STATUSES.has(project.status));
    const queued = projects
      .filter((project) => project.status === "queued")
      .sort((left, right) => (left.queuePosition || Infinity) - (right.queuePosition || Infinity));
    return {
      maxConcurrency: this.maxConcurrency,
      activeCount: active.length,
      queuedCount: queued.length,
      availableSlots: Math.max(0, this.maxConcurrency - active.length),
      averageDurationMinutes,
      activeIds: active.map((project) => project.id),
      queuedIds: queued.map((project) => project.id)
    };
  }
}
