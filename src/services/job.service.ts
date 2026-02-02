/**
 * Job History Service
 *
 * Manages async job tracking for file uploads, URL crawls, video generation, etc.
 */

import { db } from "../db/client.ts";
import type {
  JobHistory,
  JobHistoryStatus,
  JobHistoryType,
} from "../db/schema.ts";
import { NotFoundError, ForbiddenError } from "../utils/errors.ts";

export interface CreateJobInput {
  applicationId: string;
  workflowId: string;
  jobType: JobHistoryType;
  displayName?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateJobInput {
  status?: JobHistoryStatus;
  displayName?: string;
  metadata?: Record<string, unknown>;
  errorMessage?: string;
  completedAt?: Date;
}

export interface ListJobsOptions {
  applicationId: string;
  userId: string;
  status?: JobHistoryStatus;
  jobType?: JobHistoryType;
  limit?: number;
  offset?: number;
}

class JobService {
  /**
   * Get a job by workflow ID with authorization check
   */
  async getByWorkflowId(
    workflowId: string,
    userId: string
  ): Promise<JobHistory> {
    const job = await db
      .selectFrom("app.job_history")
      .selectAll()
      .where("workflowId", "=", workflowId)
      .executeTakeFirst();

    if (!job) {
      throw new NotFoundError("Job");
    }

    // Check user has access to the application
    const hasAccess = await this.checkUserAccess(job.applicationId, userId);
    if (!hasAccess) {
      throw new ForbiddenError("You don't have access to this job");
    }

    return job;
  }

  /**
   * Get a job by ID with authorization check
   */
  async get(id: number, userId: string): Promise<JobHistory> {
    const job = await db
      .selectFrom("app.job_history")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    if (!job) {
      throw new NotFoundError("Job");
    }

    // Check user has access to the application
    const hasAccess = await this.checkUserAccess(job.applicationId, userId);
    if (!hasAccess) {
      throw new ForbiddenError("You don't have access to this job");
    }

    return job;
  }

  /**
   * List jobs for an application
   */
  async list(options: ListJobsOptions): Promise<JobHistory[]> {
    const {
      applicationId,
      userId,
      status,
      jobType,
      limit = 50,
      offset = 0,
    } = options;

    // Check user has access to the application
    const hasAccess = await this.checkUserAccess(applicationId, userId);
    if (!hasAccess) {
      throw new ForbiddenError("You don't have access to this application");
    }

    let query = db
      .selectFrom("app.job_history")
      .selectAll()
      .where("applicationId", "=", applicationId)
      .orderBy("createdAt", "desc")
      .limit(limit)
      .offset(offset);

    if (status) {
      query = query.where("status", "=", status);
    }

    if (jobType) {
      query = query.where("jobType", "=", jobType);
    }

    return await query.execute();
  }

  /**
   * Create a new job
   */
  async create(input: CreateJobInput): Promise<JobHistory> {
    const result = await db
      .insertInto("app.job_history")
      .values({
        applicationId: input.applicationId,
        workflowId: input.workflowId,
        jobType: input.jobType,
        status: "PENDING",
        displayName: input.displayName ?? null,
        metadata: input.metadata ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return result;
  }

  /**
   * Update a job
   */
  async update(workflowId: string, input: UpdateJobInput): Promise<JobHistory> {
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (input.status !== undefined) {
      updateData.status = input.status;
    }
    if (input.displayName !== undefined) {
      updateData.displayName = input.displayName;
    }
    if (input.metadata !== undefined) {
      updateData.metadata = input.metadata;
    }
    if (input.errorMessage !== undefined) {
      updateData.errorMessage = input.errorMessage;
    }
    if (input.completedAt !== undefined) {
      updateData.completedAt = input.completedAt;
    }

    const result = await db
      .updateTable("app.job_history")
      .set(updateData)
      .where("workflowId", "=", workflowId)
      .returningAll()
      .executeTakeFirst();

    if (!result) {
      throw new NotFoundError("Job");
    }

    return result;
  }

  /**
   * Mark a job as active
   */
  async markActive(workflowId: string): Promise<JobHistory> {
    return this.update(workflowId, {
      status: "ACTIVE",
    });
  }

  /**
   * Mark a job as complete
   */
  async markComplete(workflowId: string): Promise<JobHistory> {
    return this.update(workflowId, {
      status: "COMPLETE",
      completedAt: new Date(),
    });
  }

  /**
   * Mark a job as failed
   */
  async markError(
    workflowId: string,
    errorMessage: string
  ): Promise<JobHistory> {
    return this.update(workflowId, {
      status: "ERROR",
      errorMessage,
      completedAt: new Date(),
    });
  }

  /**
   * Mark a job as cancelled
   */
  async markCancelled(workflowId: string): Promise<JobHistory> {
    return this.update(workflowId, {
      status: "CANCELLED",
      completedAt: new Date(),
    });
  }

  /**
   * Check if a user has access to an application via workspace membership
   */
  private async checkUserAccess(
    applicationId: string,
    userId: string
  ): Promise<boolean> {
    const result = await db
      .selectFrom("app.applications as a")
      .innerJoin(
        "app.workspace_members as wm",
        "wm.workspaceId",
        "a.workspaceId"
      )
      .select("a.id")
      .where("a.id", "=", applicationId)
      .where("wm.userId", "=", userId)
      .executeTakeFirst();

    return result !== undefined;
  }
}

export const jobService = new JobService();
