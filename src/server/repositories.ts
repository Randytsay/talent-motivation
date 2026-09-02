import { randomUUID } from 'node:crypto';
import type { AIReport, AssessmentRecord, EventRecord, Identity, Participant } from './contracts';

export interface ParticipantsRepository {
  findByLineUserId(lineUserId: string): Promise<Participant | null>;
  findByParticipantId(participantId: string): Promise<Participant | null>;
  upsertIdentity(identity: Identity): Promise<Participant>;
  setLatestAssessment(participantId: string, assessmentId: string): Promise<void>;
}

export interface AssessmentsRepository {
  append(assessment: AssessmentRecord): Promise<AssessmentRecord>;
  findById(assessmentId: string): Promise<AssessmentRecord | null>;
  findLatestForParticipant(participantId: string): Promise<AssessmentRecord | null>;
}

export interface AIReportsRepository {
  save(report: AIReport): Promise<AIReport>;
  findByAssessmentId(assessmentId: string): Promise<AIReport | null>;
}

export interface EventsRepository {
  findById(eventId: string): Promise<EventRecord | null>;
  setCurrentPresenterAssessment(eventId: string, assessmentId: string): Promise<void>;
}

export interface Repositories {
  participants: ParticipantsRepository;
  assessments: AssessmentsRepository;
  reports: AIReportsRepository;
  events: EventsRepository;
}

/** Simple process-local adapter used only for local development and deterministic tests. */
export class InMemoryRepositories implements Repositories {
  readonly participants: ParticipantsRepository;
  readonly assessments: AssessmentsRepository;
  readonly reports: AIReportsRepository;
  readonly events: EventsRepository;

  private readonly participantByLineId = new Map<string, Participant>();
  private readonly assessmentsById = new Map<string, AssessmentRecord>();
  private readonly assessmentIdsByParticipant = new Map<string, string[]>();
  private readonly reportsByAssessmentId = new Map<string, AIReport>();
  private readonly eventById = new Map<string, EventRecord>([
    ['mock-event-001', {
      eventId: 'mock-event-001',
      eventCode: 'MOCK',
      eventName: 'Local Mock Event',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
    }],
  ]);

  constructor(private readonly now: () => string = () => new Date().toISOString()) {
    this.participants = {
      findByLineUserId: async (lineUserId) => this.participantByLineId.get(lineUserId) ?? null,
      findByParticipantId: async (participantId) => {
        for (const participant of this.participantByLineId.values()) {
          if (participant.participantId === participantId) return participant;
        }
        return null;
      },
      upsertIdentity: async (identity) => {
        const existing = this.participantByLineId.get(identity.lineUserId);
        if (existing) {
          const updated = { ...existing, ...identity, lastSeenAt: this.now() };
          this.participantByLineId.set(identity.lineUserId, updated);
          return updated;
        }
        const participant: Participant = {
          participantId: randomUUID(),
          ...identity,
          createdAt: this.now(),
          lastSeenAt: this.now(),
        };
        this.participantByLineId.set(identity.lineUserId, participant);
        return participant;
      },
      setLatestAssessment: async (participantId, assessmentId) => {
        for (const [lineUserId, participant] of this.participantByLineId) {
          if (participant.participantId === participantId) {
            this.participantByLineId.set(lineUserId, { ...participant, latestAssessmentId: assessmentId, lastSeenAt: this.now() });
            return;
          }
        }
        throw new Error('Participant not found.');
      },
    };
    this.assessments = {
      append: async (assessment) => {
        if (this.assessmentsById.has(assessment.assessmentId)) throw new Error('Assessment IDs are append-only.');
        this.assessmentsById.set(assessment.assessmentId, assessment);
        const history = this.assessmentIdsByParticipant.get(assessment.participantId) ?? [];
        this.assessmentIdsByParticipant.set(assessment.participantId, [...history, assessment.assessmentId]);
        return assessment;
      },
      findById: async (assessmentId) => this.assessmentsById.get(assessmentId) ?? null,
      findLatestForParticipant: async (participantId) => {
        const history = this.assessmentIdsByParticipant.get(participantId) ?? [];
        const latestId = history.at(-1);
        return latestId ? this.assessmentsById.get(latestId) ?? null : null;
      },
    };
    this.reports = {
      save: async (report) => {
        this.reportsByAssessmentId.set(report.assessmentId, report);
        return report;
      },
      findByAssessmentId: async (assessmentId) => this.reportsByAssessmentId.get(assessmentId) ?? null,
    };
    this.events = {
      findById: async (eventId) => this.eventById.get(eventId) ?? null,
      setCurrentPresenterAssessment: async (eventId, assessmentId) => {
        const event = this.eventById.get(eventId);
        if (!event) throw new Error('Event not found.');
        this.eventById.set(eventId, { ...event, currentPresenterAssessmentId: assessmentId });
      },
    };
  }
}
