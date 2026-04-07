import { AccountRepository } from '../repositories/account.repo';
import { AutoAssignmentRuleRepository } from '../repositories/auto-assignment-rule.repo';
import { EnvelopeRepository } from '../repositories/envelope.repo';
import { UserRepository } from '../repositories/user.repo';
import {
  AccountEnvelope,
  Account,
  AutoAssignmentMatchType,
  AutoAssignmentRuleDetails,
} from '../types';

export class AutoAssignmentRuleService {
  private repo = new AutoAssignmentRuleRepository();
  private userRepo = new UserRepository();
  private accountRepo = new AccountRepository();
  private envelopeRepo = new EnvelopeRepository();

  list(userId: number): AutoAssignmentRuleDetails[] {
    this.ensureUserExists(userId);
    return this.repo.listByUser(userId);
  }

  findById(id: number, userId: number): AutoAssignmentRuleDetails {
    this.ensureUserExists(userId);
    const rule = this.repo.findById(id);

    if (!rule || rule.user_id !== userId) {
      throw {
        code: 'NOT_FOUND',
        message: 'Auto assignment rule not found',
      };
    }

    return rule;
  }

  create(input: {
    userId: number;
    pattern: string;
    matchType: AutoAssignmentMatchType;
    accountId: number | null;
    accountEnvelopeId: number | null;
    priority: number;
    isActive: boolean;
    notes?: string | null;
  }): AutoAssignmentRuleDetails {
    const normalized = this.normalizeRuleInput(input);

    return this.repo.create({
      userId: normalized.userId,
      pattern: normalized.pattern,
      matchType: normalized.matchType,
      accountId: normalized.accountId,
      accountEnvelopeId: normalized.accountEnvelopeId,
      priority: normalized.priority,
      isActive: normalized.isActive ? 1 : 0,
      notes: normalized.notes,
    });
  }

  update(
    id: number,
    input: {
      userId: number;
      pattern?: string;
      matchType?: AutoAssignmentMatchType;
      accountId?: number | null;
      accountEnvelopeId?: number | null;
      priority?: number;
      isActive?: boolean;
      notes?: string | null;
    },
  ): AutoAssignmentRuleDetails {
    const existing = this.findById(id, input.userId);

    const normalized = this.normalizeRuleInput({
      userId: input.userId,
      pattern: input.pattern ?? existing.pattern,
      matchType: input.matchType ?? existing.match_type,
      accountId: input.accountId !== undefined ? input.accountId : existing.account_id,
      accountEnvelopeId:
        input.accountEnvelopeId !== undefined
          ? input.accountEnvelopeId
          : existing.account_envelope_id,
      priority: input.priority ?? existing.priority,
      isActive: input.isActive ?? existing.is_active === 1,
      notes: input.notes !== undefined ? input.notes : existing.notes,
    });

    const updated = this.repo.update(id, {
      pattern: input.pattern !== undefined ? normalized.pattern : undefined,
      matchType: input.matchType !== undefined ? normalized.matchType : undefined,
      accountId: input.accountId !== undefined ? normalized.accountId : undefined,
      accountEnvelopeId:
        input.accountEnvelopeId !== undefined ? normalized.accountEnvelopeId : undefined,
      priority: input.priority !== undefined ? normalized.priority : undefined,
      isActive: input.isActive !== undefined ? (normalized.isActive ? 1 : 0) : undefined,
      notes: input.notes !== undefined ? normalized.notes : undefined,
    });

    if (!updated) {
      throw {
        code: 'NOT_FOUND',
        message: 'Auto assignment rule not found',
      };
    }

    return updated;
  }

  setStatus(id: number, userId: number, isActive: boolean): AutoAssignmentRuleDetails {
    this.findById(id, userId);

    const updated = this.repo.update(id, {
      isActive: isActive ? 1 : 0,
    });

    if (!updated) {
      throw {
        code: 'NOT_FOUND',
        message: 'Auto assignment rule not found',
      };
    }

    return updated;
  }

  remove(id: number, userId: number): void {
    this.setStatus(id, userId, false);
  }

  test(userId: number, description: string): {
    description: string;
    matched: boolean;
    matchedRule: AutoAssignmentRuleDetails | null;
    matches: AutoAssignmentRuleDetails[];
  } {
    this.ensureUserExists(userId);
    const normalizedDescription = description.trim();

    if (normalizedDescription.length === 0) {
      throw {
        code: 'VALIDATION_ERROR',
        message: 'description is required.',
        details: [{ field: 'description', detail: 'Provide a non-empty description.' }],
      };
    }

    const matches = this.repo
      .listActiveByUser(userId)
      .filter((rule) => this.matches(normalizedDescription, rule.pattern, rule.match_type));

    return {
      description: normalizedDescription,
      matched: matches.length > 0,
      matchedRule: matches[0] ?? null,
      matches,
    };
  }

