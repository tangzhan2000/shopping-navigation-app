import type { PurchaseProtectionService } from './purchase-protection-service.js';
import { Worker, type JobQueue, type WorkerOutcome } from './worker.js';

export interface PurchaseProtectionSchedulerOptions {
  readonly service: PurchaseProtectionService;
  readonly queue: JobQueue;
}

export class PurchaseProtectionScheduler {
  private readonly worker: Worker;

  public constructor(options: PurchaseProtectionSchedulerOptions) {
    this.worker = new Worker(options.queue, new Map([
      ['purchase_protection_deadline', async (job) => {
        const payload = job.payload as { caseId?: unknown };
        if (typeof payload.caseId !== 'string') throw new Error('Invalid purchase protection deadline payload');
        await options.service.processDue(payload.caseId);
      }],
    ]));
  }

  public runOnce(now = Date.now()): Promise<WorkerOutcome> {
    return this.worker.runOnce(now);
  }

  public drain(now = Date.now(), limit = 100): Promise<readonly WorkerOutcome[]> {
    return this.worker.drain(now, limit);
  }
}
