import { randomUUID } from 'node:crypto';
import type { AIReport, AssessmentRecord, Identity, Participant } from './contracts';
import type { EventRecord } from './contracts';
import type { SubjectRecord } from './subject';

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
  listForSubject(subjectId: string): Promise<AssessmentRecord[]>;
}

export interface SubjectsRepository {
  create(subject: SubjectRecord): Promise<SubjectRecord>;
  findById(subjectId: string): Promise<SubjectRecord | null>;
  findByClaimTokenHash(tokenHash: string): Promise<SubjectRecord | null>;
  findSelfForParticipant(participantId: string): Promise<SubjectRecord | null>;
  listForParticipant(participantId: string): Promise<SubjectRecord[]>;
  update(subjectId: string, patch: Partial<SubjectRecord>): Promise<SubjectRecord>;
  setLastAssessment(subjectId: string, assessmentId: string): Promise<void>;
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
  subjects: SubjectsRepository;
  assessments: AssessmentsRepository;
  reports: AIReportsRepository;
  events: EventsRepository;
}

/** Simple process-local adapter used only for local development and deterministic tests. */
export class InMemoryRepositories implements Repositories {
  readonly participants: ParticipantsRepository;
  readonly subjects: SubjectsRepository;
  readonly assessments: AssessmentsRepository;
  readonly reports: AIReportsRepository;
  readonly events: EventsRepository;

  private readonly participantByLineId = new Map<string, Participant>();
  private readonly subjectsById = new Map<string, SubjectRecord>();
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
    this.subjects = {
      create: async (subject) => {
        if (this.subjectsById.has(subject.subjectId)) throw new Error('Subject IDs are unique.');
        this.subjectsById.set(subject.subjectId, subject);
        return subject;
      },
      findById: async (subjectId) => this.subjectsById.get(subjectId) ?? null,
      findByClaimTokenHash: async (tokenHash) => [...this.subjectsById.values()].find((subject) => subject.claimTokenHash === tokenHash) ?? null,
      findSelfForParticipant: async (participantId) => {
        for (const subject of this.subjectsById.values()) {
          if (subject.createdByParticipantId === participantId && subject.subjectKind === 'self' && !subject.archived) return subject;
        }
        return null;
      },
      listForParticipant: async (participantId) => [...this.subjectsById.values()].filter((subject) =>
        !subject.archived && (subject.ownerParticipantId === participantId ||
          (subject.claimStatus === 'unclaimed' && subject.createdByParticipantId === participantId))),
      update: async (subjectId, patch) => {
        const existing = this.subjectsById.get(subjectId);
        if (!existing) throw new Error('Subject not found.');
        const updated = { ...existing, ...patch, subjectId, updatedAt: patch.updatedAt ?? this.now() };
        this.subjectsById.set(subjectId, updated);
        return updated;
      },
      setLastAssessment: async (subjectId, assessmentId) => {
        await this.subjects.update(subjectId, { lastAssessmentId: assessmentId });
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
        const latestId = history[history.length - 1];
        return latestId ? this.assessmentsById.get(latestId) ?? null : null;
      },
      listForSubject: async (subjectId) => [...this.assessmentsById.values()]
        .filter((assessment) => assessment.subjectId === subjectId)
        .sort((left, right) => right.completedAt.localeCompare(left.completedAt)),
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