  private normalizeRuleInput(input: {
    userId: number;
    pattern: string;
    matchType: AutoAssignmentMatchType;
    accountId: number | null;
    accountEnvelopeId: number | null;
    priority: number;
    isActive: boolean;
    notes?: string | null;
  }) {
    this.ensureUserExists(input.userId);

    const normalizedPattern = input.pattern.trim();
    if (normalizedPattern.length === 0) {
      throw {
        code: 'VALIDATION_ERROR',
        message: 'pattern is required.',
        details: [{ field: 'pattern', detail: 'Provide a non-empty pattern.' }],
      };
    }

    if (!Number.isInteger(input.priority)) {
      throw {
        code: 'VALIDATION_ERROR',
        message: 'priority must be an integer.',
        details: [{ field: 'priority', detail: 'Use a whole number priority.' }],
      };
    }

    if (input.accountId === null && input.accountEnvelopeId === null) {
      throw {
        code: 'VALIDATION_ERROR',
        message: 'Provide at least one target.',
        details: [
          {
            field: 'accountId',
            detail: 'Choose an account, an envelope, or both.',
          },
        ],
      };
    }

    const account = input.accountId !== null ? this.requireActiveAccount(input.accountId) : null;
    if (account && account.user_id !== input.userId) {
      throw {
        code: 'FORBIDDEN',
        message: 'The selected account does not belong to the user.',
        details: [{ field: 'accountId', detail: 'Choose an account owned by the same user.' }],
      };
    }

    const envelope =
      input.accountEnvelopeId !== null ? this.requireActiveEnvelope(input.accountEnvelopeId) : null;
    if (envelope) {
      const envelopeAccount = this.requireActiveAccount(envelope.account_id);
      if (envelopeAccount.user_id !== input.userId) {
        throw {
          code: 'FORBIDDEN',
          message: 'The selected envelope does not belong to the user.',
          details: [
            {
              field: 'accountEnvelopeId',
              detail: 'Choose an envelope owned by the same user.',
            },
          ],
        };
      }

      if (account && envelope.account_id !== account.id) {
        throw {
          code: 'VALIDATION_ERROR',
          message: 'accountId and accountEnvelopeId must be coherent.',
          details: [
            {
              field: 'accountEnvelopeId',
              detail: 'The selected envelope belongs to a different account.',
            },
          ],
        };
      }
    }

    if (input.matchType === 'REGEX') {
      try {
        new RegExp(normalizedPattern, 'i');
      } catch {
        throw {
          code: 'VALIDATION_ERROR',
          message: 'pattern is not a valid regular expression.',
          details: [{ field: 'pattern', detail: 'Provide a valid regular expression.' }],
        };
      }
    }

    return {
      userId: input.userId,
      pattern: normalizedPattern,
      matchType: input.matchType,
      accountId: account?.id ?? null,
      accountEnvelopeId: envelope?.id ?? null,
      priority: input.priority,
      isActive: input.isActive,
      notes: input.notes?.trim() ? input.notes.trim() : null,
    };
  }

  private requireActiveAccount(accountId: number): Account {
    const account = this.accountRepo.findById(accountId);
    if (!account) {
      throw {
        code: 'NOT_FOUND',
        message: 'Account not found',
        details: [{ field: 'accountId', detail: `Account ${accountId} was not found.` }],
      };
    }

    if (!this.accountRepo.isActive(accountId)) {
      throw {
        code: 'INACTIVE_RESOURCE',
        message: 'Account is inactive',
        details: [{ field: 'accountId', detail: `Account ${accountId} is inactive.` }],
      };
    }

    return account;
  }

  private requireActiveEnvelope(envelopeId: number): AccountEnvelope {
    const envelope = this.envelopeRepo.findById(envelopeId);
    if (!envelope) {
      throw {
        code: 'NOT_FOUND',
        message: 'Envelope not found',
        details: [{ field: 'accountEnvelopeId', detail: `Envelope ${envelopeId} was not found.` }],
      };
    }

    if (!this.envelopeRepo.isActive(envelopeId)) {
      throw {
        code: 'INACTIVE_RESOURCE',
        message: 'Envelope is inactive',
        details: [
          {
            field: 'accountEnvelopeId',
            detail: `Envelope ${envelopeId} is inactive.`,
          },
        ],
      };
    }

    return envelope;
  }

  private ensureUserExists(userId: number): void {
    if (!this.userRepo.findById(userId)) {
      throw {
        code: 'NOT_FOUND',
        message: `User ${userId} not found`,
      };
    }
  }

  private matches(
    description: string,
    pattern: string,
    matchType: AutoAssignmentMatchType,
  ): boolean {
    const source = description.toLowerCase();
    const needle = pattern.toLowerCase();

    switch (matchType) {
      case 'EXACT':
        return source === needle;
      case 'STARTS_WITH':
        return source.startsWith(needle);
      case 'ENDS_WITH':
        return source.endsWith(needle);
      case 'REGEX':
        return new RegExp(pattern, 'i').test(description);
      case 'CONTAINS':
      default:
        return source.includes(needle);
    }
  }
}
