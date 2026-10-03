import type { CapabilityId } from '@shopping-navigation/contracts';
import type { CapabilityEvidence, CapabilityRecord, InMemoryCapabilityRegistry } from './capability-registry.js';

export interface CapabilityEvidenceRepository {
  list(capabilityId?: CapabilityId): readonly CapabilityEvidence[];
  append(evidence: CapabilityEvidence): void;
}

export class InMemoryCapabilityEvidenceRepository implements CapabilityEvidenceRepository {
  private readonly entries: CapabilityEvidence[] = [];

  public list(capabilityId?: CapabilityId): readonly CapabilityEvidence[] {
    return this.entries.filter((entry) => capabilityId === undefined || entry.capabilityId === capabilityId).map((entry) => ({ ...entry }));
  }

  public append(evidence: CapabilityEvidence): void {
    if (this.entries.some((entry) => entry.evidenceId === evidence.evidenceId)) throw new Error(`Duplicate capability evidence ${evidence.evidenceId}`);
    this.entries.push({ ...evidence });
  }
}

export function recordCapabilityEvidence(registry: InMemoryCapabilityRegistry, repository: CapabilityEvidenceRepository, evidence: CapabilityEvidence): CapabilityRecord {
  repository.append(evidence);
  return registry.addEvidence(evidence);
}
